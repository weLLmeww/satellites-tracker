/**
 * observer-mode.js — кнопка «Установить точку наблюдателя» (мобайл)
 *
 * Слой: UI Components
 * Зависит от: toast.js (showToast)
 */

import { showToast } from './toast.js';

let observerMode = false;
const observerBtn = document.getElementById('observerBtn');

observerBtn?.addEventListener('click', () => {
  observerMode = !observerMode;
  observerBtn.classList.toggle('active-observer', observerMode);
  showToast(
    observerMode
      ? '📍 Нажмите на карту чтобы установить точку наблюдателя'
      : 'Режим наблюдателя выключен'
  );
});

/**
 * Используется в main.js / map-controller для проверки режима.
 * @returns {boolean}
 */
export const isObserverMode = () => isMobile() && observerMode;

/** Сбросить режим наблюдателя (например, после установки точки) */
export function deactivateObserverMode() {
  observerMode = false;
  observerBtn?.classList.remove('active-observer');
}

// Глобальные обёртки для совместимости со старым кодом в main.js
window.isObserverMode = isObserverMode;
window.deactivateObserverMode = deactivateObserverMode;

/** @returns {boolean} */
function isMobile() {
  return window.innerWidth <= 768;
}