/**
 * toast.js — утилита показа временных уведомлений
 *
 * Слой: UI Utilities (не зависит ни от каких других модулей)
 */

const toastEl = document.getElementById('toast');

/**
 * @param {string} msg      — текст сообщения
 * @param {number} duration — время показа в мс (по умолчанию 2500)
 */
export function showToast(msg, duration = 2500) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), duration);
}

// Глобальный экспорт для совместимости с inline-кодом
window.showToast = showToast;