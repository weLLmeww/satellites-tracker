import './style.css';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import * as Cesium from 'cesium';
import * as satellite from 'satellite.js';
import { fetchSatellitesData, fetchMeta } from './api.js';

// ==========================================
// 1. ИНИЦИАЛИЗАЦИЯ CESIUM
// ==========================================
const viewer = new Cesium.Viewer('cesiumContainer', {
    terrainProvider: undefined,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    animation: true,
    timeline: true,
    selectionIndicator: false, // отключаем — мешает при клике на примитивы
    sceneModePicker: false,
    shouldAnimate: true
});

// FPS счётчик для отладки (убери в продакшне)
// viewer.scene.debugShowFramesPerSecond = true;

viewer.scene.globe.enableLighting = true;

// ==========================================
// 2. ГЛОБАЛЬНОЕ СОСТОЯНИЕ
// ==========================================
let satellitesData = [];       // массив данных со спутниками
let activeSatelliteId = null;  // id выбранного спутника

// Карта: satId -> { satrec, pointPrimitive, meta }
const satMap = new Map();

// Кеш для орбит: создаём только при первом клике
const orbitCache = new Map();

// Ссылки на активные примитивы выбранного спутника
let activePathEntity = null;
let activeEllipseEntity = null;
let activeOrbitPolyline = null;
let observerEntity = null;

// ==========================================
// 3. КЛЮЧЕВАЯ ОПТИМИЗАЦИЯ: PointPrimitiveCollection
// ==========================================
// Все 100 спутников рисуются за ОДИН draw call вместо 100
const pointCollection = viewer.scene.primitives.add(
    new Cesium.PointPrimitiveCollection()
);

// ==========================================
// 4. WEB WORKER
// ==========================================
const passPredictionWorker = new Worker(
    new URL('./passWorker.js', import.meta.url),
    { type: 'module' }
);

// ==========================================
// 5. СОЗДАНИЕ СПУТНИКА (ОПТИМИЗИРОВАННОЕ)
// ==========================================
function createSatelliteEntry(satData) {
    const satrec = satellite.twoline2satrec(satData.tle1, satData.tle2);

    // Добавляем точку в коллекцию (1 draw call на всю коллекцию).
    // Позиция обновляется вручную в onTick — не через Property.
    const pointPrimitive = pointCollection.add({
        position: new Cesium.Cartesian3(), // заполнится на первом тике
        pixelSize: 6,
        color: Cesium.Color.PLUM,
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
        id: `sat-${satData.id}` // для pick по клику
    });

    satMap.set(satData.id, {
        satrec,
        pointPrimitive,
        meta: satData,
        show: true
    });
}

// ==========================================
// 5b. SampledPositionProperty — только для АКТИВНОГО спутника
// ==========================================
// Создаём SampledPositionProperty с окном ±30 минут от текущего момента.
// Это нужно для path и ellipse, которым требуется настоящий PositionProperty
// с поддержкой getValueInReferenceFrame. Строим только для одного спутника.
function buildSampledPosition(satrec) {
    const positionProperty = new Cesium.SampledPositionProperty();
    positionProperty.setInterpolationOptions({
        interpolationDegree: 3,
        interpolationAlgorithm: Cesium.LagrangePolynomialApproximation
    });

    const startTime = viewer.clock.currentTime;
    // Окно: от -5 до +30 минут, шаг 1 минута — итого 36 точек.
    // Этого достаточно для плавного хвоста и зоны покрытия.
    for (let i = -5; i <= 30; i += 1) {
        const julianTime = Cesium.JulianDate.addMinutes(startTime, i, new Cesium.JulianDate());
        const jsDate = Cesium.JulianDate.toDate(julianTime);
        const posVel = satellite.propagate(satrec, jsDate);
        if (posVel.position) {
            const gmst = satellite.gstime(jsDate);
            const gd = satellite.eciToGeodetic(posVel.position, gmst);
            positionProperty.addSample(
                julianTime,
                Cesium.Cartesian3.fromRadians(gd.longitude, gd.latitude, gd.height * 1000)
            );
        }
    }
    return positionProperty;
}

