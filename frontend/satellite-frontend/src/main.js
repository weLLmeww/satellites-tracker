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
    selectionIndicator: false,
    sceneModePicker: false,
    shouldAnimate: true
});

// Освещение выключено — Земля остаётся яркой со всех сторон,
// чётко выделяется на тёмном фоне
viewer.scene.globe.enableLighting = false;

// ==========================================
// ОГРАНИЧЕНИЯ КАМЕРЫ
// ==========================================
const cameraCtrl = viewer.scene.screenSpaceCameraController;

// Нельзя влететь ближе 500 км к поверхности
cameraCtrl.minimumZoomDistance = 500000;
// Максимум — 80 000 км, все спутники (включая GEO на ~36 000 км) видны
cameraCtrl.maximumZoomDistance = 200000000;

// Инерция — убираем, камера не "уплывает" после отпускания
cameraCtrl.inertiaSpin = 0.5;
cameraCtrl.inertiaTranslate = 0;
cameraCtrl.inertiaZoom = 0.8;

// ==========================================
// ФОН — тёмно-серый, чуть светлее чёрного (UI панели заметны)
// ==========================================
viewer.scene.skyBox.show = false;
viewer.scene.skyAtmosphere.show = true;
// Светло-серый фон — панели с тёмным стеклом хорошо читаются
viewer.scene.backgroundColor = Cesium.Color.fromCssColorString('#2a2d35');

// ==========================================
// ЗЕМЛЯ — OpenStreetMap/ArcGIS, надёжная светлая текстура
// ==========================================
viewer.imageryLayers.removeAll();
viewer.imageryLayers.addImageryProvider(
    new Cesium.UrlTemplateImageryProvider({
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        credit: 'Esri World Imagery',
        maximumLevel: 19,
    })
);

// ==========================================
// 2. ГЛОБАЛЬНОЕ СОСТОЯНИЕ
// ==========================================
let satellitesData = [];
let activeSatelliteId = null;

// Координаты наблюдателя — сохраняем при Shift+клике,
// чтобы использовать при расчёте следующего пролёта в карточке
let currentObserverCoords = null;

const satMap = new Map();
const orbitCache = new Map();

let activePathEntity = null;
let activePathEntityFar = null;
let activeEllipseEntity = null;      // зона покрытия (elevation > 0°)
let activeRadioEllipseEntity = null; // зона радиовидимости (elevation > 10°)
let activeOrbitPolyline = null;
let observerEntity = null;

// ==========================================
// 3. КЛЮЧЕВАЯ ОПТИМИЗАЦИЯ: PointPrimitiveCollection
// ==========================================
// Все спутники рисуются за ОДИН draw call
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

// Если воркер упал — убираем спиннер, не оставляем вечную загрузку
passPredictionWorker.onerror = function (err) {
    console.error('passWorker error:', err);
    const passesListDiv = document.getElementById('passesList');
    if (passesListDiv) {
        passesListDiv.innerHTML = '<p class="hint-text">Ошибка расчёта пролётов.</p>';
    }
};

// ==========================================
// 5. ЦВЕТ ТОЧКИ ПО ТИПУ ОРБИТЫ
// ==========================================
function getOrbitColor(orbitType) {
    const t = (orbitType || '').toUpperCase();
    if (t.includes('LEO')) return Cesium.Color.fromCssColorString('#4FC3F7'); // голубой
    if (t.includes('MEO')) return Cesium.Color.fromCssColorString('#FFD54F'); // жёлтый
    if (t.includes('GEO')) return Cesium.Color.fromCssColorString('#EF5350'); // красный
    if (t.includes('HEO') || t.includes('MOL')) return Cesium.Color.fromCssColorString('#CE93D8'); // фиолетовый
    return Cesium.Color.CYAN;
}

