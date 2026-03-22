/**
 * compare-controller.js — мобильная панель сравнения группировок
 *
 * Слой: Controllers (Application Logic)
 *
 * Проксирует действия мобильного UI в десктопный, копирует результат обратно.
 */

/**
 * Синхронизирует <option>-ы в мобильных селектах сравнения из десктопных.
 * Вызывается из main.js при обновлении списка группировок.
 */
export function syncCompareOptions() {
  const pairs = [
    ['compareA', 'compareAM'],
    ['compareB', 'compareBM'],
  ];
  pairs.forEach(([deskId, mobileId]) => {
    const desk   = document.getElementById(deskId);
    const mobile = document.getElementById(mobileId);
    if (desk && mobile) mobile.innerHTML = desk.innerHTML;
  });
}

window.syncCompareOptions = syncCompareOptions;

/** Вешает обработчики кнопок Сравнить / Сбросить */
export function initMobileCompare() {
  const compareBtnM      = document.getElementById('compareBtnM');
  const compareResetBtnM = document.getElementById('compareResetBtnM');

  compareBtnM?.addEventListener('click', () => {
    const aVal = document.getElementById('compareAM')?.value;
    const bVal = document.getElementById('compareBM')?.value;
    const aD   = document.getElementById('compareA');
    const bD   = document.getElementById('compareB');
    if (aD) aD.value = aVal;
    if (bD) bD.value = bVal;

    document.getElementById('compareBtn')?.click();

    setTimeout(() => {
      const statsM = document.getElementById('compareStatsM');
      const statsD = document.getElementById('compareStats');
      if (statsM && statsD) statsM.innerHTML = statsD.innerHTML;
      compareBtnM.style.display = 'none';
      if (compareResetBtnM) compareResetBtnM.style.display = 'block';
    }, 100);
  });

  compareResetBtnM?.addEventListener('click', () => {
    document.getElementById('compareResetBtn')?.click();
    const statsM = document.getElementById('compareStatsM');
    if (statsM) statsM.innerHTML = '';
    if (compareBtnM)      compareBtnM.style.display      = 'block';
    if (compareResetBtnM) compareResetBtnM.style.display = 'none';
  });
}