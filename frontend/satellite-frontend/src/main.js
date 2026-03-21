import './style.css';
// Явно импортируем стили самого Cesium, чтобы избежать багов отображения
import 'cesium/Build/Cesium/Widgets/widgets.css'; 
import * as Cesium from 'cesium';

// Создаем глобус с МИНИМАЛЬНЫМИ настройками (без токенов, без рельефа)
const viewer = new Cesium.Viewer('cesiumContainer', {
    terrainProvider: undefined,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    navigationHelpButton: false,
    animation: false,
    timeline: false
});

// Тестовый спутник
const position = Cesium.Cartesian3.fromDegrees(37.61, 55.75, 400000); // 400км над Москвой

viewer.entities.add({
    id: 'sat-1',
    name: 'МКС',
    position: position,
    point: {
        pixelSize: 15,
        color: Cesium.Color.RED,
        outlineColor: Cesium.Color.WHITE,
        outlineWidth: 2,
    },
    customData: { alt: 400, lon: 37.61, lat: 55.75 },
    
});

// Наводим камеру, чтобы сразу его увидеть
viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(37.61, 55.75, 15000000)
});

// Обработка клика
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction((movement) => {
    const pickedObject = viewer.scene.pick(movement.position);
    const card = document.getElementById('satCard');

    if (Cesium.defined(pickedObject) && pickedObject.id) {
        const entity = pickedObject.id;
        document.getElementById('satName').innerText = entity.name;
        document.getElementById('satAlt').innerText = entity.customData.alt;
        document.getElementById('satCoords').innerText = `${entity.customData.lat}°, ${entity.customData.lon}°`;
        card.style.display = 'block';
    } else {
        card.style.display = 'none';
    }
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);