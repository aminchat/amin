import { store, toast } from './utils.js';
import { icon } from './icons.js';
import { closeModal, openModal } from './modal.js';
import { render, setRender } from './view.js';
import { setOnSave, state } from './state.js';
import { renderAll, fitNumbers, setTodayLabel, txShift, repShift, togglePocket, toggleAcctGroup } from './render.js';
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
  syncDebtAmountLabel,
} from './debts.js';
import {
  applyTheme,
  bioUnlock,
  changePinPrompt,
  changePinDo,
  changePassPrompt,
  changePassDo,
  clearPin,
  disableBiometric,
  enableBiometric,
  encryptFinish,
  encryptStep2,
  encryptStep3,
  initPrefs,
  openEncryptSetup,
  openPinRestoreModal,
  openSettings,
  openSettingsAppearance,
  openSettingsSecurity,
  openSettingsGoogle,
  openSettingsScan,
  openSettingsAbout,
  lockApp,
  recoveryFinish,
  recoveryStep2,
  savePinRestore,
  rotatePhrasePrompt,
  saveGeminiKey,
  clearGeminiKey,
  setLockMode,
  showLockForRemote,
  startPhraseRecovery,
  submitLockPin,
  toggleLockMode,
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
  submitRemotePass,
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
  openPaperScan,
  startPaperPhoto,
  onPaperPhoto,
  setPaperType,
  setPaperCat,
  removePaperRow,
  savePaperTxs,
  syncTxAmountLabel,
  toggleCustomCurrency,
  transferAccountsChanged,
  updateTransferPreview,
  openQuickTx,
  qaKey,
  qaSetType,
  qaSetCat,
  qaPickAccount,
  qaChooseAccount,
  qaMore,
  qaSave,
} from './forms.js';

setRender(renderAll);
setOnSave(scheduleSync);

const TABS = [
  { id: 'home', lbl: 'خانه' },
  { id: 'tx', lbl: 'تراکنش‌ها' },
  { id: 'report', lbl: 'گزارش' },
  { id: 'assets', lbl: 'دارایی' },
];
// زیرصفحه‌های تب «دارایی»
const ASSET_TABS = [
  { id: 'accounts', lbl: 'حساب‌ها', ic: 'card', el: 'accountsContent' },
  { id: 'invest', lbl: 'سرمایه', ic: 'trend', el: 'investContent' },
  { id: 'debts', lbl: 'طلب و بدهی', ic: 'handshake', el: 'debtsContent' },
];

let curTab = 'home';
let curAsset = 'accounts';

function buildAssetTabs() {
  const wrap = document.getElementById('assetTabs');
  if (!wrap) return;
  const late = overdueCount();
  wrap.innerHTML = ASSET_TABS.map((t) => {
    const badge = t.id === 'debts' && late ? `<span class="badge" style="background:var(--red);color:#fff">${late}</span>` : '';
    return `<button type="button" class="${curAsset === t.id ? 'on' : ''}" data-sub="${t.id}">${icon(t.ic)}<span>${t.lbl}</span>${badge}</button>`;
  }).join('');
  wrap.querySelectorAll('button').forEach((b) => (b.onclick = () => setAssetTab(b.dataset.sub)));
  ASSET_TABS.forEach((t) => {
    const el = document.getElementById(t.el);
    if (el) el.style.display = t.id === curAsset ? '' : 'none';
  });
}

function setAssetTab(id) {
  if (!ASSET_TABS.some((t) => t.id === id)) return;
  curAsset = id;
  buildAssetTabs();
  const fab = document.getElementById('fab');
  if (fab) fab.title = id === 'debts' ? 'طلب یا بدهی جدید' : 'تراکنش جدید';
  fitNumbers();
}

