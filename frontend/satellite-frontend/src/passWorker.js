import * as satellite from 'satellite.js';

// Слушаем сообщения от главного потока (main.js)
self.onmessage = function(e) {
    const { observerCoords, satellites, startTime } = e.data;
    const passes = [];
    const searchDurationMinutes = 24 * 60; // Ищем на 24 часа вперед
    const stepMinutes = 2; // Шаг 2 минуты для скорости

    satellites.forEach(sat => {
        const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
        let isVisible = false;

        for (let i = 0; i < searchDurationMinutes; i += stepMinutes) {
            const time = new Date(startTime + i * 60000);
            const posVel = satellite.propagate(satrec, time);
            
            if (!posVel.position) continue;

            const gmst = satellite.gstime(time);
            const positionEcf = satellite.eciToEcf(posVel.position, gmst);
            const lookAngles = satellite.ecfToLookAngles(observerCoords, positionEcf);

            // Если спутник поднялся над горизонтом (elevation > 0)
            if (lookAngles.elevation > 0) {
                if (!isVisible) {
                    passes.push({
                        satId: sat.id,
                        satName: sat.name,
                        time: time.getTime(),
                        maxElevation: lookAngles.elevation
                    });
                    isVisible = true; // Фиксируем только начало пролета
                    break; // Переходим к следующему спутнику
                }
            } else {
                isVisible = false;
            }
        }
    });

    // Сортируем по времени пролета (ближайшие сверху)
    passes.sort((a, b) => a.time - b.time);

    // Отправляем результат обратно в главный поток
    self.postMessage(passes);
};
