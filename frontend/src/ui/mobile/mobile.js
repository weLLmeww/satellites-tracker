/**
 * mobile.js — точка входа мобильного UI
 *
 * Слой: Composition Root
 *
 * Собирает все модули вместе и запускает инициализацию.
 * Этот файл подключается в index.html вместо inline-скрипта.
 *
 * Порядок импортов важен: компоненты до контроллеров.
 */

// ── UI Components ──────────────────────────────
import '../components/toast.js';          // регистрирует window.showToast
import '../components/sheet.js';          // инициализирует оверлей и nav-кнопки
import { initSwipeToClose }       from '../components/swipe.js';
import '../components/observer-mode.js';  // регистрирует window.isObserverMode

// ── Controllers ────────────────────────────────
import { initSatCardSync, initPassesSync, initCounterSync }
  from '../../controllers/sync-controller.js';
import { initMobileFilters, syncMobileFilters }
  from '../../controllers/filters-controller.js';
import { initMobileCompare }      from '../../controllers/compare-controller.js';
import { initViewModeToggle }     from '../../controllers/viewmode-controller.js';

// ── Bootstrap ──────────────────────────────────
initSwipeToClose();
initSatCardSync();
initPassesSync();
initCounterSync();
initMobileFilters();
initMobileCompare();
initViewModeToggle();

// syncMobileFilters() и syncCompareOptions() вызываются из main.js
// после загрузки данных спутников через window.syncMobileFilters / window.syncCompareOptions