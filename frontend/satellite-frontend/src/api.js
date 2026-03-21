// api.js

// Укажите URL вашего бэкенда (FastAPI по умолчанию работает на 8000 порту)
const API_BASE_URL = 'https://hak.amnesia.top:8000';

/**
 * 1. Получение списка спутников (GET /satellites)
 * Мы запрашиваем максимум (1000), чтобы отрисовать их в Cesium 
 * и дальше фильтровать на клиенте, не перерисовывая 3D объекты.
 */
export async function fetchSatellitesData() {
    try {
        const response = await fetch(`${API_BASE_URL}/satellites?limit=200&offset=0`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const json = await response.json();

        // Маппинг данных: приводим названия полей из бэка (type, orbit) 
        // к тем, которые ожидает ваш код Cesium (purpose, orbitType)
        return json.data.map(sat => ({
            ...sat,
            purpose: sat.type || sat.purpose || "Неизвестно",
            orbitType: sat.orbit || sat.orbitType || "Неизвестно"
        }));
    } catch (e) {
        console.error("Ошибка загрузки TLE с бэкенда:", e);
        return [];
    }
}

/**
 * 2. Получение меты для фильтров (GET /meta)
 * Полезно, чтобы динамически создать <option> в селектах стран, орбит и типов.
 */
export async function fetchMeta() {
    try {
        const response = await fetch(`${API_BASE_URL}/meta`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error("Ошибка загрузки мета-данных:", e);
        return { countries: [], types: [], orbits: [] };
    }
}

/**
 * 3. Поиск спутника по имени (GET /satellites/search)
 * (Можете использовать позже, если добавите строку поиска в UI)
 */
export async function searchSatellites(query) {
    try {
        const response = await fetch(`${API_BASE_URL}/satellites/search?q=${encodeURIComponent(query)}`);
        const json = await response.json();
        return json.data;
    } catch (e) {
        console.error("Ошибка поиска:", e);
        return [];
    }
}

/**
 * 4. Получение одного спутника по ID (GET /satellites/{sat_id})
 */
export async function fetchSatelliteById(id) {
    try {
        const response = await fetch(`${API_BASE_URL}/satellites/${id}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error(`Ошибка загрузки спутника ${id}:`, e);
        return null;
    }
}
