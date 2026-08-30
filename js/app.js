import { store, toast } from './utils.js';
import { closeModal } from './modal.js';
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
  submitLockPin,
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
  closeMenu();
  buildMenu();
  render();
  syncOnPageChange();
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
  changePinPrompt,
  clearPin,
  enableBiometric,
  disableBiometric,
  submitLockPin,
  tryBiometric,
  unlockApp,
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
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('menu-open')) closeMenu();
});
try {
  setTodayLabel();
  buildMenu();
  render();
  initPrefs();
  notifyDueDebts();
} catch (err) {
  console.error(err);
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
const allowSW =
  swHost === 'localhost' ||
  swHost === '127.0.0.1' ||
  swHost.endsWith('.github.io') ||
  swHost.endsWith('.e2b.app');
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
