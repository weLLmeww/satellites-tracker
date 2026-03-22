/**
 * swipe.js — жест «свайп вниз» для закрытия bottom sheet
 *
 * Слой: UI Components
 * Зависит от: sheet.js (closeSheet)
 */

import { closeSheet } from './sheet.js';

/**
 * Инициализирует обработчики свайпа на документе.
 * Вызывается один раз при старте приложения.
 */
export function initSwipeToClose() {
  let startY = 0;
  let isDragging = false;
  let activeSheet = null;

  document.addEventListener('touchstart', (e) => {
    const sheet = e.target.closest('.bottom-sheet.open');
    if (!sheet) return;
    // Разрешаем свайп только с handle или header
    const handle = e.target.closest('.sheet-handle, .sheet-header');
    if (!handle) return;
    isDragging = true;
    activeSheet = sheet;
    startY = e.touches[0].clientY;
    sheet.style.transition = 'none';
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!isDragging || !activeSheet) return;
    const dy = e.touches[0].clientY - startY;
    if (dy < 0) return; // только вниз
    activeSheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!isDragging || !activeSheet) return;
    const dy = e.changedTouches[0].clientY - startY;
    activeSheet.style.transition = '';
    activeSheet.style.transform = '';
    if (dy > 80) closeSheet();
    isDragging = false;
    activeSheet = null;
  }, { passive: true });
}