import { store, toast, showTip, hideTip } from './utils.js';
import { t, t as tr, setLang, langPref, LANGS, calPref, setCalendar } from './i18n.js';
import { icon } from './icons.js';
import * as inst from './installments.js';
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
  addDebtPayment,
  delDebtPayment,
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
  openSettingsBackup,
  exportBackup,
  importBackup,
  openSettingsLanguage,
  openSettingsRates,
  openBaseCurrency,
  bcSync,
  applyBaseCurrency,
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
  { id: 'home', get lbl() { return t('nav.home'); } },
  { id: 'tx', get lbl() { return t('nav.tx'); } },
  { id: 'report', get lbl() { return t('nav.report'); } },
  { id: 'assets', get lbl() { return t('nav.assets'); } },
];
// زیرصفحه‌های تب «دارایی» (بعد از صفحهٔ مرور)
const ASSET_VIEWS = {
  accounts: { get lbl() { return t('nav.accounts'); }, el: 'accountsContent', acts: () => `<button class="btn sm icon" title="${t('act.transfer')}" onclick="openTransferForm()">${icon('swap')}</button><button class="btn sm icon primary" title="${t('act.newAccount')}" onclick="openAccountForm()">${icon('plus')}</button>` },
  invest: { get lbl() { return t('nav.invest'); }, el: 'investContent', acts: () => `<button class="btn sm icon primary" title="${t('act.newInvest')}" onclick="openInvestForm()">${icon('plus')}</button>` },
  debts: { get lbl() { return t('nav.debts'); }, el: 'debtsContent', acts: () => `<button class="btn sm icon primary" title="${t('act.newDebt')}" onclick="openDebtForm()">${icon('plus')}</button>` },
  installments: { get lbl() { return t('nav.installments'); }, el: 'installmentsContent', acts: () => `<button class="btn sm icon primary" title="${t('act.newPlan')}" onclick="openPlanForm()">${icon('plus')}</button>` },
};

let curTab = 'home';
let curAsset = ''; // '' = صفحهٔ مرور

function paintAssetView() {
  const ov = document.getElementById('assetsOverview');
  const view = document.getElementById('assetsView');
  const bar = document.getElementById('assetsViewBar');
  if (!ov || !view) return;
  const v = ASSET_VIEWS[curAsset];
  ov.style.display = v ? 'none' : '';
  view.style.display = v ? '' : 'none';
  Object.entries(ASSET_VIEWS).forEach(([k, d]) => {
    const el = document.getElementById(d.el);
    if (el) el.style.display = k === curAsset ? '' : 'none';
  });
  if (bar) {
    bar.innerHTML = v
      ? `<button type="button" class="back" onclick="setAssetTab('')" aria-label="${t('act.back')}"><span class="dir-chev">${icon('chevR')}</span></button><h2>${v.lbl}</h2><div class="acts">${v.acts()}</div>`
      : '';
  }
  const title = document.getElementById('pageTitle');
  if (title && curTab === 'assets') title.textContent = v ? v.lbl : t('nav.assets');
  const fab = document.getElementById('fab');
  if (fab) fab.title = curAsset === 'debts' ? t('act.newDebt') : curAsset === 'installments' ? t('act.newPlan') : t('act.newTx');
  fitNumbers();
}

function setAssetTab(id) {
  curAsset = ASSET_VIEWS[id] ? id : '';
  paintAssetView();
  window.scrollTo({ top: 0 });
}
function buildAssetTabs() {
  paintAssetView();
}

function switchTab(id) {
  // سازگاری با کدهای قدیمی: accounts / invest / debts / installments → تب دارایی
  if (ASSET_VIEWS[id]) {
    curAsset = id;
    id = 'assets';
  } else if (id === 'assets') curAsset = '';
  if (!TABS.some((t) => t.id === id)) return;
  curTab = id;
  document.querySelectorAll('section').forEach((s) => s.classList.remove('active'));
  const sec = document.getElementById('tab-' + id);
  if (sec) sec.classList.add('active');
  const title = document.getElementById('pageTitle');
  const tab = TABS.find((t) => t.id === id);
  if (title && tab) title.textContent = tab.lbl;
  document.querySelectorAll('#bottomNav .bn').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
  paintAssetView();
  render();
  syncOnPageChange();
  window.scrollTo({ top: 0 });
}

function paintShellIcons() {
  document.querySelectorAll('#bottomNav .bn[data-ic]').forEach((b) => {
    if (!b.querySelector('svg')) b.insertAdjacentHTML('afterbegin', icon(b.dataset.ic));
    const l = b.querySelector('.bnl');
    if (l) l.textContent = t('nav.' + b.dataset.tab);
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
  if (curTab === 'assets' && curAsset) {
    setAssetTab('');
    return true;
  }
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
      <p style="font-size:15px;margin:0 0 18px">${tr('می‌خوای از برنامه خارج شوی؟')}</p>
      <div class="row">
        <button class="btn" style="flex:1" onclick="closeModal()">${tr('نه، بمون')}</button>
        <button class="btn danger" style="flex:1" onclick="leaveApp()">${tr('بله، خارج شو')}</button>
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
  openPlanForm: inst.openPlanForm,
  openPlanDetail: inst.openPlanDetail,
  findPlan: inst.findPlan,
  savePlan: inst.savePlan,
  delPlan: inst.delPlan,
  plSetKind: inst.plSetKind,
  plSetMode: inst.plSetMode,
  plRecalc: inst.plRecalc,
  payRow: inst.payRow,
  unpayRow: inst.unpayRow,
  openPayRow: inst.openPayRow,
  confirmPayRow: inst.confirmPayRow,
  openRowEdit: inst.openRowEdit,
  saveRow: inst.saveRow,
  delRow: inst.delRow,
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
  showTip,
  hideTip,
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
  addDebtPayment,
  delDebtPayment,
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
  openSettingsBackup,
  exportBackup,
  importBackup,
  openSettingsLanguage,
  openSettingsRates,
  changeLanguage,
  changeCalendar,
  setTodayLabel,
  openBaseCurrency,
  bcSync,
  applyBaseCurrency,
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

async function changeLanguage(pref) {
  await setLang(pref);
  paintShellIcons();
  setTodayLabel();
  buildAssetTabs();
  switchTab(curTab);
  if (window.openSettingsLanguage) window.openSettingsLanguage();
}
function changeCalendar(v) {
  setCalendar(v);
  setTodayLabel();
  render();
  if (window.openSettingsLanguage) window.openSettingsLanguage();
}
paintShellIcons();
document.getElementById('fab').onclick = () => {
  if (curTab === 'assets' && curAsset === 'debts') openDebtForm();
  else if (curTab === 'assets' && curAsset === 'installments') inst.openPlanForm();
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
  if (window.__capLog) window.__capLog(tr('شروع برنامه'), err);
  const dbg = document.getElementById('lockDebug');
  if (dbg) dbg.textContent = (tr('خطا در شروع:') + ' ') + ((err && err.message) || err);
  const home = document.getElementById('homeContent');
  if (home) home.innerHTML = ('<div class="card">' + tr('برنامه بالا نیامد. صفحه را کامل ببند و دوباره باز کن.') + '</div>');
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