// ==========================================
// 6. ОБНОВЛЕНИЕ ПОЗИЦИЙ ВСЕХ СПУТНИКОВ (onTick)
// ==========================================
// Scratch-объекты вне цикла — не создаём мусор для GC
const scratchTime = new Cesium.JulianDate();

viewer.clock.onTick.addEventListener(function (clock) {
    const currentTime = clock.currentTime;
    const jsDate = Cesium.JulianDate.toDate(currentTime);

    for (const [satId, entry] of satMap) {
        if (!entry.show) continue;

        const posVel = satellite.propagate(entry.satrec, jsDate);
        if (!posVel.position) continue;

        const gmst = satellite.gstime(jsDate);
        const gd = satellite.eciToGeodetic(posVel.position, gmst);
        entry.pointPrimitive.position = Cesium.Cartesian3.fromRadians(
            gd.longitude,
            gd.latitude,
            gd.height * 1000
        );
    }

    // Обновление DOM карточки — не чаще 2 раз в секунду
    updateSatCardCoords(currentTime);
});

// ==========================================
// 7. ОБНОВЛЕНИЕ КООРДИНАТ В КАРТОЧКЕ
// ==========================================
let lastDomUpdate = 0;

function updateSatCardCoords(currentTime) {
    const now = performance.now();
    if (now - lastDomUpdate < 500) return;
    if (!activeSatelliteId) return;
    if (document.getElementById('satCard').style.display !== 'block') return;

    const entry = satMap.get(activeSatelliteId);
    if (!entry) return;

    const pos = entry.pointPrimitive.position;
    if (!pos || (pos.x === 0 && pos.y === 0 && pos.z === 0)) return;

    const cartographic = Cesium.Cartographic.fromCartesian(pos);
    const lon = Cesium.Math.toDegrees(cartographic.longitude).toFixed(4);
    const lat = Cesium.Math.toDegrees(cartographic.latitude).toFixed(4);
    document.getElementById('satCoords').innerText = `Ш: ${lat}°\nД: ${lon}°`;
    lastDomUpdate = now;
}

// ==========================================
// 8. ОРБИТА (LAZY — только при клике)
// ==========================================
function getOrbitPositions(satrec, periodMin) {
    const positions = [];
    const now = new Date();
    for (let i = 0; i <= periodMin; i += 3) {
        const time = new Date(now.getTime() + i * 60000);
        const posVel = satellite.propagate(satrec, time);
        if (posVel.position) {
            const gmst = satellite.gstime(time);
            const gd = satellite.eciToGeodetic(posVel.position, gmst);
            positions.push(
                Cesium.Cartesian3.fromRadians(gd.longitude, gd.latitude, gd.height * 1000)
            );
        }
    }
    return positions;
}