// ==========================================
// 6. СОЗДАНИЕ СПУТНИКА (ОПТИМИЗИРОВАННОЕ)
// ==========================================
function createSatelliteEntry(satData) {
    const satrec = satellite.twoline2satrec(satData.tle1, satData.tle2);

    const pointPrimitive = pointCollection.add({
        position: new Cesium.Cartesian3(),
        pixelSize: 6,
<<<<<<< HEAD
        color: Cesium.Color.PLUM,
=======
        color: getOrbitColor(satData.orbitType),
>>>>>>> 4c01debf69c13c2fe09a39889c768d99e7c08a1c
        outlineColor: Cesium.Color.BLACK,
        outlineWidth: 1,
        id: `sat-${satData.id}`
    });

    satMap.set(satData.id, {
        satrec,
        pointPrimitive,
        meta: satData,
        show: true
    });
}


// ==========================================
// 7. SampledPositionProperty — скользящее окно
// ==========================================
// Строим окно ±90 минут от центра. Храним центр — и как только
// текущее время уходит дальше 60 минут от центра, перестраиваем.
// Это решает проблему при любой скорости симуляции без краша.

let _pathSatrec = null;           // satrec текущего активного спутника
let _pathWindowCenter = null;     // JulianDate центра текущего окна
const PATH_HALF_WINDOW = 90;      // минут в каждую сторону
const PATH_REBUILD_THRESHOLD = 60;// минут дрейфа до пересборки

function buildSampledPosition(satrec, centerJD) {
    const prop = new Cesium.SampledPositionProperty();
    prop.setInterpolationOptions({
        interpolationDegree: 5,
        interpolationAlgorithm: Cesium.LagrangePolynomialApproximation,
        forwardExtrapolationType: Cesium.ExtrapolationType.EXTRAPOLATE,
        backwardExtrapolationType: Cesium.ExtrapolationType.EXTRAPOLATE,
    });
    const center = centerJD || viewer.clock.currentTime;
    for (let i = -PATH_HALF_WINDOW; i <= PATH_HALF_WINDOW; i += 1) {
        const jt = Cesium.JulianDate.addMinutes(center, i, new Cesium.JulianDate());
        const jsDate = Cesium.JulianDate.toDate(jt);
        const posVel = satellite.propagate(satrec, jsDate);
        if (!posVel || !posVel.position) continue;
        const gmst = satellite.gstime(jsDate);
        const gd = satellite.eciToGeodetic(posVel.position, gmst);
        prop.addSample(
            jt,
            Cesium.Cartesian3.fromRadians(gd.longitude, gd.latitude, gd.height * 1000)
        );
    }
    return prop;
}

// Проверяем дрейф в onTick и перестраиваем если нужно
// Throttle: не чаще раза в 500мс реального времени
let _lastPathRebuild = 0;
function maybeRebuildPath(currentJD) {
    if (!_pathSatrec || !activePathEntity || !_pathWindowCenter) return;
    const now = performance.now();
    if (now - _lastPathRebuild < 500) return;

    const driftMin = Math.abs(
        Cesium.JulianDate.secondsDifference(currentJD, _pathWindowCenter) / 60
    );
    if (driftMin > PATH_REBUILD_THRESHOLD) {
        _pathWindowCenter = currentJD.clone();
        const newPos = buildSampledPosition(_pathSatrec, _pathWindowCenter);
        activePathEntity.position = newPos;
        if (activePathEntityFar) activePathEntityFar.position = newPos;
        // Обновляем и trackedEntity если он активен
        if (viewer._trackedSatEntity && viewer._trackedSatrec) {
            viewer._trackedSatEntity.position = buildSampledPosition(viewer._trackedSatrec, _pathWindowCenter);
        }
        _lastPathRebuild = now;
    }
}

// ==========================================
// 8. ОБНОВЛЕНИЕ ПОЗИЦИЙ ВСЕХ СПУТНИКОВ (onTick)
// ==========================================
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

    // Скользящее окно пути — перестраиваем при дрейфе
    maybeRebuildPath(currentTime);

    updateSatCardCoords(currentTime);
});

