import './style.css';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import * as Cesium from 'cesium';
import * as satellite from 'satellite.js';
import { fetchSatellitesData } from './api.js';

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
    selectionIndicator: true,
    sceneModePicker: false,
    shouldAnimate: true // автозапуск времени
});

// Настройка освещения
viewer.scene.globe.enableLighting = true;

// Глобальные состояния
let satellitesData = [];
let activeSatelliteId = null;
let observerEntity = null;

// Инициализируем Web Worker (В Vite он подключается так)
const passPredictionWorker = new Worker(new URL('./passWorker.js', import.meta.url), { type: 'module' });

// ==========================================
// 2. ДВИЖОК ОТРИСОВКИ СПУТНИКОВ (ОПТИМИЗИРОВАННЫЙ)
// ==========================================
function createSatelliteEntity(satData) {
    const satrec = satellite.twoline2satrec(satData.tle1, satData.tle2);

    // Предрасчет позиций на 24 часа для высокой производительности (SampledPositionProperty)
    const positionProperty = new Cesium.SampledPositionProperty();
    const startTime = viewer.clock.currentTime;

    // Считаем точки (шаг 1 минута)
    for (let i = 0; i <= 24 * 60; i += 1) {
        const time = Cesium.JulianDate.addMinutes(startTime, i, new Cesium.JulianDate());
        const jsDate = Cesium.JulianDate.toDate(time);

        const posVel = satellite.propagate(satrec, jsDate);
        if (posVel.position) {
            const gmst = satellite.gstime(jsDate);
            const gd = satellite.eciToGeodetic(posVel.position, gmst);
            const position = Cesium.Cartesian3.fromRadians(gd.longitude, gd.latitude, gd.height * 1000);
            positionProperty.addSample(time, position);
        }
    }

    // Расчет радиуса зоны радиовидимости (покрытия)
    const earthRadius = 6371;
    const maxVisibilityAngle = Math.acos(earthRadius / (earthRadius + (satData.altitude || 500)));
    const coverageRadius = earthRadius * maxVisibilityAngle * 1000; // в метрах

    const entity = viewer.entities.add({
        id: `sat-${satData.id}`,
        name: satData.name,
        properties: satData,
        position: positionProperty,

        // Точка спутника
        point: {
            pixelSize: 8,
            color: Cesium.Color.CYAN,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 2,
        },

        // След (хвост) орбиты за спутником
        path: {
            resolution: 1,
            material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: 0.1,
                color: Cesium.Color.YELLOW
            }),
            width: 2,
            leadTime: 0,
            trailTime: 60 * 45 // Хвост длиной 45 минут
        },

        // Зона радиовидимости (эллипс на земле)
        ellipse: {
            semiMinorAxis: coverageRadius,
            semiMajorAxis: coverageRadius,
            material: Cesium.Color.CYAN.withAlpha(0.15),
            outline: true,
            outlineColor: Cesium.Color.CYAN.withAlpha(0.4),
            height: 0,
            show: false // <--- ДОБАВИТЬ ЭТУ СТРОКУ (Скрываем по умолчанию)
        }
    });

    // Полная линия орбиты (изначально скрыта)
    const orbitLine = viewer.entities.add({
        id: `orbit-${satData.id}`,
        polyline: {
            positions: createFullOrbitPositions(satrec, satData.period || 100),
            width: 1,
            material: Cesium.Color.YELLOW.withAlpha(0.4),
        },
        show: false
    });
}

function createFullOrbitPositions(satrec, periodMin) {
    const positions = [];
    const now = new Date();
    for (let i = 0; i <= periodMin; i += 2) {
        const time = new Date(now.getTime() + i * 60000);
        const posVel = satellite.propagate(satrec, time);
        if (posVel.position) {
            const gmst = satellite.gstime(time);
            const gd = satellite.eciToGeodetic(posVel.position, gmst);
            positions.push(Cesium.Cartesian3.fromRadians(gd.longitude, gd.latitude, gd.height * 1000));
        }
    }
    return positions;
}

// ==========================================
// 3. ЗАГРУЗКА ДАННЫХ И ИНИЦИАЛИЗАЦИЯ
// ==========================================
async function initApp() {
    const loader = document.getElementById('loader');
    const loaderText = document.getElementById('loaderText');

    loaderText.innerText = "Загрузка TLE данных...";
    satellitesData = await fetchSatellitesData();

    loaderText.innerText = "Расчет орбит...";
    satellitesData.forEach(createSatelliteEntity);

    // Убираем лоадер
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 500);
}

initApp();

// ==========================================
// 4. ФИЛЬТРАЦИЯ
// ==========================================
function applyFilters() {
    const country = document.getElementById('filterCountry').value;
    const orbit = document.getElementById('filterOrbit').value;
    const purpose = document.getElementById('filterPurpose').value;

    satellitesData.forEach(sat => {
        const entity = viewer.entities.getById(`sat-${sat.id}`);
        let show = true;

        if (country !== 'ALL' && sat.country !== country) show = false;
        if (orbit !== 'ALL' && sat.orbitType !== orbit) show = false;
        if (purpose !== 'ALL' && sat.purpose !== purpose) show = false;

        if (entity) entity.show = show;

        if (!show && activeSatelliteId === sat.id) {
            closeSatelliteCard();
        }
    });
}