function showActiveSatelliteDetails(satId) {
    const entry = satMap.get(satId);
    if (!entry) return;

    // Строим SampledPositionProperty только для этого спутника.
    // path и ellipse требуют настоящий PositionProperty (getValueInReferenceFrame).
    // Строим окно ±5..+30 минут — 36 точек, достаточно для хвоста и зоны покрытия.
    const sampledPos = buildSampledPosition(entry.satrec);

    // --- Орбита (lazy: создаём один раз, кешируем) ---
    if (!orbitCache.has(satId)) {
        const positions = getOrbitPositions(entry.satrec, entry.meta.period || 100);
        const orbitEntity = viewer.entities.add({
            id: `orbit-${satId}`,
            polyline: {
                positions,
                width: 1,
                material: Cesium.Color.YELLOW.withAlpha(0.3),
            }
        });
        orbitCache.set(satId, orbitEntity);
    }
    activeOrbitPolyline = orbitCache.get(satId);
    activeOrbitPolyline.show = true;

    // --- Зона покрытия (только для одного активного спутника) ---
    if (activeEllipseEntity) {
        viewer.entities.remove(activeEllipseEntity);
        activeEllipseEntity = null;
    }

    const EARTH_RADIUS_KM = 6371;

    // Вычисляем реальный радиус покрытия из текущей позиции спутника.
    // CallbackProperty позволяет пересчитывать его каждый кадр —
    // радиус меняется по мере движения (LEO эллиптические орбиты меняют высоту).
    const ellipsePositionCb = new Cesium.CallbackProperty((time, result) => {
        const pt = entry.pointPrimitive.position;
        if (!pt) return undefined;
        const carto = Cesium.Cartographic.fromCartesian(pt);
        return Cesium.Cartesian3.fromRadians(
            carto.longitude, carto.latitude, 0,
            Cesium.Ellipsoid.WGS84, result
        );
    }, false);

    // Радиус зоны покрытия — тоже CallbackProperty.
    // Реальная высота берётся из текущей позиции pointPrimitive каждый кадр.
    // Формула: R_earth * arccos(R_earth / (R_earth + h))
    // Это угол наблюдения с горизонта (elevation = 0°), т.е. максимальная зона видимости.
    const coverageRadiusCb = new Cesium.CallbackProperty(() => {
        const pt = entry.pointPrimitive.position;
        if (!pt) return 1000000; // fallback 1000 км

        const carto = Cesium.Cartographic.fromCartesian(pt);
        // height в метрах → переводим в км
        const altKm = carto.height / 1000;

        if (altKm <= 0) return 1000000;

        // Угол между вертикалью наблюдателя и линией к спутнику на горизонте
        const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altKm);
        // Защита от выхода за пределы arccos
        const clampedRatio = Math.min(1, Math.max(-1, ratio));
        const halfAngleRad = Math.acos(clampedRatio);

        // Дуговое расстояние на поверхности Земли в метрах
        return EARTH_RADIUS_KM * halfAngleRad * 1000;
    }, false);

    activeEllipseEntity = viewer.entities.add({
        position: ellipsePositionCb,
        ellipse: {
            semiMinorAxis: coverageRadiusCb,
            semiMajorAxis: coverageRadiusCb,
            material: Cesium.Color.CYAN.withAlpha(0.12),
            outline: true,
            outlineColor: Cesium.Color.CYAN.withAlpha(0.5),
            outlineWidth: 1,
            height: 0,
        }
    });

    // --- Хвост (path) только для выбранного спутника ---
    if (activePathEntity) {
        viewer.entities.remove(activePathEntity);
        activePathEntity = null;
    }
    activePathEntity = viewer.entities.add({
        position: sampledPos,   // тот же SampledPositionProperty
        path: {
            resolution: 60,  // шаг интерполяции в секундах (1 минута)
            material: new Cesium.ColorMaterialProperty(Cesium.Color.YELLOW.withAlpha(0.7)),
            width: 2,
            leadTime: 0,
            trailTime: 60 * 20  // 20-минутный хвост только у выбранного
        }
    });
}

function hideActiveSatelliteDetails() {
    if (activeOrbitPolyline) {
        activeOrbitPolyline.show = false;
        activeOrbitPolyline = null;
    }
    if (activeEllipseEntity) {
        viewer.entities.remove(activeEllipseEntity);
        activeEllipseEntity = null;
    }
    if (activePathEntity) {
        viewer.entities.remove(activePathEntity);
        activePathEntity = null;
    }
}

// ==========================================
// 9. ЗАГРУЗКА И ИНИЦИАЛИЗАЦИЯ
// ==========================================
async function initApp() {
    const loader = document.getElementById('loader');
    const loaderText = document.getElementById('loaderText');

    try {
        loaderText.innerText = "Загрузка TLE данных...";

        const [satellites, metaData] = await Promise.all([
            fetchSatellitesData(),
            fetchMeta()
        ]);

        satellitesData = satellites;
        populateFilters(metaData);

        loaderText.innerText = "Расчет орбит...";

        // Рендерим порциями, чтобы не вешать поток
        const chunkSize = 10;
        let currentIndex = 0;

        function renderChunk() {
            const chunk = satellitesData.slice(currentIndex, currentIndex + chunkSize);
            chunk.forEach(createSatelliteEntry);
            currentIndex += chunkSize;

            if (currentIndex < satellitesData.length) {
                loaderText.innerText = `Инициализация: ${currentIndex} / ${satellitesData.length}`;
                requestAnimationFrame(renderChunk);
            } else {
                loader.style.opacity = '0';
                setTimeout(() => (loader.style.display = 'none'), 500);
            }
        }

        requestAnimationFrame(renderChunk);
    } catch (error) {
        loaderText.innerText = "Ошибка загрузки данных!";
        loaderText.style.color = "red";
        console.error(error);
    }
}

