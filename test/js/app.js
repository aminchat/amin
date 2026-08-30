import { store, toast } from './utils.js';
import { closeModal, openModal } from './modal.js';
import { render, setRender } from './view.js';
import { setOnSave, state } from './state.js';
import { renderAll, setTodayLabel, txShift, repShift, togglePocket } from './render.js';
import {
  delDebt,
  enableDebtReminders,
  findDebt,
  notifyDueDebts,
  openDebtForm,
  overdueCount,
  saveDebt,
  setDebtKind,
  settleDebt,
} from './debts.js';
import {
  applyTheme,
  changePinPrompt,
  clearPin,
  disableBiometric,
  enableBiometric,
  initPrefs,
  openSettings,
  saveGeminiKey,
  clearGeminiKey,
  submitLockPin,
  togglePrivacy,
  tryBiometric,
  unlockApp,
} from './prefs.js';
import {
  googleSignIn,
  googleSignOut,
  initGoogleOnLoad,
  loadFromDrive,
  openProfileMenu,
  pushToDrive,
  refreshFromDrive,
  scheduleSync,
  syncOnPageChange,
} from './sync.js';
import {
  delAccount,
  delInvest,
  delTx,
  editInvestPrice,
  openAccountForm,
  openAccountLedger,
  openPocketLedger,
  openBudgetForm,
  openInvestForm,
  openRateEdit,
  openTransferForm,
  openTxForm,
  saveAccount,
  saveBudget,
  saveInvest,
  savePrice,
  saveRate,
  saveRateFrom,
  saveTransfer,
  saveTx,
  setTxCat,
  setTxType,
  setTxMode,
  onTxAmountInput,
  syncTxUnitTotal,
  addTxLine,
  removeTxLine,
  syncTxLine,
  setLineCat,
  addRemainderLine,
  startInvoicePhoto,
  onInvoicePhoto,
  syncTxAmountLabel,
  toggleCustomCurrency,
  transferAccountsChanged,
  updateTransferPreview,
} from './forms.js';

setRender(renderAll);
setOnSave(scheduleSync);

const TABS = [
  { id: 'home', lbl: 'خانه', ic: '🏠' },
  { id: 'tx', lbl: 'تراکنش', ic: '💸' },
  { id: 'report', lbl: 'گزارش', ic: '📊' },
  { id: 'invest', lbl: 'سرمایه', ic: '📈' },
  { id: 'accounts', lbl: 'حساب‌ها', ic: '💳' },
  { id: 'debts', lbl: 'طلب و بدهی', ic: '🤝' },
];

let curTab = 'home';

function closeMenu() {
  document.body.classList.remove('menu-open');
  const menu = document.getElementById('sideMenu');
  if (menu) menu.setAttribute('aria-hidden', 'true');
}

function openMenu() {
  buildMenu();
  document.body.classList.add('menu-open');
  const menu = document.getElementById('sideMenu');
  if (menu) menu.setAttribute('aria-hidden', 'false');
}

function toggleMenu() {
  if (document.body.classList.contains('menu-open')) closeMenu();
  else openMenu();
}

function buildMenu() {
  const late = overdueCount();
  const menuBtn = document.getElementById('btnMenu');
  if (menuBtn) menuBtn.classList.toggle('has-alert', late > 0);
  const list = document.getElementById('menuList');
  if (!list) return;
  list.innerHTML =
    TABS.map((t) => {
      const badge = t.id === 'debts' && late ? `<span class="badge-n">${late}</span>` : '';
      return `<button type="button" class="menu-item ${curTab === t.id ? 'on' : ''}" data-tab="${t.id}">
        <span class="ni">${t.ic}</span>${t.lbl}${badge}
      </button>`;
    }).join('') +
    `<div class="menu-sep"></div>
     <button type="button" class="menu-item" data-act="settings"><span class="ni">⚙</span>تنظیمات</button>`;
  list.querySelectorAll('.menu-item').forEach((b) => {
    b.onclick = () => {
      if (b.dataset.act === 'settings') {
        closeMenu();
        openSettings();
        return;
      }
      switchTab(b.dataset.tab);
    };
  });
}

function switchTab(id) {
  if (!TABS.some((t) => t.id === id)) return;
  curTab = id;
  document.querySelectorAll('section').forEach((s) => s.classList.remove('active'));
  const sec = document.getElementById('tab-' + id);
  if (sec) sec.classList.add('active');
  const title = document.getElementById('pageTitle');
  const tab = TABS.find((t) => t.id === id);
  if (title && tab) title.textContent = tab.lbl;
  const fab = document.getElementById('fab');
  if (fab) fab.title = id === 'debts' ? 'طلب یا بدهی جدید' : 'تراکنش جدید';
  const homeBtn = document.getElementById('btnHome');
  if (homeBtn) homeBtn.style.visibility = id === 'home' ? 'hidden' : '';
  closeMenu();
  buildMenu();
  render();
  syncOnPageChange();
}

function isLocked() {
  return !!(
    document.documentElement.classList.contains('needs-lock') ||
    (document.getElementById('lockScreen') && document.getElementById('lockScreen').classList.contains('show'))
  );
}

function handleAppBack() {
  const overlay = document.getElementById('overlay');
  if (overlay && overlay.classList.contains('show')) {
    closeModal();
    return true;
  }
  if (document.body.classList.contains('menu-open')) {
    closeMenu();
    return true;
  }
  if (isLocked()) return true;
  if (curTab !== 'home') {
    switchTab('home');
    return true;
  }
  return false;
}