// ==========================================
// 9. ОБНОВЛЕНИЕ КООРДИНАТ В КАРТОЧКЕ (не чаще 2 раз/сек)
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
    const altKm = (cartographic.height / 1000).toFixed(1);

    document.getElementById('satCoords').innerText = `Ш: ${lat}°  Д: ${lon}°`;
    document.getElementById('satAlt').innerText = altKm;

    lastDomUpdate = now;
}

// ==========================================
// 10. ОРБИТА (LAZY — только при клике)
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

    // Орбитальный период из TLE (в секундах)
    const periodSec = entry.satrec.no > 0
        ? (2 * Math.PI / entry.satrec.no) * 60  // no в рад/мин → секунды
        : 6000;

    // Зона покрытия + зона радиовидимости
    if (activeEllipseEntity) {
        viewer.entities.remove(activeEllipseEntity);
        activeEllipseEntity = null;
    }
    if (activeRadioEllipseEntity) {
        viewer.entities.remove(activeRadioEllipseEntity);
        activeRadioEllipseEntity = null;
    }

    const EARTH_RADIUS_KM = 6371;
    const MIN_ELEV_DEG = 10; // минимальный угол для радиосвязи

    // Общий CallbackProperty позиции — проецируем на поверхность
    const ellipsePositionCb = new Cesium.CallbackProperty((time, result) => {
        const pt = entry.pointPrimitive.position;
        if (!pt) return undefined;
        const carto = Cesium.Cartographic.fromCartesian(pt);
        return Cesium.Cartesian3.fromRadians(
            carto.longitude, carto.latitude, 0,
            Cesium.Ellipsoid.WGS84, result
        );
    }, false);

    // Радиус зоны покрытия: elevation = 0° (горизонт)
    // Формула: R * arccos(R / (R + h))
    const coverageRadiusCb = new Cesium.CallbackProperty(() => {
        const pt = entry.pointPrimitive.position;
        if (!pt) return 1000000;
        const altKm = Cesium.Cartographic.fromCartesian(pt).height / 1000;
        if (altKm <= 0) return 1000000;
        const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altKm);
        return EARTH_RADIUS_KM * Math.acos(Math.min(1, Math.max(-1, ratio))) * 1000;
    }, false);

    // Радиус зоны радиовидимости: elevation = MIN_ELEV_DEG°
    // Формула: R * (arccos(R/(R+h)) - elevRad)
    // Точнее через закон синусов: угол наблюдения = arccos(R*cos(e)/(R+h)) - e
    // где e — минимальный угол места
    const radioRadiusCb = new Cesium.CallbackProperty(() => {
        const pt = entry.pointPrimitive.position;
        if (!pt) return 500000;
        const altKm = Cesium.Cartographic.fromCartesian(pt).height / 1000;
        if (altKm <= 0) return 500000;
        const elevRad = Cesium.Math.toRadians(MIN_ELEV_DEG);
        const R = EARTH_RADIUS_KM;
        const H = R + altKm;
        // Угол при центре Земли: ρ = arccos(R*cos(e)/H) - e
        const rho = Math.acos(Math.min(1, (R * Math.cos(elevRad)) / H)) - elevRad;
        return Math.max(0, R * rho * 1000);
    }, false);

    // Внешний эллипс — зона покрытия (голубой, полупрозрачный)
    activeEllipseEntity = viewer.entities.add({
        position: ellipsePositionCb,
        ellipse: {
            semiMinorAxis: coverageRadiusCb,
            semiMajorAxis: coverageRadiusCb,
            material: Cesium.Color.CYAN.withAlpha(0.06),
            outline: true,
            outlineColor: Cesium.Color.CYAN.withAlpha(0.4),
            outlineWidth: 1,
            height: 0,
        }
    });

    // Внутренний эллипс — зона радиовидимости (зелёный, elevation > 10°)
    activeRadioEllipseEntity = viewer.entities.add({
        position: ellipsePositionCb,
        ellipse: {
            semiMinorAxis: radioRadiusCb,
            semiMajorAxis: radioRadiusCb,
            material: Cesium.Color.LIME.withAlpha(0.10),
            outline: true,
            outlineColor: Cesium.Color.LIME.withAlpha(0.6),
            outlineWidth: 1,
            height: 0,
        }
    });

    // path entity — единственный источник траектории.
    // leadTime = один полный период орбиты вперёд (прогноз).
    // trailTime = 20 минут назад (след, стирается по мере прохождения).
    // Скользящее окно SampledPositionProperty обеспечивает точность.
    if (activePathEntity) {
        viewer.entities.remove(activePathEntity);
        activePathEntity = null;
    }
    _pathSatrec = entry.satrec;
    _pathWindowCenter = viewer.clock.currentTime.clone();
    // Два слоя траектории для эффекта плавного затухания:
    // Слой 1 — первый виток, яркий (alpha 0.75)
    // Слой 2 — второй виток, полупрозрачный (alpha 0.2), создаёт эффект fade
    if (activePathEntity) {
        viewer.entities.remove(activePathEntity);
        activePathEntity = null;
    }
    if (activePathEntityFar) {
        viewer.entities.remove(activePathEntityFar);
        activePathEntityFar = null;
    }
    _pathSatrec = entry.satrec;
    _pathWindowCenter = viewer.clock.currentTime.clone();
    const sharedPosition = buildSampledPosition(_pathSatrec, _pathWindowCenter);

    // Ближний слой — яркий, один период вперёд
    activePathEntity = viewer.entities.add({
        position: sharedPosition,
        path: {
            resolution: 30,
            material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.1,
                taperPower: 0.85,
                color: Cesium.Color.YELLOW.withAlpha(0.75),
            }),
            width: 3,
            leadTime: periodSec,
            trailTime: 60 * 20
        }
    });

    // Дальний слой — тусклый, второй период вперёд (от periodSec до periodSec*2)
    // leadTime = 2 периода, но ширина меньше и прозрачность низкая
    activePathEntityFar = viewer.entities.add({
        position: sharedPosition,
        path: {
            resolution: 60,
            material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.05,
                taperPower: 0.5,
                color: Cesium.Color.YELLOW.withAlpha(0.18),
            }),
            width: 2,
            leadTime: periodSec * 2,
            trailTime: 0   // без следа у дальнего слоя
        }
    });
}

