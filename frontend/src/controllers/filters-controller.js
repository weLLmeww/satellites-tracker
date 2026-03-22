/**
 * filters-controller.js — мобильная панель фильтров
 *
 * Слой: Controllers (Application Logic)
 *
 * Проксирует действия мобильных фильтров в десктопные селекты,
 * чтобы вся логика фильтрации оставалась в одном месте.
 */

/**
 * Копирует <option>-ы из одного select в другой.
 * @param {string} fromId
 * @param {string} toId
 */
function copyOptions(fromId, toId) {
  const from = document.getElementById(fromId);
  const to   = document.getElementById(toId);
  if (!from || !to) return;
  to.innerHTML = from.innerHTML;
}

/**
 * Синхронизирует мобильные селекты с десктопными.
 * Вызывается из main.js после загрузки данных о спутниках.
 */
export function syncMobileFilters() {
  copyOptions('filterCountry',  'filterCountryM');
  copyOptions('filterOrbit',    'filterOrbitM');
  copyOptions('filterPurpose',  'filterPurposeM');
  copyOptions('filterCountry',  'compareAM');
  copyOptions('filterCountry',  'compareBM');

  // Добавляем placeholder в селекты сравнения
  ['compareAM', 'compareBM'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— выберите —';
    sel.insertBefore(opt, sel.firstChild);
    sel.value = '';
  });
}

// Экспортируем как глобальный хук для main.js
window.syncMobileFilters = syncMobileFilters;

/**
 * Вешает обработчики на мобильные фильтры.
 * Изменение мобильного → меняет десктоп → тригерит desktopChange.
 */
export function initMobileFilters() {
  const FILTER_MAP = {
    filterCountryM: 'filterCountry',
    filterOrbitM:   'filterOrbit',
    filterPurposeM: 'filterPurpose',
  };

  Object.entries(FILTER_MAP).forEach(([mobileId, desktopId]) => {
    document.getElementById(mobileId)?.addEventListener('change', () => {
      const desktop = document.getElementById(desktopId);
      if (desktop) {
        desktop.value = document.getElementById(mobileId).value;
        desktop.dispatchEvent(new Event('change'));
      }
      _syncCounter();
    });
  });

  document.getElementById('resetFiltersBtnM')?.addEventListener('click', () => {
    document.getElementById('resetFiltersBtn')?.click();
    Object.keys(FILTER_MAP).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = 'ALL';
    });
    _syncCounter();
  });
}

function _syncCounter() {
  setTimeout(() => {
    const c  = document.getElementById('satCounter');
    const cm = document.getElementById('satCounterM');
    if (c && cm) cm.textContent = c.textContent;
  }, 50);
}