function askLeaveApp() {
  openModal(`
    <div style="text-align:center;padding:10px 4px">
      <div style="font-size:38px;margin-bottom:10px">🚪</div>
      <p style="font-size:15px;margin:0 0 18px">می‌خوای از برنامه خارج شوی؟</p>
      <div class="row">
        <button class="btn" style="flex:1" onclick="closeModal()">نه، بمون</button>
        <button class="btn danger" style="flex:1" onclick="leaveApp()">بله، خارج شو</button>
      </div>
    </div>`);
}

let leavingApp = false;
function leaveApp() {
  leavingApp = true;
  closeModal();
  try {
    window.close();
  } catch (e) {}
  history.go(-2);
}

function setupBackButton() {
  history.replaceState({ cap: 0 }, '');
  history.pushState({ cap: 1 }, '');
  window.addEventListener('popstate', () => {
    if (leavingApp) return;
    if (handleAppBack()) {
      history.pushState({ cap: 1 }, '');
      return;
    }
    history.pushState({ cap: 1 }, '');
    askLeaveApp();
  });
}

function findTx(id) {
  return state.transactions.find((x) => x.id === id);
}
function findAccount(id) {
  return state.accounts.find((x) => x.id === id);
}
function findInvest(id) {
  return state.investments.find((x) => x.id === id);
}

Object.assign(window, {
  switchTab,
  closeModal,
  openBudgetForm,
  openTxForm,
  setTxType,
  setTxCat,
  saveTx,
  delTx,
  syncTxAmountLabel,
  setTxMode,
  onTxAmountInput,
  syncTxUnitTotal,
  addTxLine,
  removeTxLine,
  syncTxLine,
  setLineCat,
  addRemainderLine,
  startInvoicePhoto,
  onInvoicePhoto,
  openAccountForm,
  openAccountLedger,
  openPocketLedger,
  saveAccount,
  delAccount,
  openInvestForm,
  saveInvest,
  delInvest,
  editInvestPrice,
  savePrice,
  saveBudget,
  openRateEdit,
  saveRate,
  saveRateFrom,
  openTransferForm,
  toggleCustomCurrency,
  transferAccountsChanged,
  updateTransferPreview,
  saveTransfer,
  txShift,
  repShift,
  togglePocket,
  googleSignIn,
  googleSignOut,
  openProfileMenu,
  pushToDrive,
  loadFromDrive,
  findTx,
  findAccount,
  findInvest,
  findDebt,
  openDebtForm,
  saveDebt,
  delDebt,
  settleDebt,
  setDebtKind,
  enableDebtReminders,
  render,
  toast,
  applyTheme,
  openSettings,
  saveGeminiKey,
  clearGeminiKey,
  changePinPrompt,
  clearPin,
  enableBiometric,
  disableBiometric,
  submitLockPin,
  tryBiometric,
  unlockApp,
  leaveApp,
  togglePrivacy,
});

document.getElementById('fab').onclick = () => {
  if (curTab === 'debts') openDebtForm();
  else openTxForm();
};
const btnMenu = document.getElementById('btnMenu');
const btnMenuClose = document.getElementById('btnMenuClose');
const menuScrim = document.getElementById('menuScrim');
if (btnMenu) btnMenu.onclick = toggleMenu;
if (btnMenuClose) btnMenuClose.onclick = closeMenu;
if (menuScrim) menuScrim.onclick = closeMenu;
const btnHome = document.getElementById('btnHome');
if (btnHome) {
  btnHome.style.visibility = 'hidden';
  btnHome.onclick = () => switchTab('home');
}
const btnPrivacy = document.getElementById('btnPrivacy');
const btnSettings = document.getElementById('btnSettings');
if (btnPrivacy) btnPrivacy.onclick = togglePrivacy;
if (btnSettings) btnSettings.onclick = openSettings;
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('menu-open')) closeMenu();
});
try {
  setupBackButton();
} catch (e) {}
try {
  setTodayLabel();
  buildMenu();
  render();
  initPrefs();
  notifyDueDebts();
} catch (err) {
  console.error(err);
  if (window.__capLog) window.__capLog('شروع برنامه', err);
  const home = document.getElementById('homeContent');
  if (home) home.innerHTML = '<div class="card">برنامه بالا نیامد. صفحه را کامل ببند و دوباره باز کن.</div>';
}

if (typeof google !== 'undefined') {
  initGoogleOnLoad();
} else {
  let gt = setInterval(function () {
    if (typeof google !== 'undefined') {
      clearInterval(gt);
      initGoogleOnLoad();
    }
  }, 250);
  setTimeout(function () {
    clearInterval(gt);
  }, 12000);
}

document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible') {
    refreshFromDrive();
    notifyDueDebts();
  }
});

const swHost = location.hostname;
const allowSW = false;
if ('serviceWorker' in navigator && store.persisted && allowSW) {
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker
    .register('sw.js', { updateViaCache: 'none' })
    .then((reg) => {
      const kick = (w) => {
        if (w) w.postMessage('skipWaiting');
      };
      if (reg.waiting) kick(reg.waiting);
      reg.update();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update();
      });
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed') kick(w);
        });
      });
    })
    .catch(() => {});
}