function hideActiveSatelliteDetails() {
    _pathSatrec = null;
    _pathWindowCenter = null;
    if (activeEllipseEntity) {
        viewer.entities.remove(activeEllipseEntity);
        activeEllipseEntity = null;
    }
    if (activeRadioEllipseEntity) {
        viewer.entities.remove(activeRadioEllipseEntity);
        activeRadioEllipseEntity = null;
    }
    if (activePathEntity) {
        viewer.entities.remove(activePathEntity);
        activePathEntity = null;
    }
    if (activePathEntityFar) {
        viewer.entities.remove(activePathEntityFar);
        activePathEntityFar = null;
    }
}

// ==========================================
// 11. РАСЧЁТ СЛЕДУЮЩЕГО ПРОЛЁТА (в main-потоке, один спутник — быстро)
// ==========================================
function calcNextPass(satrec, observerCoords) {
    if (!observerCoords) return null;
    const stepMin = 2;
    let isVisible = false;
    for (let i = 0; i < 24 * 60; i += stepMin) {
        const time = new Date(Date.now() + i * 60000);
        const posVel = satellite.propagate(satrec, time);
        if (!posVel.position) continue;
        const gmst = satellite.gstime(time);
        const posEcf = satellite.eciToEcf(posVel.position, gmst);
        const angles = satellite.ecfToLookAngles(observerCoords, posEcf);
        if (angles.elevation > 0) {
            if (!isVisible) return time; // первый момент подъёма над горизонтом
            isVisible = true;
        } else {
            isVisible = false;
        }
    }
    return null;
}

