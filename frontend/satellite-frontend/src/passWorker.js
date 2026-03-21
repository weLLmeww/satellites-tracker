import * as satellite from 'satellite.js';

self.onmessage = function(e) {
    const { observerCoords, satellites, startTime } = e.data;
    const passes = [];
    const searchDurationMinutes = 24 * 60;
    const stepMinutes = 2;

    satellites.forEach(sat => {
        const satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
        let isVisible = false;
        let currentPass = null;

        for (let i = 0; i < searchDurationMinutes; i += stepMinutes) {
            const time = new Date(startTime + i * 60000);
            const posVel = satellite.propagate(satrec, time);

            if (!posVel.position) continue;

            const gmst = satellite.gstime(time);
            const positionEcf = satellite.eciToEcf(posVel.position, gmst);
            const lookAngles = satellite.ecfToLookAngles(observerCoords, positionEcf);

            if (lookAngles.elevation > 0) {
                if (!isVisible) {
                    // Начало пролёта
                    isVisible = true;
                    currentPass = {
                        satId: sat.id,
                        satName: sat.name,
                        time: time.getTime(),
                        maxElevation: lookAngles.elevation
                    };
                } else {
                    // Обновляем максимальную элевацию (пик дуги)
                    if (lookAngles.elevation > currentPass.maxElevation) {
                        currentPass.maxElevation = lookAngles.elevation;
                    }
                }
            } else if (isVisible) {
                // Конец пролёта — сохраняем и сбрасываем
                isVisible = false;
                passes.push(currentPass);
                currentPass = null;
            }
        }

        // Если пролёт не завершился до конца окна — всё равно сохраняем
        if (currentPass) {
            passes.push(currentPass);
        }
    });

    passes.sort((a, b) => a.time - b.time);
    self.postMessage(passes);
};