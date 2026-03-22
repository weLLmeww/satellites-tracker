/**
 * sheet.js — менеджер bottom-sheet панелей
 *
 * Слой: UI Components
 * Зависит от: ничего (pure DOM)
 */

const overlay = document.getElementById('sheetOverlay');
let currentSheet = null;

/**
 * Открыть sheet по id. Если уже открыт другой — закрывает его.
 * @param {string} id
 */
export function openSheet(id) {
  if (currentSheet && currentSheet !== id) closeSheet();
  const el = document.getElementById(id);
  if (!el) return;
  currentSheet = id;
  overlay.style.display = 'block';
  requestAnimationFrame(() => {
    overlay.classList.add('visible');
    el.classList.add('open');
  });
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.sheet === id);
  });
}

/** Закрыть текущий открытый sheet */
export function closeSheet() {
  if (!currentSheet) return;
  const el = document.getElementById(currentSheet);
  if (el) el.classList.remove('open');
  overlay.classList.remove('visible');
  setTimeout(() => { overlay.style.display = 'none'; }, 300);
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  currentSheet = null;
}

/** Вернуть id текущего открытого sheet или null */
export function getCurrentSheet() {
  return currentSheet;
}

// ── Закрытие по оверлею ──
overlay.addEventListener('click', closeSheet);
overlay.addEventListener('touchend', (e) => { e.preventDefault(); closeSheet(); }, { passive: false });

// ── Делегирование крестиков (capture: true — срабатывает до Cesium) ──
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.sheet-close');
  if (btn) { e.stopPropagation(); closeSheet(); }
}, true);

document.addEventListener('touchend', (e) => {
  const btn = e.target.closest('.sheet-close');
  if (btn) { e.preventDefault(); e.stopPropagation(); closeSheet(); }
}, { capture: true, passive: false });

// ── Навигационные кнопки ──
document.querySelectorAll('.nav-btn[data-sheet]').forEach(btn => {
  btn.addEventListener('click', () => {
    const id = btn.dataset.sheet;
    currentSheet === id ? closeSheet() : openSheet(id);
  });
});