// ==========================================
// 12. ЗАГРУЗКА И ИНИЦИАЛИЗАЦИЯ
// ==========================================
async function initApp() {
    // Убираем подсказку Shift+ЛКМ из topPanel
    document.querySelectorAll('.hint').forEach(el => el.remove());

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
                updateSatCounter();
            }
        }

        requestAnimationFrame(renderChunk);
    } catch (error) {
        loaderText.innerText = "Ошибка загрузки данных!";
        loaderText.style.color = "red";
        console.error(error);
    }
    // Инжектируем панель сравнения группировок
    injectComparisonPanel(meta.countries);
}

// ==========================================
// ПАНЕЛЬ СРАВНЕНИЯ ГРУППИРОВОК
// ==========================================
// Цвета для двух выбранных группировок
const COMPARE_COLORS = [
    { hex: '#FF6B6B', cesium: Cesium.Color.fromCssColorString('#FF6B6B') }, // красный
    { hex: '#4ECDC4', cesium: Cesium.Color.fromCssColorString('#4ECDC4') }, // бирюзовый
];
let compareMode = false;
let compareGroups = [null, null]; // [group_a, group_b]

function injectComparisonPanel(countries) {
    const filterPanel = document.getElementById('filterPanel');
    if (!filterPanel || document.getElementById('comparePanel')) return;

    const panel = document.createElement('div');
    panel.id = 'comparePanel';
    const countryOptions = countries.map(c => '<option value="' + c + '">' + c + '</option>').join('');
    panel.innerHTML = `
        <div class="compare-divider"></div>
        <h3>СРАВНЕНИЕ ГРУППИРОВОК</h3>
        <label>Группировка А</label>
        <select id="compareA">
            <option value="">— выберите —</option>
            ${countryOptions}
        </select>
        <label>Группировка Б</label>
        <select id="compareB">
            <option value="">— выберите —</option>
            ${countryOptions}
        </select>
        <button id="compareBtn">Сравнить</button>
        <button id="compareResetBtn" style="display:none">Сбросить</button>
        <div id="compareStats"></div>
    `;
    filterPanel.appendChild(panel);

    document.getElementById('compareBtn').addEventListener('click', runComparison);
    document.getElementById('compareResetBtn').addEventListener('click', resetComparison);
}

function runComparison() {
    const a = document.getElementById('compareA').value;
    const b = document.getElementById('compareB').value;
    if (!a || !b || a === b) {
        alert('Выберите две разные группировки');
        return;
    }
    compareGroups = [a, b];
    compareMode = true;

    let countA = 0, countB = 0;
    const orbitCountA = {}, orbitCountB = {};

    for (const [, entry] of satMap) {
        const country = entry.meta.country;
        const orbit = entry.meta.orbitType || '—';

        if (country === a) {
            entry.pointPrimitive.color = COMPARE_COLORS[0].cesium;
            entry.pointPrimitive.pixelSize = 8;
            entry.pointPrimitive.show = true;
            entry.show = true;
            countA++;
            orbitCountA[orbit] = (orbitCountA[orbit] || 0) + 1;
        } else if (country === b) {
            entry.pointPrimitive.color = COMPARE_COLORS[1].cesium;
            entry.pointPrimitive.pixelSize = 8;
            entry.pointPrimitive.show = true;
            entry.show = true;
            countB++;
            orbitCountB[orbit] = (orbitCountB[orbit] || 0) + 1;
        } else {
            entry.pointPrimitive.show = false;
            entry.show = false;
        }
    }

    // Статистика
    const statsEl = document.getElementById('compareStats');
    const orbitsA = Object.entries(orbitCountA).map(([k,v]) => k + ': ' + v).join(' · ');
    const orbitsB = Object.entries(orbitCountB).map(([k,v]) => k + ': ' + v).join(' · ');

    statsEl.innerHTML = `
        <div class="compare-stat">
            <span class="compare-dot" style="background:${COMPARE_COLORS[0].hex}"></span>
            <b>${a}</b>: ${countA} сп.
            <div class="compare-orbits">${orbitsA}</div>
        </div>
        <div class="compare-stat">
            <span class="compare-dot" style="background:${COMPARE_COLORS[1].hex}"></span>
            <b>${b}</b>: ${countB} сп.
            <div class="compare-orbits">${orbitsB}</div>
        </div>
    `;

    document.getElementById('compareBtn').style.display = 'none';
    document.getElementById('compareResetBtn').style.display = 'block';
    updateSatCounter();
}

