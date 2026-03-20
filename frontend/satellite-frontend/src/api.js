// Здесь лежат ваши моки. Когда бэкендеры дадут АПИ, просто удалите массив
// и раскомментируйте fetch.

const mockSatellites = [
    { id: "25544", name: "МКС (ISS)", tle1: "1 25544U 98067A   23292.51782528  .00016717  00000-0  30164-3 0  9990", tle2: "2 25544  51.6416  60.8524 0005477  19.2616 102.7353 15.50239335421060", country: "Международный", orbitType: "LEO", purpose: "Наука", altitude: 408, period: 92 },
    { id: "48106", name: "STARLINK-2436", tle1: "1 48106U 21027A   23293.12345678  .00012345  00000-0  12345-3 0  9990", tle2: "2 48106  53.0531 156.4321 0001234  12.3456 345.6789 15.1234567812345", country: "США", orbitType: "LEO", purpose: "Связь", altitude: 550, period: 95 },
    { id: "38270", name: "ГЛОНАСС-М", tle1: "1 38270U 12057A   23294.45678901 -.00000023  00000-0  00000+0 0  9990", tle2: "2 38270  64.8123 345.1234 0012345 250.9876 109.8765  2.13098765 89012", country: "Россия", orbitType: "MEO", purpose: "Навигация", altitude: 19100, period: 675 },
    { id: "43226", name: "GOES 17", tle1: "1 43226U 18022A   23295.11111111 -.00000111  00000-0  00000+0 0  9990", tle2: "2 43226   0.0123 275.9876 0001111   0.0000 359.0000  1.00270000 12345", country: "США", orbitType: "GEO", purpose: "Метеорология", altitude: 35786, period: 1436 }
];

export async function fetchSatellitesData() {
    try {
        // ПОТОМ ЗАМЕНИТЬ НА:
        // const response = await fetch('ВАШ_BACKEND_URL/api/tles');
        // return await response.json();

        // Имитируем задержку сети 1.5 секунды
        return new Promise(resolve => setTimeout(() => resolve(mockSatellites), 1500));
    } catch (e) {
        console.error("Ошибка загрузки TLE:", e);
        return [];
    }
}