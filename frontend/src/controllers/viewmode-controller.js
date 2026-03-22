/**
 * view-mode-controller.js — переключение 2D / 3D режима (мобайл)
 *
 * Слой: Controllers (Application Logic)
 *
 * Мобильная кнопка #view3dBtn проксирует клик в десктопную #viewModeBtn
 * и синхронизирует её текст.
 */

export function initViewModeToggle() {
  const view3dBtn  = document.getElementById('view3dBtn');
  const viewModeBtn = document.getElementById('viewModeBtn');

  view3dBtn?.addEventListener('click', () => {
    viewModeBtn?.click();
    // Синхронизируем текст кнопки после обновления десктопной
    if (viewModeBtn) setTimeout(() => { view3dBtn.textContent = viewModeBtn.textContent; }, 50);
  });
}