function resetComparison() {
    compareMode = false;
    compareGroups = [null, null];

    // Восстанавливаем оригинальные цвета
    for (const [, entry] of satMap) {
        entry.pointPrimitive.color = getOrbitColor(entry.meta.orbitType);
        entry.pointPrimitive.pixelSize = 6;
        entry.pointPrimitive.show = entry.show;
    }

    document.getElementById('compareStats').innerHTML = '';
    document.getElementById('compareBtn').style.display = 'block';
    document.getElementById('compareResetBtn').style.display = 'none';
    applyFilters();
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
// 13. СЧЁТЧИК ВИДИМЫХ СПУТНИКОВ
// ==========================================
function updateSatCounter() {
    const counter = document.getElementById('satCounter');
    if (!counter) return;
    const visibleCount = [...satMap.values()].filter(e => e.show).length;
    counter.innerText = `Отображается: ${visibleCount} из ${satMap.size}`;
}

// ==========================================
// 14. ФИЛЬТРАЦИЯ
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

        if (!show && activeSatelliteId === satId) {
            closeSatelliteCard();
        }
    }

    updateSatCounter();

    // Если наблюдатель уже установлен — перезапускаем расчёт пролётов с новыми фильтрами
    if (currentObserverCoords) {
        const passesListDiv = document.getElementById('passesList');
        passesListDiv.innerHTML = '<p style="color:rgba(255,255,255,0.4);text-align:center;">Пересчёт...</p>';
        passPredictionWorker.postMessage({
            observerCoords: currentObserverCoords,
            satellites: satellitesData.filter(sat => {
                const entry = satMap.get(sat.id);
                return entry && entry.show;
            }),
            startTime: Date.now()
        });
    }
}

document.getElementById('filterCountry').addEventListener('change', applyFilters);
document.getElementById('filterOrbit').addEventListener('change', applyFilters);
document.getElementById('filterPurpose').addEventListener('change', applyFilters);

// Кнопка сброса фильтров
const resetBtn = document.getElementById('resetFiltersBtn');
if (resetBtn) {
    resetBtn.addEventListener('click', () => {
        document.getElementById('filterCountry').value = 'ALL';
        document.getElementById('filterOrbit').value = 'ALL';
        document.getElementById('filterPurpose').value = 'ALL';
        applyFilters();
    });
}

// ==========================================
// 15. КЛИК ПО СПУТНИКУ
// ==========================================
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

handler.setInputAction((movement) => {
    const pickedObject = viewer.scene.pick(movement.position);

    if (activeSatelliteId) {
        hideActiveSatelliteDetails();
    }

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

        showActiveSatelliteDetails(satId);

        // Высота из реальной позиции (обновляется в updateSatCardCoords каждые 500мс)
        const nowDate = new Date();
        const posVelNow = satellite.propagate(entry.satrec, nowDate);
        let altKmReal = null;
        if (posVelNow && posVelNow.position) {
            const gmstNow = satellite.gstime(nowDate);
            const gdNow = satellite.eciToGeodetic(posVelNow.position, gmstNow);
            altKmReal = gdNow.height;
        }

        // Период из TLE (satrec.no — среднее движение в рад/мин)
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

        // Следующий пролёт над точкой наблюдателя
        const nextPassEl = document.getElementById('satNextPass');
        if (nextPassEl) {
            if (currentObserverCoords) {
                const nextPass = calcNextPass(entry.satrec, currentObserverCoords);
                nextPassEl.innerText = nextPass
                    ? nextPass.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      + ' ' + nextPass.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
                    : 'Нет пролётов (24ч)';
            } else {
                nextPassEl.innerText = 'Выберите точку (Shift+клик)';
            }
        }

        document.getElementById('satCard').style.display = 'block';
    } else {
        // Клик на пустое место — отпускаем слежение за спутником
        if (viewer.trackedEntity) {
            viewer.trackedEntity = undefined;
            if (viewer._trackedSatEntity) {
                viewer.entities.remove(viewer._trackedSatEntity);
                viewer._trackedSatEntity = null;
                viewer._trackedSatrec = null;
            }
            // Плавно возвращаемся к виду Земли без телепортации
            viewer.camera.flyToBoundingSphere(
                new Cesium.BoundingSphere(Cesium.Cartesian3.ZERO, 6371000 * 3),
                {
                    duration: 1.5,
                    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-45), 6371000 * 4)
                }
            );
        }
        closeSatelliteCard();
    }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// ==========================================