function populateFilters(meta) {
    const countrySelect = document.getElementById('filterCountry');
    const orbitSelect = document.getElementById('filterOrbit');
    const purposeSelect = document.getElementById('filterPurpose');

    if (!countrySelect || !orbitSelect || !purposeSelect) return;

    countrySelect.innerHTML = '<option value="ALL">Все страны</option>';
    meta.countries.forEach(c => {
        countrySelect.innerHTML += `<option value="${c}">${c}</option>`;
    });

    orbitSelect.innerHTML = '<option value="ALL">Все орбиты</option>';
    meta.orbits.forEach(o => {
        orbitSelect.innerHTML += `<option value="${o}">${o}</option>`;
    });

    purposeSelect.innerHTML = '<option value="ALL">Все назначения</option>';
    meta.types.forEach(t => {
        purposeSelect.innerHTML += `<option value="${t}">${t}</option>`;
    });
}

initApp();

// ==========================================
// 10. ФИЛЬТРАЦИЯ
// ==========================================
function applyFilters() {
    const country = document.getElementById('filterCountry').value;
    const orbit = document.getElementById('filterOrbit').value;
    const purpose = document.getElementById('filterPurpose').value;

    for (const [satId, entry] of satMap) {
        const sat = entry.meta;
        let show = true;

        if (country !== 'ALL' && sat.country !== country) show = false;
        if (orbit !== 'ALL' && sat.orbitType !== orbit) show = false;
        if (purpose !== 'ALL' && sat.purpose !== purpose) show = false;

        entry.show = show;
        entry.pointPrimitive.show = show;

        // Если скрываем активный — закрываем карточку
        if (!show && activeSatelliteId === satId) {
            closeSatelliteCard();
        }
    }
}

document.getElementById('filterCountry').addEventListener('change', applyFilters);
document.getElementById('filterOrbit').addEventListener('change', applyFilters);
document.getElementById('filterPurpose').addEventListener('change', applyFilters);

// ==========================================
// 11. КЛИК ПО СПУТНИКУ
// ==========================================
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

