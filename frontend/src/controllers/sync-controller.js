/**
 * sync-controller.js — синхронизация данных между десктопным UI и мобильными bottom sheet
 *
 * Слой: Controllers (Application Logic)
 * Зависит от: sheet.js (openSheet, closeSheet, getCurrentSheet)
 *
 * Решает проблему дублирования состояния: вся бизнес-логика живёт в
 * десктопных компонентах, мобильный UI лишь отображает те же данные.
 */

import { openSheet, closeSheet, getCurrentSheet } from '../ui/components/sheet.js';

const isMobile = () => window.innerWidth <= 768;

/* ══════════════════════════════════════════
   Карточка спутника
   ══════════════════════════════════════════ */

/** Маппинг полей: [десктоп-id, мобильный-id] */
const CARD_FIELDS = [
  ['satName',      'sheetSatName'],
  ['satCountry',   'sheetSatCountry'],
  ['satOrbitType', 'sheetSatOrbitType'],
  ['satPurpose',   'sheetSatPurpose'],
  ['satAlt',       'sheetSatAlt'],
  ['satPeriod',    'sheetSatPeriod'],
  ['satCoords',    'sheetSatCoords'],
  ['satNextPass',  'sheetSatNextPass'],
];

function syncCardFields() {
  CARD_FIELDS.forEach(([fromId, toId]) => {
    const src = document.getElementById(fromId);
    const dst = document.getElementById(toId);
    if (src && dst) dst.textContent = src.textContent;
  });
}

/**
 * Наблюдает за десктопной карточкой.
 *
 * БАГ-ФИКС: открываем sheet только при ПЕРВОМ появлении карточки
 * (transition display:none → display:block), а не при каждом изменении DOM.
 * Координаты обновляются отдельным наблюдателем без повторного открытия.
 */
export function initSatCardSync() {
  const desktopCard = document.getElementById('satCard');
  let cardWasVisible = false;

  // Наблюдатель за атрибутом style (display: block / none)
  new MutationObserver((mutations) => {
    if (!isMobile()) return;
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'style') {
        const isVisible = desktopCard.style.display === 'block';
        if (isVisible && !cardWasVisible) {
          syncCardFields();
          openSheet('sheetSatCard');
        } else if (!isVisible && cardWasVisible) {
          if (getCurrentSheet() === 'sheetSatCard') closeSheet();
        }
        cardWasVisible = isVisible;
      }
    }
  }).observe(desktopCard, { attributes: true, attributeFilter: ['style'] });

  // Отдельный наблюдатель для live-обновления координат (без openSheet)
  new MutationObserver(() => {
    if (!isMobile()) return;
    if (desktopCard.style.display !== 'block') return;
    syncCardFields();
  }).observe(desktopCard, { subtree: true, childList: true, characterData: true });
}

/* ══════════════════════════════════════════
   Список пролётов
   ══════════════════════════════════════════ */

export function initPassesSync() {
  const desktopPasses = document.getElementById('passesList');
  const mobilePasses  = document.getElementById('passesListM');

  new MutationObserver(() => {
    if (!isMobile() || !mobilePasses) return;
    mobilePasses.innerHTML = desktopPasses.innerHTML;
    mobilePasses.querySelectorAll('.pass-item').forEach((mItem, i) => {
      const dItem = desktopPasses.querySelectorAll('.pass-item')[i];
      mItem.addEventListener('click', () => {
        dItem?.click();
        // Карточка откроется через MutationObserver на satCard.style
        closeSheet();
      });
    });
  }).observe(desktopPasses, { childList: true, subtree: true, characterData: true });
}

/* ══════════════════════════════════════════
   Счётчик спутников
   ══════════════════════════════════════════ */

export function initCounterSync() {
  const satCounter = document.getElementById('satCounter');

  new MutationObserver(() => {
    const cm = document.getElementById('satCounterM');
    if (cm) cm.textContent = satCounter.textContent;
  }).observe(satCounter, { childList: true, characterData: true, subtree: true });
}