// 16. ЗАКРЫТИЕ КАРТОЧКИ
// ==========================================
function closeSatelliteCard() {
    document.getElementById('satCard').style.display = 'none';
    hideActiveSatelliteDetails();
    activeSatelliteId = null;
}

document.getElementById('closeCardBtn').addEventListener('click', closeSatelliteCard);

// ==========================================
// 17. ПЕРЕКЛЮЧЕНИЕ 2D / 3D
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
// 18. РАСЧЁТ ПРОЛЁТОВ (SHIFT + КЛИК + WEB WORKER)
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

        // Сохраняем для calcNextPass в карточке
        currentObserverCoords = observerLocation;

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
                text: 'НАБЛЮДАТЕЛЬ',
                font: '500 11px Geist, system-ui, sans-serif',
                style: Cesium.LabelStyle.FILL_AND_OUTLINE,
                fillColor: Cesium.Color.WHITE,
                outlineColor: Cesium.Color.BLACK,
                outlineWidth: 3,
                verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
                pixelOffset: new Cesium.Cartesian2(0, -14),
                letterSpacing: 1,
            }
        });

        const passesListDiv = document.getElementById('passesList');
        passesListDiv.innerHTML =
            '<p style="color:#63b3ed;text-align:center;">Анализ орбит (Worker)... ⏳</p>';

        passPredictionWorker.postMessage({
            observerCoords: observerLocation,
            // Отправляем только видимые (отфильтрованные) спутники
            satellites: satellitesData.filter(sat => {
                const entry = satMap.get(sat.id);
                return entry && entry.show;
            }),
            startTime: Date.now()
        });

        // Если карточка открыта — обновить поле следующего пролёта
        if (activeSatelliteId) {
            const entry = satMap.get(activeSatelliteId);
            const nextPassEl = document.getElementById('satNextPass');
            if (entry && nextPassEl) {
                const nextPass = calcNextPass(entry.satrec, currentObserverCoords);
                nextPassEl.innerText = nextPass
                    ? nextPass.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      + ' ' + nextPass.toLocaleDateString([], { day: '2-digit', month: '2-digit' })
                    : 'Нет пролётов (24ч)';
            }
        }
    }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK, Cesium.KeyboardEventModifier.SHIFT);

