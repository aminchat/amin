import { store, toast } from './utils.js';
import { closeModal } from './modal.js';
import { render, setRender } from './view.js';
import { setOnSave, state } from './state.js';
import { renderAll, setTodayLabel, txShift, repShift } from './render.js';
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
  syncTxAmountLabel,
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
];

let curTab = 'home';

function buildNav() {
  document.getElementById('nav').innerHTML = TABS.map(
    (t) => `
    <button class="${curTab === t.id ? 'on' : ''}" data-tab="${t.id}"><span class="ni">${t.ic}</span>${t.lbl}</button>`
  ).join('');
  document.querySelectorAll('#nav button').forEach((b) => {
    b.onclick = () => switchTab(b.dataset.tab);
  });
}

function switchTab(id) {
  curTab = id;
  document.querySelectorAll('section').forEach((s) => s.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  buildNav();
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
  openAccountForm,
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
  updateTransferPreview,
  saveTransfer,
  txShift,
  repShift,
  googleSignIn,
  googleSignOut,
  openProfileMenu,
  pushToDrive,
  loadFromDrive,
  findTx,
  findAccount,
  findInvest,
  render,
  toast,
});

document.getElementById('fab').onclick = () => openTxForm();
try {
  setTodayLabel();
  buildNav();
  render();
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
  if (document.visibilityState === 'visible') refreshFromDrive();
});

const swHost = location.hostname;
const allowSW =
  swHost === 'localhost' ||
  swHost === '127.0.0.1' ||
  swHost.endsWith('.github.io') ||
  swHost.endsWith('.e2b.app');
if ('serviceWorker' in navigator && store.persisted && allowSW) {
  navigator.serviceWorker
    .register('sw.js')
    .then((reg) => {
      reg.update();
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        if (!w) return;
        w.addEventListener('statechange', () => {
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            toast('نسخه جدید برنامه آماده شد؛ در حال به‌روزرسانی…');
            setTimeout(() => location.reload(), 1200);
          }
        });
      });
    })
    .catch(() => {});
}