function switchTab(id) {
  // سازگاری با کدهای قدیمی: accounts / invest / debts → تب دارایی
  if (ASSET_TABS.some((t) => t.id === id)) {
    curAsset = id;
    id = 'assets';
  }
  if (!TABS.some((t) => t.id === id)) return;
  curTab = id;
  document.querySelectorAll('section').forEach((s) => s.classList.remove('active'));
  const sec = document.getElementById('tab-' + id);
  if (sec) sec.classList.add('active');
  const title = document.getElementById('pageTitle');
  const tab = TABS.find((t) => t.id === id);
  if (title && tab) title.textContent = tab.lbl;
  const fab = document.getElementById('fab');
  if (fab) fab.title = id === 'assets' && curAsset === 'debts' ? 'طلب یا بدهی جدید' : 'تراکنش جدید';
  document.querySelectorAll('#bottomNav .bn').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
  buildAssetTabs();
  render();
  syncOnPageChange();
  window.scrollTo({ top: 0 });
}

function paintShellIcons() {
  document.querySelectorAll('#bottomNav .bn[data-ic]').forEach((b) => {
    if (!b.querySelector('svg')) b.insertAdjacentHTML('afterbegin', icon(b.dataset.ic));
  });
  const set = (id, name) => {
    const el = document.getElementById(id);
    if (el && !el.querySelector('svg')) el.innerHTML = icon(name);
  };
  set('fab', 'plus');
  set('btnSettings', 'settings');
  set('btnPrivacy', 'eye');
  document.querySelectorAll('.logo').forEach((l) => (l.innerHTML = icon('wallet')));
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
      <span class="ib lg red" style="margin-bottom:12px">${icon('logout')}</span>
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
  setAssetTab,
  closeModal,
  openBudgetForm,
  openTxForm,
  openQuickTx,
  qaKey,
  qaSetType,
  qaSetCat,
  qaPickAccount,
  qaChooseAccount,
  qaMore,
  qaSave,
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
  openPaperScan,
  startPaperPhoto,
  onPaperPhoto,
  setPaperType,
  setPaperCat,
  removePaperRow,
  savePaperTxs,
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
  toggleAcctGroup,
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
  syncDebtAmountLabel,
  enableDebtReminders,
  render,
  toast,
  applyTheme,
  openSettings,
  openSettingsAppearance,
  openSettingsSecurity,
  openSettingsGoogle,
  openSettingsScan,
  openSettingsAbout,
  lockApp,
  saveGeminiKey,
  clearGeminiKey,
  changePinPrompt,
  changePinDo,
  changePassPrompt,
  changePassDo,
  clearPin,
  enableBiometric,
  disableBiometric,
  submitLockPin,
  tryBiometric,
  bioUnlock,
  unlockApp,
  leaveApp,
  togglePrivacy,
  openEncryptSetup,
  encryptStep2,
  encryptStep3,
  encryptFinish,
  rotatePhrasePrompt,
  startPhraseRecovery,
  recoveryStep2,
  recoveryFinish,
  openPinRestoreModal,
  savePinRestore,
  setLockMode,
  showLockForRemote,
  submitRemotePass,
  toggleLockMode,
});

paintShellIcons();
document.getElementById('fab').onclick = () => {
  if (curTab === 'assets' && curAsset === 'debts') openDebtForm();
  else openTxForm();
};
document.querySelectorAll('#bottomNav .bn').forEach((b) => {
  b.onclick = () => switchTab(b.dataset.tab);
  b.classList.toggle('on', b.dataset.tab === curTab);
});
const btnPrivacy = document.getElementById('btnPrivacy');
const btnSettings = document.getElementById('btnSettings');
if (btnPrivacy) btnPrivacy.onclick = togglePrivacy;
if (btnSettings) btnSettings.onclick = openSettings;
try {
  setupBackButton();
} catch (e) {}
try {
  setTodayLabel();
  buildAssetTabs();
  render();
  initPrefs();
  notifyDueDebts();
} catch (err) {
  console.error(err);
  if (window.__capLog) window.__capLog('شروع برنامه', err);
  const dbg = document.getElementById('lockDebug');
  if (dbg) dbg.textContent = 'خطا در شروع: ' + ((err && err.message) || err);
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