handler.setInputAction((movement) => {
    // Shift + клик — установка наблюдателя (обрабатывается ниже)
    // Обычный клик — выбор спутника

    const pickedObject = viewer.scene.pick(movement.position);

    // Скрываем детали предыдущего
    if (activeSatelliteId) {
        hideActiveSatelliteDetails();
    }

    // PointPrimitive хранит id в поле .id
    if (
        Cesium.defined(pickedObject) &&
        pickedObject.primitive instanceof Cesium.PointPrimitive &&
        typeof pickedObject.primitive.id === 'string' &&
        pickedObject.primitive.id.startsWith('sat-')
    ) {
        const satId = parseInt(pickedObject.primitive.id.replace('sat-', ''), 10);
        const entry = satMap.get(satId);
        if (!entry) return;

        activeSatelliteId = satId;
        const props = entry.meta;

        // Показываем детали нового выбранного
        showActiveSatelliteDetails(satId);

        // Высота — из реальной текущей позиции через satellite.js (надёжнее поля из API)
        const nowDate = new Date();
        const posVelNow = satellite.propagate(entry.satrec, nowDate);
        let altKmReal = null;
        if (posVelNow && posVelNow.position) {
            const gmstNow = satellite.gstime(nowDate);
            const gdNow = satellite.eciToGeodetic(posVelNow.position, gmstNow);
            altKmReal = gdNow.height; // уже в км
        }
        // Период — из TLE напрямую (строка 2, поле 8: средн. движение об/день → мин)
        // satrec.no — среднее движение в рад/мин
        const periodMinReal = entry.satrec.no > 0
            ? (2 * Math.PI / entry.satrec.no).toFixed(1)
            : null;

        const altVal = altKmReal !== null
            ? altKmReal.toFixed(0)
            : (props.altitude ?? props.alt ?? props.height_km ?? '—');
        const periodVal = periodMinReal
            ?? (props.period ?? props.orbital_period ?? props.period_min ?? '—');

        document.getElementById('satName').innerText = props.name || '—';
        document.getElementById('satCountry').innerText = props.country || '—';
        document.getElementById('satOrbitType').innerText = props.orbitType || props.orbit || '—';
        document.getElementById('satPurpose').innerText = props.purpose || props.type || '—';
        document.getElementById('satAlt').innerText = altVal;
        document.getElementById('satPeriod').innerText = periodVal;
        document.getElementById('satCard').style.display = 'block';
    } else {
        closeSatelliteCard();
    }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// ==========================================
// 12. ЗАКРЫТИЕ КАРТОЧКИ
// ==========================================
function closeSatelliteCard() {
    document.getElementById('satCard').style.display = 'none';
    hideActiveSatelliteDetails();
    activeSatelliteId = null;
}

document.getElementById('closeCardBtn').addEventListener('click', closeSatelliteCard);

// ==========================================
// 13. ПЕРЕКЛЮЧЕНИЕ 2D / 3D
// ==========================================
const viewModeBtn = document.getElementById('viewModeBtn');
viewModeBtn.addEventListener('click', () => {
    if (viewer.scene.mode === Cesium.SceneMode.SCENE3D) {
        viewer.scene.morphTo2D(1.0);
        viewModeBtn.innerText = "Переключить в 3D";
    } else {
        viewer.scene.morphTo3D(1.0);
        viewModeBtn.innerText = "Переключить в 2D";
    }
});

// ==========================================
// 14. РАСЧЁТ ПРОЛЁТОВ (SHIFT + КЛИК + WEB WORKER)
// ==========================================
handler.setInputAction((movement) => {
    const ray = viewer.camera.getPickRay(movement.position);
    const cartesian = viewer.scene.globe.pick(ray, viewer.scene);

    if (cartesian) {
        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const observerLocation = {
            longitude: cartographic.longitude,
            latitude: cartographic.latitude,
            height: cartographic.height / 1000
        };

        if (observerEntity) viewer.entities.remove(observerEntity);
        observerEntity = viewer.entities.add({
            position: cartesian,
            point: {
                pixelSize: 10,
                color: Cesium.Color.LIME,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 2
            },
            label: {
                text: 'Наблюдатель',
                font: '14pt sans-serif',
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                pixelOffset: new Cesium.Cartesian2(0, -15)
            }
        });

        const passesListDiv = document.getElementById('passesList');
        passesListDiv.innerHTML =
            '<p style="color:#63b3ed;text-align:center;">Анализ орбит (Worker)... ⏳</p>';

        passPredictionWorker.postMessage({
            observerCoords: observerLocation,
            satellites: satellitesData,
            startTime: Date.now()
        });
    }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK, Cesium.KeyboardEventModifier.SHIFT);

// ==========================================
// 15. ОТВЕТ ОТ WEB WORKER
// ==========================================
passPredictionWorker.onmessage = function (e) {
    const passes = e.data;
    const passesListDiv = document.getElementById('passesList');
    passesListDiv.innerHTML = '';

    if (passes.length === 0) {
        passesListDiv.innerHTML = '<p>Нет пролётов в ближайшие 24 часа.</p>';
        return;
    }

    passes.slice(0, 15).forEach(pass => {
        const passDate = new Date(pass.time);
        const timeStr = passDate.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        passesListDiv.innerHTML += `
            <div class="pass-item">
                <div><b>${pass.satName}</b></div>
                <div>Время: <span class="pass-time">${timeStr}</span> (Угол: ${Cesium.Math.toDegrees(pass.maxElevation).toFixed(1)}°)</div>
            </div>
        `;
    });
};