document.getElementById('filterCountry').addEventListener('change', applyFilters);
document.getElementById('filterOrbit').addEventListener('change', applyFilters);
document.getElementById('filterPurpose').addEventListener('change', applyFilters);

// ==========================================
// 5. ВЗАИМОДЕЙСТВИЕ И СОБЫТИЯ UI
// ==========================================
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);

// Клик по спутнику
// Обработка левого клика (выбор спутника)
handler.setInputAction((movement) => {
    const pickedObject = viewer.scene.pick(movement.position);

    // Скрываем орбиту и зону покрытия предыдущего выделенного спутника
    if (activeSatelliteId) {
        const oldOrbit = viewer.entities.getById(`orbit-${activeSatelliteId}`);
        if (oldOrbit) oldOrbit.show = false;
        
        const oldSat = viewer.entities.getById(`sat-${activeSatelliteId}`);
        if (oldSat && oldSat.ellipse) oldSat.ellipse.show = false;
    }

    // Если кликнули по спутнику
    if (Cesium.defined(pickedObject) && pickedObject.id && pickedObject.id.id.startsWith('sat-')) {
        const entity = pickedObject.id;
        const props = entity.properties.getValue();
        activeSatelliteId = props.id;

        // Показываем орбиту и зону покрытия (круг) нового спутника
        const newOrbit = viewer.entities.getById(`orbit-${activeSatelliteId}`);
        if (newOrbit) newOrbit.show = true;
        
        const newSat = viewer.entities.getById(`sat-${activeSatelliteId}`);
        if (newSat && newSat.ellipse) newSat.ellipse.show = true;

        // Заполняем карточку
        document.getElementById('satName').innerText = props.name;
        document.getElementById('satCountry').innerText = props.country;
        document.getElementById('satOrbitType').innerText = props.orbitType;
        document.getElementById('satPurpose').innerText = props.purpose;
        document.getElementById('satAlt').innerText = props.altitude;
        document.getElementById('satPeriod').innerText = props.period;

        document.getElementById('satCard').style.display = 'block';
    } else {
        closeSatelliteCard();
    }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);

// Функция закрытия карточки
function closeSatelliteCard() {
    document.getElementById('satCard').style.display = 'none';
    if (activeSatelliteId) {
        const orbit = viewer.entities.getById(`orbit-${activeSatelliteId}`);
        if (orbit) orbit.show = false;
        
        const sat = viewer.entities.getById(`sat-${activeSatelliteId}`);
        if (sat && sat.ellipse) sat.ellipse.show = false; // Скрываем круг при закрытии
        
        activeSatelliteId = null;
    }
}
document.getElementById('closeCardBtn').addEventListener('click', closeSatelliteCard);

// Переключение 2D/3D
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

// Обновление координат в карточке
viewer.scene.preRender.addEventListener(function () {
    if (activeSatelliteId && document.getElementById('satCard').style.display === 'block') {
        const entity = viewer.entities.getById(`sat-${activeSatelliteId}`);
        const positionCartesian = entity.position.getValue(viewer.clock.currentTime);

        if (positionCartesian) {
            const cartographic = Cesium.Cartographic.fromCartesian(positionCartesian);
            const lon = Cesium.Math.toDegrees(cartographic.longitude).toFixed(4);
            const lat = Cesium.Math.toDegrees(cartographic.latitude).toFixed(4);
            document.getElementById('satCoords').innerText = `Ш: ${lat}°\nД: ${lon}°`;
        }
    }
});

// ==========================================
// 6. РАСЧЕТ ПРОЛЕТОВ (WEB WORKER)
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
            point: { pixelSize: 10, color: Cesium.Color.LIME, outlineColor: Cesium.Color.BLACK, outlineWidth: 2 },
            label: { text: 'Наблюдатель', font: '14pt sans-serif', verticalOrigin: Cesium.VerticalOrigin.BOTTOM, pixelOffset: new Cesium.Cartesian2(0, -15) }
        });

        const passesListDiv = document.getElementById('passesList');
        passesListDiv.innerHTML = '<p style="color: #63b3ed; text-align:center;">Анализ орбит (Worker)... ⏳</p>';

        // Отправляем задачу в Web Worker
        passPredictionWorker.postMessage({
            observerCoords: observerLocation,
            satellites: satellitesData,
            startTime: Date.now()
        });
    }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK, Cesium.KeyboardEventModifier.SHIFT);

// Получаем ответ от Web Worker
passPredictionWorker.onmessage = function (e) {
    const passes = e.data;
    const passesListDiv = document.getElementById('passesList');
    passesListDiv.innerHTML = '';

    if (passes.length === 0) {
        passesListDiv.innerHTML = '<p>Нет пролётов в ближайшие 24 часа.</p>';
        return;
    }

    // Выводим Топ-15 ближайших
    passes.slice(0, 15).forEach(pass => {
        const passDate = new Date(pass.time);
        const timeStr = passDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        passesListDiv.innerHTML += `
            <div class="pass-item">
                <div><b>${pass.satName}</b></div>
                <div>Время: <span class="pass-time">${timeStr}</span> (Угол: ${Cesium.Math.toDegrees(pass.maxElevation).toFixed(1)}°)</div>
            </div>
        `;
    });
};