// ==========================================
// 19. ОТВЕТ ОТ WEB WORKER
// ==========================================
passPredictionWorker.onmessage = function (e) {
    const passes = e.data;
    const passesListDiv = document.getElementById('passesList');
    passesListDiv.innerHTML = '';

    if (passes.length === 0) {
        passesListDiv.innerHTML = '<p class="hint-text">Нет пролётов в ближайшие 24 часа.</p>';
        return;
    }

    passes.slice(0, 20).forEach(pass => {
        const passDate = new Date(pass.time);
        const timeStr = passDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dateStr = passDate.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
        const elevDeg = Cesium.Math.toDegrees(pass.maxElevation).toFixed(1);
        const borderColor = elevDeg > 45 ? '#68D391' : elevDeg > 15 ? '#F6E05E' : '#63b3ed';

        const item = document.createElement('div');
        item.className = 'pass-item';
        item.style.borderLeftColor = borderColor;
        item.style.cursor = 'pointer';
        item.dataset.satId = pass.satId;
        item.innerHTML = `
            <div><b>${pass.satName}</b></div>
            <div>📅 ${dateStr} &nbsp; ⏰ <span class="pass-time">${timeStr}</span></div>
            <div>Макс. угол: <b style="color:${borderColor}">${elevDeg}°</b></div>
        `;

        // Клик — закрепляем камеру на спутнике через trackedEntity
        item.addEventListener('click', () => {
            const entry = satMap.get(pass.satId);
            if (!entry) return;

            // Открываем карточку спутника
            if (activeSatelliteId !== pass.satId) {
                if (activeSatelliteId) hideActiveSatelliteDetails();
                activeSatelliteId = pass.satId;
                const props = entry.meta;

                showActiveSatelliteDetails(pass.satId);

                const nowDate = new Date();
                const posVelNow = satellite.propagate(entry.satrec, nowDate);
                let altKmReal = null;
                if (posVelNow?.position) {
                    const gmstNow = satellite.gstime(nowDate);
                    altKmReal = satellite.eciToGeodetic(posVelNow.position, gmstNow).height;
                }
                const periodMinReal = entry.satrec.no > 0
                    ? (2 * Math.PI / entry.satrec.no).toFixed(1) : null;

                document.getElementById('satName').innerText = props.name || '—';
                document.getElementById('satCountry').innerText = props.country || '—';
                document.getElementById('satOrbitType').innerText = props.orbitType || props.orbit || '—';
                document.getElementById('satPurpose').innerText = props.purpose || props.type || '—';
                document.getElementById('satAlt').innerText = altKmReal?.toFixed(0) ?? (props.altitude ?? '—');
                document.getElementById('satPeriod').innerText = periodMinReal ?? (props.period ?? '—');

                const nextPassEl = document.getElementById('satNextPass');
                if (nextPassEl) {
                    nextPassEl.innerText = currentObserverCoords
                        ? (() => {
                            const np = calcNextPass(entry.satrec, currentObserverCoords);
                            return np
                                ? np.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
                                  + ' ' + np.toLocaleDateString([], { day:'2-digit', month:'2-digit' })
                                : 'Нет пролётов (24ч)';
                          })()
                        : 'Выберите точку (Shift+клик)';
                }
                document.getElementById('satCard').style.display = 'block';
            }

            // trackedEntity через SampledPositionProperty — Cesium нативно следит за entity.
            // Используем buildSampledPosition (уже есть в коде) для позиции.
            // viewFrom задаёт смещение камеры относительно спутника:
            // x=0, y=-5000км сзади, z=2000км сверху — спутник крупно, виден горизонт.
            if (viewer._trackedSatEntity) {
                viewer.entities.remove(viewer._trackedSatEntity);
                viewer._trackedSatEntity = null;
            }

            const trackPos = buildSampledPosition(entry.satrec, viewer.clock.currentTime.clone());

            viewer._trackedSatEntity = viewer.entities.add({
                position: trackPos,
                viewFrom: new Cesium.Cartesian3(0, -8000000, 3000000), // 8000 км сзади, 3000 км сверху
                point: {
                    pixelSize: 14,
                    color: Cesium.Color.WHITE,
                    outlineColor: Cesium.Color.YELLOW,
                    outlineWidth: 2,
                    scaleByDistance: new Cesium.NearFarScalar(1e3, 2, 1e7, 0.5),
                }
            });

            viewer.trackedEntity = viewer._trackedSatEntity;

            // Обновляем позицию trackedEntity вместе со скользящим окном
            viewer._trackedSatrec = entry.satrec;

            // Подсветить выбранный элемент в списке
            document.querySelectorAll('.pass-item').forEach(el => el.classList.remove('pass-item--active'));
            item.classList.add('pass-item--active');
        });

        passesListDiv.appendChild(item);
    });
};