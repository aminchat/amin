import { esc, fmt, fmtShort, store, toast, uid, todayISO, haptic, toFa, infoTip, amountWords, pctSign, decSep } from './utils.js';
import { icon } from './icons.js';
import { hasGeminiKey, readInvoiceImage, readPaperTxImage } from './scan.js';
import { jalaliNow, monthOfISO, fmtDate, monthLabel, curMonthKey, bookNow, bookCalendar } from './jalali.js';
import { jalaliMonths, gregMonths } from './i18n.js';
import { closeModal, openModal, askConfirm } from './modal.js';
import { render } from './view.js';
import {
  ACCT_TYPES,
  CATS,
  KNOWN_BANKS,
  accountById,
  accountCurrent,
  addCustomCurrency,
  allCurrencies,
  curName,
  isBigUnit,
  catById,
  loanFlow,
  catCeiling,
  catCarried,
  catSpent,
  isInvoice,
  isTransfer,
  pocketItems,
  runningBalanceByTxId,
  save,
  sortTxs,
  state,
  accountGroups,
  accountOptGroups,
  institutionOf, baseCur, rateOf } from './state.js';
import { t as tr } from './i18n.js';
import { titleChipsHtml, subChipsHtml, lookupTitle, learnTitle, subsFor } from './subs.js';
import { pickSub } from './subsui.js';

const LAST_ACCT_KEY = 'capital_last_account';

function rememberAccount(id) {
  if (id) store.set(LAST_ACCT_KEY, id);
}

function lastAccountId() {
  const id = store.get(LAST_ACCT_KEY);
  if (id && accountById(id)) return id;
  return state.accounts[0] ? state.accounts[0].id : '';
}

const CUSTOM_CUR = '__custom__';

// گزینه‌های واحد پول + گزینه «سایر» برای افزودن دستی
function currencyOptions(selected) {
  return (
    allCurrencies()
      .map((c) => `<option value="${esc(c)}" ${c === selected ? 'selected' : ''}>${esc(curName(c))}</option>`)
      .join('') + `<option value="${CUSTOM_CUR}">${tr('سایر (افزودن دستی…)')}</option>`
  );
}

export function toggleCustomCurrency(prefix) {
  const sel = document.getElementById(prefix + 'Cur');
  const wrap = document.getElementById(prefix + 'CurCustomWrap');
  if (!sel || !wrap) return;
  wrap.style.display = sel.value === CUSTOM_CUR ? '' : 'none';
  if (sel.value === CUSTOM_CUR) {
    const inp = document.getElementById(prefix + 'CurCustom');
    if (inp) inp.focus();
  }
}

// خواندن واحد پول انتخاب‌شده؛ اگر دستی بود، به لیست واحدها هم اضافه می‌شود
function readCurrencyChoice(prefix) {
  const sel = document.getElementById(prefix + 'Cur');
  if (!sel) return baseCur();
  if (sel.value !== CUSTOM_CUR) return sel.value;
  const inp = document.getElementById(prefix + 'CurCustom');
  const name = (inp ? inp.value : '').trim();
  if (!name) return null;
  addCustomCurrency(name);
  return name;
}

let editingTxId = null;
let txReturnTo = ''; // فراخوانیِ صفحه‌ای که فرم از آن باز شده؛ بعد از ذخیره/حذف همان‌جا برمی‌گردیم
let editingAcctId = null;
let editingInvId = null;
let editingTransferPair = null;
let transferStoredRates = {};
let txMode = 'simple';
let draftLines = [];
let txSub = '';
let paperDraft = [];

function catChipsHtml(selected, onclickName, extraArg) {
  // پاکت قرض/امانت فقط از بخش «طلب و بدهی» پر می‌شود؛ در فرم تراکنش نمایش داده نمی‌شود
  return CATS.filter((c) => !c.loan).map((c) => {
    const on = c.id === selected;
    const extra = extraArg ? ",'" + extraArg + "'" : '';
    return `<button type="button" class="chip ${on ? 'on' : ''}" data-cat="${c.id}"
      style="${on ? 'background:' + c.color : ''}"
      onclick="${onclickName}(this${extra})">
      ${icon('cat_' + c.id)} ${c.label}
    </button>`;
  }).join('');
}

function nearlyZero(n) {
  return Math.abs(n) < 0.000001;
}

export function openTxForm(tx, opts) {
  txReturnTo = (opts && opts.back) || '';
  if (tx && isTransfer(tx)) {
    openTransferForm(tx);
    return;
  }
  if (tx && tx.planId) {
    import('./installments.js').then((m) => m.openPlanDetail(tx.planId));
    toast(tr('این تراکنش از بخش اقساط ساخته شده؛ همان‌جا ویرایشش کن'));
    return;
  }
  if (tx && tx.debtId) {
    // تراکنشِ وصل به طلب/بدهی از خودِ آن بخش ویرایش می‌شود تا هماهنگ بماند
    const d = (state.debts || []).find((x) => x.id === tx.debtId);
    if (d) {
      import('./debts.js').then((m) => m.openDebtForm(d));
      toast(tr('این تراکنش از بخش طلب/بدهی ساخته شده؛ همان‌جا ویرایشش کن'));
      return;
    }
  }

  if (state.accounts.length === 0) {
    openModal(`
      <h2>${tr('ابتدا یک حساب بساز')}</h2>
      <div class="empty"><span class="ib lg muted">${icon('card')}</span>${tr('برای ثبت تراکنش باید حداقل یک حساب یا کارت تعریف کنی.')}</div>
      <button class="btn primary block" onclick="closeModal();switchTab('accounts');openAccountForm()">${tr('ساخت حساب')}</button>`);
    return;
  }
  // تراکنش جدید → فرم سریع دو مرحله‌ای (مگر اینکه فرم کامل خواسته شده باشد)
  if (!tx && !(opts && opts.full)) {
    openQuickTx(opts || {});
    return;
  }

  editingTxId = tx ? tx.id : null;
  const isEdit = !!tx;
  const pre = (opts && opts.prefill) || {};
  const type = tx ? tx.type : pre.type || 'out';
  const presetCat = !tx && (pre.cat || (opts && opts.cat)) ? pre.cat || opts.cat : null;

  txMode = tx && isInvoice(tx) ? 'invoice' : 'simple';
  draftLines = tx && isInvoice(tx) ? tx.lines.map((l) => Object.assign({}, l)) : [];
  txSub = tx && !isInvoice(tx) ? tx.sub || '' : (pre.sub || '');

  const selectedAccountId = tx ? tx.accountId : pre.accountId || lastAccountId();
  const selectedAccount = accountById(selectedAccountId);
  const amountCur = selectedAccount ? selectedAccount.currency : baseCur();
  const acctOpts = accountOptGroups(selectedAccountId);
  const defaultCat = tx && !isInvoice(tx) ? (tx.cat === 'loan' ? 'need' : tx.cat) : presetCat || 'need';
  const showReflect = !!(defaultCat === 'waste' && type === 'out' && txMode === 'simple');

  openModal(`
    <button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <h2>${isEdit ? (txMode === 'invoice' ? tr('ویرایش فاکتور') : tr('ویرایش تراکنش')) : tr('تراکنش جدید')}</h2>
    <div class="seg" id="txTypeSeg" style="margin-bottom:10px">
      <button class="${type === 'out' ? 'on out' : ''}" data-t="out" onclick="setTxType(this)">${tr('خرج')} −</button>
      <button class="${type === 'in' ? 'on' : ''}" data-t="in" onclick="setTxType(this)">${tr('درآمد +')}</button>
    </div>
    <div class="seg" id="txModeSeg" style="margin-bottom:14px;${type === 'in' ? 'display:none' : ''}">
      <button class="${txMode === 'simple' ? 'on' : ''}" data-m="simple" onclick="setTxMode(this)">${tr('خرج ساده')}</button>
      <button class="${txMode === 'invoice' ? 'on' : ''}" data-m="invoice" onclick="setTxMode(this)">${tr('فاکتور')}</button>
    </div>
    <div id="txScanWrap" style="${isEdit ? 'display:none' : ''}">
      <input id="invPhotoCam" type="file" accept="image/*" capture="environment" style="display:none" onchange="onInvoicePhoto(this)">
      <input id="invPhotoGal" type="file" accept="image/*" style="display:none" onchange="onInvoicePhoto(this)">
      <div class="row" id="txInvScanRow" style="margin-bottom:8px;${type === 'in' ? 'display:none' : ''}">
        <button type="button" class="btn sm" style="flex:1" onclick="startInvoicePhoto('cam')">${icon('camera')} ${tr('عکس فاکتور')}</button>
        <button type="button" class="btn sm" style="flex:1" onclick="startInvoicePhoto('gal')">${icon('folder')} ${tr('فاکتور از گالری')}</button>
      </div>
      <button type="button" class="btn block" style="margin-bottom:12px" onclick="openPaperScan()">${icon('scan')} ${tr('لیست چند تراکنش از عکس کاغذ')}</button>
    </div>
    <div class="field"><label id="txAmountLbl">${txMode === 'invoice' ? tr('مبلغ کل فاکتور') : tr('مبلغ')} (${esc(curName(amountCur))})</label>
      <input class="input" id="txAmount" type="number" step="any" inputmode="decimal" min="0" placeholder="${tr('مثلاً 250000')}" value="${tx ? tx.amount : pre.amount || ''}" oninput="onTxAmountInput()">
    </div>
    <div id="txUnitWrap" style="${txMode === 'invoice' ? 'display:none' : ''}">
      <div class="row">
        <div class="col field"><label>${tr('قیمت واحد')}</label>
          <input class="input" id="txUnitPrice" type="number" step="any" inputmode="decimal" min="0" placeholder="${tr('مثلاً 80000')}" value="${tx && tx.unitPrice ? tx.unitPrice : ''}" oninput="syncTxUnitTotal()">
        </div>
        <div class="col field"><label>${tr('مقدار')}</label>
          <input class="input" id="txQty" type="number" step="any" inputmode="decimal" min="0" placeholder="${tr('مثلاً ۲.۵')}" value="${tx && tx.qty ? tx.qty : ''}" oninput="syncTxUnitTotal()">
        </div>
      </div>
      <div class="field"><label>${tr('واحد (اختیاری)')}</label>
        <input class="input" id="txUnit" placeholder="${tr('عدد / کیلو / گرم')}" value="${tx && tx.unit ? esc(tx.unit) : ''}">
      </div>
    </div>
    <div class="field"><label>${tr('از کدام حساب؟')}</label>
      <select class="input" id="txAccount" onchange="syncTxAmountLabel()">${acctOpts}</select>
    </div>
    <div class="field" id="txCatWrap" style="${type === 'in' || txMode === 'invoice' ? 'display:none' : ''}">
      <label>${tr('دسته‌بندی خرج')}</label>
      <div class="chips" id="txCats">${catChipsHtml(defaultCat, 'setTxCat')}</div>
      <div id="txSubWrap" style="margin-top:8px">${subChipsHtml(defaultCat, txSub, 'setTxSub')}</div>
      <div id="txTitleChips" style="margin-top:8px">${titleChipsHtml(defaultCat, 'pickTxTitle')}</div>
    </div>
    <div class="field" id="txReflectWrap" style="${showReflect ? '' : 'display:none'}">
      <label>${tr('اگر این خرج را نمی‌کردی، چه می‌شد؟')}</label>
      <textarea class="input" id="txReflect" placeholder="${tr('مثلاً: می‌توانستم همان پول را پس‌انداز کنم...')}">${tx && tx.reflect ? esc(tx.reflect) : ''}</textarea>
    </div>
    <div id="txInvoiceWrap" style="${txMode === 'invoice' ? '' : 'display:none'}">
      <div id="txLines"></div>
      <div id="txRemain" class="hint" style="margin:8px 0 10px"></div>
      <div class="row" style="margin-bottom:12px">
        <button type="button" class="btn sm" style="flex:1" onclick="addTxLine()">${icon('plus')} ${tr('قلم')}</button>
        <button type="button" class="btn sm" style="flex:1" onclick="addRemainderLine()">${tr('مانده را «سایر» کن')}</button>
      </div>
    </div>
    <div class="field"><label>${tr('توضیح (اختیاری)')}</label>
      <input class="input" id="txNote" placeholder="${txMode === 'invoice' ? tr('مثلاً: فروشگاه رفاه') : tr('مثلاً: خرید هفتگی')}" value="${tx ? esc(tx.note || '') : esc(pre.note || '')}" oninput="onTxNoteInput(this)">
    </div>
    <div class="field"><label>${tr('تاریخ')}</label>
      <input class="input" id="txDate" type="date" value="${tx ? tx.dateISO : pre.dateISO || todayISO()}">
    </div>
    <button class="btn primary block" onclick="saveTx()">${isEdit ? tr('ذخیره تغییرات') : tr('ثبت')}</button>
    ${isEdit ? `<button class="btn danger block" style="margin-top:8px" onclick="delTx('${tx.id}')">${txMode === 'invoice' ? tr('حذف این فاکتور') : tr('حذف این تراکنش')}</button>` : ''}
  `);
  { const ai = document.getElementById('txAmount'); if (ai) ai.dataset.cur = amountCur; } // ارزِ مبدأ برای تبدیل هنگام تغییر حساب
  if (txMode === 'invoice') {
    if (!draftLines.length) addTxLine(presetCat || 'need');
    else renderTxLines();
  } else if (type === 'in') {
    applyTxModeUi();
  }
}

export function syncTxAmountLabel() {
  const sel = document.getElementById('txAccount');
  const a = accountById(sel.value);
  const lbl = document.getElementById('txAmountLbl');
  if (!lbl) return;
  const cur = a ? a.currency : baseCur();
  // تغییر حساب به ارز دیگر: عدد را تبدیل کن یا لااقل هشدار بده (۳۰۰ هزار تومان نباید بی‌صدا ۳۰۰ هزار دلار شود)
  const amtInp = document.getElementById('txAmount');
  const prevCur = (amtInp && amtInp.dataset.cur) || '';
  const val = parseFloat(amtInp && amtInp.value);
  if (amtInp && prevCur && prevCur !== cur && val > 0) {
    const from = rateOf(prevCur);
    const to = rateOf(cur);
    if (from && to) {
      const conv = Math.round((val * from) / to * 100) / 100;
      amtInp.value = conv;
      toast(tr('مبلغ از {a} به {b} تبدیل شد: {v}', { a: curName(prevCur), b: curName(cur), v: fmt(conv) }));
    } else {
      toast(tr('حساب مقصد ارز دیگری دارد ({b})؛ مبلغ را دوباره وارد کن', { b: curName(cur) }));
      amtInp.value = '';
    }
    amtInp.dispatchEvent(new Event('input'));
  }
  lbl.textContent = (txMode === 'invoice' ? tr('مبلغ کل فاکتور') : tr('مبلغ')) + ' (' + curName(cur) + ')';
  ['txAmount', 'txUnitPrice'].forEach((id) => {
    const inp = document.getElementById(id);
    if (inp) {
      inp.dataset.cur = cur;
      if (inp.value) inp.value = inp.value; // بازنویسی «به حروف»
    }
  });
}

export function onTxAmountInput() {
  if (txMode === 'invoice') updateInvoiceRemain();
}

export function syncTxUnitTotal() {
  if (txMode !== 'simple') return;
  const p = parseFloat((document.getElementById('txUnitPrice') || {}).value);
  const q = parseFloat((document.getElementById('txQty') || {}).value);
  const amt = document.getElementById('txAmount');
  if (!amt) return;
  if (p > 0 && q > 0) amt.value = String(p * q);
}

export function setTxMode(btn) {
  txMode = btn.dataset.m === 'invoice' ? 'invoice' : 'simple';
  document.querySelectorAll('#txModeSeg button').forEach((b) => b.classList.remove('on'));
  btn.classList.add('on');
  applyTxModeUi();
}

function applyTxModeUi() {
  const typeBtn = document.querySelector('#txTypeSeg button.on');
  const isOut = typeBtn && typeBtn.dataset.t === 'out';
  if (!isOut) txMode = 'simple';
  const inv = isOut && txMode === 'invoice';
  const modeSeg = document.getElementById('txModeSeg');
  if (modeSeg) modeSeg.style.display = isOut ? '' : 'none';
  const scanWrap = document.getElementById('txScanWrap');
  if (scanWrap && !editingTxId) scanWrap.style.display = '';
  const invScan = document.getElementById('txInvScanRow');
  if (invScan) invScan.style.display = isOut ? '' : 'none';
  const unitWrap = document.getElementById('txUnitWrap');
  const catWrap = document.getElementById('txCatWrap');
  const invWrap = document.getElementById('txInvoiceWrap');
  if (unitWrap) unitWrap.style.display = inv ? 'none' : '';
  if (catWrap) catWrap.style.display = !isOut || inv ? 'none' : '';
  if (invWrap) invWrap.style.display = inv ? '' : 'none';
  const reflect = document.getElementById('txReflectWrap');
  if (inv && reflect) reflect.style.display = 'none';
  syncTxAmountLabel();
  if (inv) {
    if (!draftLines.length) addTxLine();
    else renderTxLines();
  }
}

export function setTxType(btn) {
  const t = btn.dataset.t;
  document.querySelectorAll('#txTypeSeg button').forEach((b) => b.classList.remove('on', 'out'));
  btn.classList.add('on');
  if (t === 'out') btn.classList.add('out');
  if (t === 'in') {
    txMode = 'simple';
    document.querySelectorAll('#txModeSeg button').forEach((b) => {
      b.classList.toggle('on', b.dataset.m === 'simple');
    });
  }
  applyTxModeUi();
  if (t === 'in') {
    const rw = document.getElementById('txReflectWrap');
    if (rw) rw.style.display = 'none';
  } else if (txMode === 'simple') {
    const active = document.querySelector('#txCats .chip.on');
    const rw = document.getElementById('txReflectWrap');
    if (rw) rw.style.display = active && active.dataset.cat === 'waste' ? '' : 'none';
  }
}

export function setTxCat(btn) {
  document.querySelectorAll('#txCats .chip').forEach((c) => {
    c.classList.remove('on');
    c.style.background = '';
  });
  btn.classList.add('on');
  btn.style.background = CATS.find((c) => c.id === btn.dataset.cat).color;
  const rw = document.getElementById('txReflectWrap');
  if (rw) rw.style.display = btn.dataset.cat === 'waste' && txMode === 'simple' ? '' : 'none';
  const cat = btn.dataset.cat;
  if (!subsFor(cat).some((x) => x.id === txSub)) txSub = '';
  const sw = document.getElementById('txSubWrap');
  if (sw) sw.innerHTML = subChipsHtml(cat, txSub, 'setTxSub');
  const tc = document.getElementById('txTitleChips');
  if (tc) tc.innerHTML = titleChipsHtml(cat, 'pickTxTitle');
}
export function setTxSub(btn) {
  const active = document.querySelector('#txCats .chip.on');
  pickSub(btn, active ? active.dataset.cat : 'need', (sub) => { txSub = sub; });
}
// چیپ عنوان: عنوان + زیرشاخه + آخرین مبلغ (قابل اصلاح) پر می‌شود
export function pickTxTitle(btn) {
  const note = document.getElementById('txNote');
  if (note) note.value = btn.dataset.title || '';
  const m = lookupTitle(btn.dataset.title);
  const sub = btn.dataset.sub || (m && m.sub) || '';
  const cat = m && m.cat;
  if (cat) {
    const chip = document.querySelector('#txCats .chip[data-cat="' + cat + '"]');
    if (chip && !chip.classList.contains('on')) setTxCat(chip);
  }
  txSub = sub;
  const active = document.querySelector('#txCats .chip.on');
  const sw = document.getElementById('txSubWrap');
  if (sw) sw.innerHTML = subChipsHtml(active ? active.dataset.cat : 'need', txSub, 'setTxSub');
  const amt = Number(btn.dataset.amt) || (m && m.amt) || 0;
  const a = document.getElementById('txAmount');
  if (a && !a.value && amt) {
    a.value = String(amt);
    a.dispatchEvent(new Event('input', { bubbles: true }));
    a.focus();
    try { a.select(); } catch (e) {}
  }
  haptic(4);
}
// عنوان تایپ‌شده → پاکت/زیرشاخهٔ یادگرفته‌شده (اگر کاربر هنوز دست نزده)
export function onTxNoteInput(el) {
  const m = lookupTitle(el.value);
  if (!m) return;
  if (m.sub && !txSub) {
    txSub = m.sub;
    const active = document.querySelector('#txCats .chip.on');
    if (active && active.dataset.cat !== m.cat) {
      const chip = document.querySelector('#txCats .chip[data-cat="' + m.cat + '"]');
      if (chip) setTxCat(chip);
    }
    const sw = document.getElementById('txSubWrap');
    if (sw) sw.innerHTML = subChipsHtml(m.cat, txSub, 'setTxSub');
  }
}

function readDraftLinesFromDom() {
  draftLines.forEach((l) => {
    const name = document.getElementById('lnName_' + l.id);
    const price = document.getElementById('lnPrice_' + l.id);
    const qty = document.getElementById('lnQty_' + l.id);
    const unit = document.getElementById('lnUnit_' + l.id);
    if (name) l.name = name.value;
    if (price) l.unitPrice = price.value;
    if (qty) l.qty = qty.value;
    if (unit) l.unit = unit.value;
    const rf = document.getElementById('lnReflect_' + l.id);
    if (rf) l.reflect = rf.value;
    const p = parseFloat(l.unitPrice) || 0;
    const q = parseFloat(l.qty) || 0;
    l.amount = p > 0 && q > 0 ? p * q : 0;
  });
}

function lineSum() {
  return draftLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
}

function updateInvoiceRemain() {
  const box = document.getElementById('txRemain');
  if (!box) return;
  const total = parseFloat((document.getElementById('txAmount') || {}).value) || 0;
  const sum = lineSum();
  const rem = total - sum;
  if (!total) {
    box.innerHTML = tr('اول مبلغ کل فاکتور را بنویس.');
    return;
  }
  if (nearlyZero(rem)) {
    box.innerHTML = ('<b style="color:var(--green)">' + tr('جمع اقلام با مبلغ کل یکی است') + ' ✓</b>');
    return;
  }
  if (rem > 0) {
    box.innerHTML = (tr('مانده برای تخصیص:') + ' <b>') + fmt(rem) + ('</b> — ' + tr('یا یک قلم دیگر بزن، یا «مانده را سایر کن».'));
    return;
  }
  box.innerHTML = '<span style="color:var(--red)">' + tr('جمع اقلام {a} از مبلغ کل {b} بیشتر است.', { a: fmt(sum), b: fmt(total) }) + '</span>';
}

export function renderTxLines() {
  const box = document.getElementById('txLines');
  if (!box) return;
  if (!draftLines.length) {
    box.innerHTML = ('<div class="small muted" style="margin-bottom:8px">' + tr('هنوز قلمی نیست.') + '</div>');
    updateInvoiceRemain();
    return;
  }
  box.innerHTML = draftLines
    .map((l) => {
      const p = parseFloat(l.unitPrice) || 0;
      const q = parseFloat(l.qty) || 0;
      const amt = p > 0 && q > 0 ? p * q : Number(l.amount) || 0;
      l.amount = amt;
      const cat = l.cat || 'need';
      return `<div class="inv-line" data-id="${l.id}">
        <div class="field" style="margin-bottom:8px"><label>${tr('نام قلم')}</label>
          <input class="input" id="lnName_${l.id}" placeholder="${tr('مثلاً شیر')}" value="${esc(l.name || '')}" oninput="syncTxLine('${l.id}')">
        </div>
        <div class="row">
          <div class="col field"><label>${tr('قیمت واحد')}</label>
            <input class="input" id="lnPrice_${l.id}" type="number" step="any" inputmode="decimal" min="0" value="${l.unitPrice || ''}" oninput="syncTxLine('${l.id}')">
          </div>
          <div class="col field"><label>${tr('مقدار')}</label>
            <input class="input" id="lnQty_${l.id}" type="number" step="any" inputmode="decimal" min="0" value="${l.qty || ''}" oninput="syncTxLine('${l.id}')">
          </div>
        </div>
        <div class="row">
          <div class="col field"><label>${tr('واحد')}</label>
            <input class="input" id="lnUnit_${l.id}" placeholder="${tr('عدد / کیلو')}" value="${esc(l.unit || '')}" oninput="syncTxLine('${l.id}')">
          </div>
          <div class="col field"><label>${tr('مبلغ این قلم')}</label>
            <div class="input" id="lnAmt_${l.id}" style="display:flex;align-items:center;font-weight:800">${fmt(amt)}</div>
          </div>
        </div>
        <div class="field" style="margin-bottom:8px"><label>${tr('پاکت این قلم')}</label>
          <div class="chips">${catChipsHtml(cat, 'setLineCat', l.id)}</div>
          <div id="lnSub_${l.id}" style="margin-top:8px">${subChipsHtml(cat, l.sub || '', 'setLineSub', l.id)}</div>
          <div id="lnTitles_${l.id}" style="margin-top:8px">${l.name ? '' : titleChipsHtml(cat, 'pickLineTitle_' + l.id)}</div>
        </div>
        ${cat === 'waste' ? `<div class="field" style="margin-bottom:8px"><label>${tr('اگر این خرج را نمی‌کردی، چه می‌شد؟')}</label>
          <input class="input" id="lnReflect_${l.id}" value="${esc(l.reflect || '')}" oninput="syncTxLine('${l.id}')"></div>` : ''}
        <button type="button" class="btn sm danger block" onclick="removeTxLine('${l.id}')">${tr('حذف این قلم')}</button>
      </div>`;
    })
    .join('');
  for (const l of draftLines) window['pickLineTitle_' + l.id] = (btn) => pickLineTitle(l.id, btn);
  updateInvoiceRemain();
}

export function addTxLine(catId) {
  readDraftLinesFromDom();
  draftLines.push({
    id: uid(),
    name: '',
    unitPrice: '',
    qty: '',
    unit: '',
    amount: 0,
    cat: typeof catId === 'string' ? catId : 'need',
  });
  renderTxLines();
}

export function removeTxLine(id) {
  readDraftLinesFromDom();
  draftLines = draftLines.filter((l) => l.id !== id);
  renderTxLines();
}

export function syncTxLine(id) {
  const l = draftLines.find((x) => x.id === id);
  if (!l) return;
  const name = document.getElementById('lnName_' + id);
  const price = document.getElementById('lnPrice_' + id);
  const qty = document.getElementById('lnQty_' + id);
  const unit = document.getElementById('lnUnit_' + id);
  if (name) l.name = name.value;
  if (price) l.unitPrice = price.value;
  if (qty) l.qty = qty.value;
  if (unit) l.unit = unit.value;
  const rf = document.getElementById('lnReflect_' + id);
  if (rf) l.reflect = rf.value;
  if (name && !l.sub) {
    const m = lookupTitle(l.name);
    if (m && m.sub && m.cat === (l.cat || 'need')) {
      l.sub = m.sub;
      const sw = document.getElementById('lnSub_' + id);
      if (sw) sw.innerHTML = subChipsHtml(l.cat || 'need', l.sub, 'setLineSub', id);
    }
  }
  const p = parseFloat(l.unitPrice) || 0;
  const q = parseFloat(l.qty) || 0;
  l.amount = p > 0 && q > 0 ? p * q : 0;
  const amtEl = document.getElementById('lnAmt_' + id);
  if (amtEl) amtEl.textContent = fmt(l.amount);
  updateInvoiceRemain();
}

export function setLineSub(btn, lineId) {
  const l = draftLines.find((x) => x.id === lineId);
  if (!l) return;
  pickSub(btn, l.cat || 'need', (sub) => { l.sub = sub; });
}
// pickLineTitle_<id> به‌صورت پویا روی window ست می‌شود (renderTxLines)
export function pickLineTitle(lineId, btn) {
  const l = draftLines.find((x) => x.id === lineId);
  if (!l) return;
  readDraftLinesFromDom();
  l.name = btn.dataset.title || '';
  l.sub = btn.dataset.sub || l.sub || '';
  const amt = Number(btn.dataset.amt) || 0;
  if (amt && !(parseFloat(l.unitPrice) > 0)) {
    l.unitPrice = String(amt);
    l.qty = l.qty || '1';
  }
  renderTxLines();
  const q = document.getElementById('lnQty_' + lineId);
  if (q) q.focus();
}
export function setLineCat(btn, lineId) {
  const l = draftLines.find((x) => x.id === lineId);
  if (!l) return;
  l.cat = btn.dataset.cat;
  const wrap = btn.parentElement;
  if (wrap) {
    wrap.querySelectorAll('.chip').forEach((c) => {
      c.classList.remove('on');
      c.style.background = '';
    });
  }
  btn.classList.add('on');
  const found = CATS.find((c) => c.id === l.cat);
  if (found) btn.style.background = found.color;
  if (!subsFor(l.cat).some((x) => x.id === l.sub)) l.sub = '';
  readDraftLinesFromDom();
  renderTxLines();
}

export function startInvoicePhoto(kind) {
  if (!hasGeminiKey()) {
    toast(tr('اول در تنظیمات کلید عکس را بگذار'));
    return;
  }
  const id = kind === 'gal' ? 'invPhotoGal' : 'invPhotoCam';
  const inp = document.getElementById(id);
  if (inp) inp.click();
}

function matchAccountId(name) {
  const n = String(name || '')
    .trim()
    .replace(/\s+/g, '');
  if (!n) return lastAccountId();
  const digits = n.replace(/\D/g, '');
  for (const a of state.accounts) {
    const an = String(a.name || '').replace(/\s+/g, '');
    if (an && (an === n || an.indexOf(n) >= 0 || n.indexOf(an) >= 0)) return a.id;
    if (a.last4 && (n.indexOf(String(a.last4)) >= 0 || digits.indexOf(String(a.last4)) >= 0)) return a.id;
  }
  return lastAccountId();
}

export function openPaperScan() {
  if (state.accounts.length === 0) {
    toast(tr('اول یک حساب بساز'));
    return;
  }
  if (!hasGeminiKey()) {
    toast(tr('اول در تنظیمات کلید عکس را بگذار'));
    return;
  }
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <h2>${tr('ثبت از عکس کاغذ')}</h2>
    <p class="small muted" style="margin-top:-6px">${tr('عکس کاغذ یا فیش بانک با دست‌نویس را بده. مستقیم ذخیره می‌شود؛ بعداً از لیست می‌توانی ویرایش کنی. اگر تومان نوشتی همان تومان است؛ مبلغ ریالِ فیش تقسیم بر ۱۰ می‌شود. هر جا «فاکتور» بنویسی یک فاکتور ثبت می‌شود.')}</p>
    <input id="paperCam" type="file" accept="image/*" capture="environment" style="display:none" onchange="onPaperPhoto(this)">
    <input id="paperGal" type="file" accept="image/*" style="display:none" onchange="onPaperPhoto(this)">
    <button type="button" class="btn primary block" onclick="startPaperPhoto('cam')">${icon('camera')} ${tr('عکس بگیر')}</button>
    <button type="button" class="btn block" style="margin-top:8px" onclick="startPaperPhoto('gal')">${icon('folder')} ${tr('از گالری انتخاب کن')}</button>
  `);
}

export function startPaperPhoto(kind) {
  if (!hasGeminiKey()) {
    toast(tr('اول در تنظیمات کلید عکس را بگذار'));
    return;
  }
  const id = kind === 'gal' ? 'paperGal' : 'paperCam';
  const inp = document.getElementById(id);
  if (inp) inp.click();
}

export async function onPaperPhoto(inp) {
  const file = inp && inp.files && inp.files[0];
  if (inp) inp.value = '';
  if (!file) return;
  toast(tr('در حال خواندن عکس…'));
  try {
    const names = state.accounts.map((a) => a.name);
    const rows = await readPaperTxImage(file, names);
    paperDraft = rows.map((r) => ({
      id: uid(),
      type: r.type === 'in' ? 'in' : 'out',
      amount: r.amount,
      cat: r.type === 'in' || r.kind === 'invoice' ? null : r.cat || 'need',
      note: r.note || '',
      accountId: matchAccountId(r.account) || lastAccountId(),
      dateISO: r.date || todayISO(),
      kind: r.kind === 'invoice' ? 'invoice' : '',
      qty: r.qty || 0,
      unit: r.unit || '',
      unitPrice: r.unitPrice || 0,
      lines: r.kind === 'invoice' ? r.lines || [] : [],
    }));
    if (!paperDraft.length) {
      toast(tr('در عکس تراکنشی پیدا نشد'));
      return;
    }
    savePaperTxs();
  } catch (e) {
    closeModal();
    if (e && e.message === 'NO_KEY') toast(tr('اول در تنظیمات کلید عکس را بگذار'));
    else toast((e && e.message) || tr('خواندن عکس نشد'));
  }
}

function paperAcctOpts(selected) {
  return accountOptGroups(selected);
}

export function openPaperReview() {
  if (!paperDraft.length) {
    toast(tr('چیزی برای ثبت نیست'));
    return;
  }
  const rows = paperDraft
    .map((r) => {
      const cat = r.cat || 'need';
      return `<div class="inv-line" data-id="${r.id}">
        <div class="seg" style="margin-bottom:10px">
          <button type="button" class="${r.type === 'out' ? 'on out' : ''}" data-t="out" onclick="setPaperType(this,'${r.id}')">${tr('خرج')} −</button>
          <button type="button" class="${r.type === 'in' ? 'on' : ''}" data-t="in" onclick="setPaperType(this,'${r.id}')">${tr('درآمد +')}</button>
        </div>
        <div class="field"><label>${tr('مبلغ')}</label>
          <input class="input" id="pAmt_${r.id}" type="number" step="any" inputmode="decimal" min="0" value="${r.amount || ''}">
        </div>
        <div class="field" id="pCatWrap_${r.id}" style="${r.type === 'in' ? 'display:none' : ''}"><label>${tr('پاکت')}</label>
          <div class="chips">${catChipsHtml(cat, 'setPaperCat', r.id)}</div>
        </div>
        <div class="field"><label>${tr('حساب')}</label>
          <select class="input" id="pAcct_${r.id}">${paperAcctOpts(r.accountId)}</select>
        </div>
        <div class="field"><label>${tr('توضیح')}</label>
          <input class="input" id="pNote_${r.id}" value="${esc(r.note || '')}" placeholder="${tr('مثلاً نان')}">
        </div>
        <div class="field"><label>${tr('تاریخ')}</label>
          <input class="input" id="pDate_${r.id}" type="date" value="${r.dateISO || todayISO()}">
        </div>
        <button type="button" class="btn sm danger block" onclick="removePaperRow('${r.id}')">${tr('حذف این مورد')}</button>
      </div>`;
    })
    .join('');
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <h2>${tr('چک کن، بعد ثبت کن')}</h2>
    <p class="small muted" style="margin-top:-6px">${paperDraft.length} ${tr('مورد خوانده شد. اگر چیزی غلط است همین‌جا درستش کن. بعد از ثبت هم در لیست قابل ویرایش است.')}</p>
    ${rows}
    <button class="btn primary block" onclick="savePaperTxs()">${tr('ثبت همه')}</button>
  `);
}

function readPaperDraftFromDom() {
  paperDraft.forEach((r) => {
    const amt = document.getElementById('pAmt_' + r.id);
    const acct = document.getElementById('pAcct_' + r.id);
    const note = document.getElementById('pNote_' + r.id);
    const date = document.getElementById('pDate_' + r.id);
    if (amt) r.amount = parseFloat(amt.value) || 0;
    if (acct) r.accountId = acct.value;
    if (note) r.note = note.value.trim();
    if (date) r.dateISO = date.value || todayISO();
  });
}

export function setPaperType(btn, id) {
  const r = paperDraft.find((x) => x.id === id);
  if (!r) return;
  r.type = btn.dataset.t === 'in' ? 'in' : 'out';
  if (r.type === 'in') r.cat = null;
  else if (!r.cat) r.cat = 'need';
  const wrap = btn.parentElement;
  if (wrap) {
    wrap.querySelectorAll('button').forEach((b) => b.classList.remove('on', 'out'));
  }
  btn.classList.add('on');
  if (r.type === 'out') btn.classList.add('out');
  const catWrap = document.getElementById('pCatWrap_' + id);
  if (catWrap) catWrap.style.display = r.type === 'in' ? 'none' : '';
}

export function setPaperCat(btn, id) {
  const r = paperDraft.find((x) => x.id === id);
  if (!r) return;
  r.cat = btn.dataset.cat;
  const wrap = btn.parentElement;
  if (wrap) {
    wrap.querySelectorAll('.chip').forEach((c) => {
      c.classList.remove('on');
      c.style.background = '';
    });
  }
  btn.classList.add('on');
  const found = CATS.find((c) => c.id === r.cat);
  if (found) btn.style.background = found.color;
}

export function removePaperRow(id) {
  readPaperDraftFromDom();
  paperDraft = paperDraft.filter((r) => r.id !== id);
  if (!paperDraft.length) {
    closeModal();
    toast(tr('همه موارد حذف شد'));
    return;
  }
  openPaperReview();
}

export function savePaperTxs() {
  readPaperDraftFromDom();
  paperDraft = paperDraft.filter((r) => r.amount > 0);
  if (!paperDraft.length) {
    toast(tr('چیزی برای ثبت نیست'));
    return;
  }
  for (const r of paperDraft) {
    if (!accountById(r.accountId)) r.accountId = lastAccountId();
    if (!accountById(r.accountId)) {
      toast(tr('اول یک حساب بساز'));
      return;
    }
  }
  const stamp = Date.now();
  let n = 0;
  for (const r of paperDraft) {
    const dateISO = r.dateISO || todayISO();
    const type = r.type === 'in' ? 'in' : 'out';
    const invoice = type === 'out' && r.kind === 'invoice' && r.lines && r.lines.length;
    const lines = invoice
      ? r.lines.map((l) => ({
          id: l.id || uid(),
          name: String(l.name || '').trim() || tr('قلم'),
          unitPrice: Number(l.unitPrice) || Number(l.amount) || 0,
          qty: Number(l.qty) || 1,
          unit: String(l.unit || tr('عدد')).trim() || tr('عدد'),
          amount: (Number(l.unitPrice) || Number(l.amount) || 0) * (Number(l.qty) || 1),
          cat: l.cat || 'need',
        }))
      : [];
    const amount = invoice ? lines.reduce((s, l) => s + l.amount, 0) : r.amount;
    state.transactions.push({
      id: uid(),
      amount,
      accountId: r.accountId,
      note: r.note || '',
      dateISO,
      type,
      cat: invoice ? null : type === 'out' ? r.cat || 'need' : null,
      reflect: '',
      month: monthOfISO(dateISO),
      updatedAt: stamp + n,
      kind: invoice ? 'invoice' : '',
      lines,
      unitPrice: invoice ? 0 : r.unitPrice || 0,
      qty: invoice ? 0 : r.qty || 0,
      unit: invoice ? '' : r.unit || '',
    });
    rememberAccount(r.accountId);
    n += 1;
  }
  paperDraft = [];
  save();
  closeModal();
  render();
  toast(n + (' ' + tr('مورد ذخیره شد')));
}

export async function onInvoicePhoto(inp) {
  const file = inp && inp.files && inp.files[0];
  if (inp) inp.value = '';
  if (!file) return;
  toast(tr('در حال خواندن عکس…'));
  try {
    const data = await readInvoiceImage(file);
    applyInvoiceScan(data);
    toast(tr('خوانده شد — قبل از ثبت چک کن'));
  } catch (e) {
    if (e && e.message === 'NO_KEY') toast(tr('اول در تنظیمات کلید عکس را بگذار'));
    else toast((e && e.message) || tr('خواندن عکس نشد'));
  }
}

export function applyInvoiceScan(data) {
  txMode = 'invoice';
  draftLines = (data.lines || []).map((l) => ({
    id: l.id || uid(),
    name: l.name,
    unitPrice: l.unitPrice,
    qty: l.qty,
    unit: l.unit || tr('عدد'),
    amount: l.amount,
    cat: l.cat || 'need',
  }));
  document.querySelectorAll('#txModeSeg button').forEach((b) => {
    b.classList.toggle('on', b.dataset.m === 'invoice');
  });
  applyTxModeUi();
  const amt = document.getElementById('txAmount');
  if (amt && data.total) amt.value = String(data.total);
  const note = document.getElementById('txNote');
  if (note && data.store && !note.value) note.value = data.store;
  const dateEl = document.getElementById('txDate');
  if (dateEl && data.date) dateEl.value = data.date;
  renderTxLines();
}

export function addRemainderLine() {
  readDraftLinesFromDom();
  const total = parseFloat((document.getElementById('txAmount') || {}).value) || 0;
  const rem = total - lineSum();
  if (rem <= 0) {
    toast(tr('مانده‌ای نمانده'));
    return;
  }
  draftLines.push({
    id: uid(),
    name: tr('سایر'),
    unitPrice: rem,
    qty: 1,
    unit: tr('قلم'),
    amount: rem,
    cat: 'need',
  });
  renderTxLines();
}

export function saveTx() {
  const onBtn = document.querySelector('#txTypeSeg button.on');
  if (!onBtn) {
    toast(tr('نوع تراکنش را انتخاب کن'));
    return;
  }
  const type = onBtn.dataset.t;
  if (type !== 'in' && type !== 'out') {
    toast(tr('این مورد را از فرم انتقال ویرایش کن'));
    return;
  }
  const accountId = document.getElementById('txAccount').value;
  const note = document.getElementById('txNote').value.trim();
  const dateISO = document.getElementById('txDate').value || todayISO();
  const month = monthOfISO(dateISO);
  const stamp = Date.now();
  rememberAccount(accountId);

  const invoice = type === 'out' && txMode === 'invoice';
  let amount;
  let cat = null;
  let reflect = '';
  let unitPrice = 0;
  let qty = 0;
  let unit = '';
  let lines = [];
  let kind = '';

  if (invoice) {
    readDraftLinesFromDom();
    amount = parseFloat(document.getElementById('txAmount').value);
    if (!amount || amount <= 0) {
      toast(tr('مبلغ کل فاکتور را بنویس'));
      return;
    }
    if (!draftLines.length) {
      toast(tr('حداقل یک قلم اضافه کن'));
      return;
    }
    for (const l of draftLines) {
      if (!(parseFloat(l.unitPrice) > 0) || !(parseFloat(l.qty) > 0)) {
        toast(tr('برای هر قلم، قیمت واحد و مقدار را بنویس'));
        return;
      }
      if (!String(l.name || '').trim()) {
        toast(tr('نام هر قلم را بنویس'));
        return;
      }
    }
    const sum = lineSum();
    if (!nearlyZero(amount - sum)) {
      toast(tr('جمع اقلام باید با مبلغ کل یکی باشد'));
      return;
    }
    kind = 'invoice';
    lines = draftLines.map((l) => ({
      id: l.id || uid(),
      name: String(l.name || '').trim(),
      unitPrice: parseFloat(l.unitPrice),
      qty: parseFloat(l.qty),
      unit: String(l.unit || '').trim(),
      amount: parseFloat(l.unitPrice) * parseFloat(l.qty),
      cat: l.cat || 'need',
      sub: l.sub || '',
      reflect: (l.cat || 'need') === 'waste' ? String(l.reflect || '').trim() : '',
    }));
    for (const l of lines) learnTitle(l.name, l.cat, l.sub, l.unitPrice);
  } else {
    const p = parseFloat((document.getElementById('txUnitPrice') || {}).value) || 0;
    const q = parseFloat((document.getElementById('txQty') || {}).value) || 0;
    unit = ((document.getElementById('txUnit') || {}).value || '').trim();
    if (p > 0 && q > 0) {
      amount = p * q;
      unitPrice = p;
      qty = q;
      const amtEl = document.getElementById('txAmount');
      if (amtEl) amtEl.value = String(amount);
    } else {
      amount = parseFloat(document.getElementById('txAmount').value);
      unitPrice = 0;
      qty = 0;
      unit = '';
    }
    if (!amount || amount <= 0) {
      toast(tr('مبلغ را درست وارد کن'));
      return;
    }
    const activeCat = document.querySelector('#txCats .chip.on');
    cat = type === 'out' ? (activeCat ? activeCat.dataset.cat : 'need') : null;
    const rf = document.getElementById('txReflect');
    reflect = type === 'out' && cat === 'waste' && rf ? rf.value.trim() : '';
    if (type === 'out' && note) learnTitle(note, cat, txSub, amount);
  }

  const payload = {
    amount,
    accountId,
    note,
    dateISO,
    type,
    cat,
    sub: type === 'out' && !invoice ? txSub || '' : '',
    reflect,
    month,
    updatedAt: stamp,
    kind,
    lines,
    unitPrice,
    qty,
    unit,
  };

  if (editingTxId) {
    const t = state.transactions.find((x) => x.id === editingTxId);
    if (!t || isTransfer(t)) {
      toast(tr('این انتقال را از فرم مخصوصش ویرایش کن'));
      return;
    }
    Object.assign(t, payload);
    toast(tr('ویرایش شد'));
  } else {
    state.transactions.push(Object.assign({ id: uid() }, payload));
    toast(invoice ? (tr('فاکتور ثبت شد') + ' ✓') : (tr('ثبت شد') + ' ✓'));
  }
  haptic(10);
  save();
  closeModal();
  render();
  returnAfterTx();
}
// برگشت به صفحه‌ای که تراکنش از آن باز شده بود (دفترچهٔ پاکت، گزارش سه‌سطحی، …)
function returnAfterTx() {
  const back = txReturnTo;
  txReturnTo = '';
  if (!back) return;
  try { new Function(back)(); } catch (e) { /* صفحهٔ مبدأ دیگر معتبر نیست */ }
}

/* ═══════════════════ فرم سریع دو مرحله‌ای ═══════════════════ */
const qa = { amount: '', type: 'out', cat: 'need', accountId: '', dateISO: '', note: '', sub: '' };

// عدد به حروف کوتاه (برای تأیید مبلغ زیر صفحه‌کلید)
// حذف صفرهای اضافی فقط در بخش اعشاری («۵۰» دست‌نخورده می‌ماند)
function acctLabel(a) {
  const inst = institutionOf(a);
  return inst && inst !== a.name ? inst + ' · ' + a.name : a.name;
}

export function openQuickTx(opts) {
  const rep = opts.repeatOf || null;
  qa.amount = rep ? String(rep.amount || '') : opts.amount ? String(opts.amount) : '';
  qa.type = rep ? (rep.type === 'in' ? 'in' : 'out') : 'out';
  qa.cat = rep && rep.cat && rep.cat !== 'loan' ? rep.cat : opts.cat || 'need';
  qa.accountId = (rep && accountById(rep.accountId) ? rep.accountId : '') || lastAccountId();
  qa.dateISO = todayISO();
  qa.note = rep ? rep.note || '' : '';
  qa.sub = rep ? rep.sub || '' : '';
  editingTxId = null;
  txMode = 'simple';
  draftLines = [];
  const acct = accountById(qa.accountId);
  const cur = acct ? acct.currency : baseCur();

  openModal(`
    <button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <div class="seg" id="qaType" style="margin:0 44px var(--sp-2) 0">
      <button type="button" class="${qa.type === 'out' ? 'on out' : ''}" data-t="out" onclick="qaSetType('out')">${tr('خرج')}</button>
      <button type="button" class="${qa.type === 'in' ? 'on in' : ''}" data-t="in" onclick="qaSetType('in')">${tr('درآمد')}</button>
    </div>
    <div class="qa-amount">
      <div class="kbd-display empty" id="qaDisp">${toFa(0)}</div>
      <div class="qa-words" id="qaWords"></div>
      <div class="cur" id="qaCur">${esc(curName(cur))}</div>
    </div>
    <div id="qaCatsWrap" style="${qa.type === 'in' ? 'display:none' : ''}">
      <div class="qa-cats" id="qaCats"></div>
      <div id="qaTitles" class="qa-titles"></div>
    </div>
    <div class="kbd" id="qaKbd">
      ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<button type="button" onclick="qaKey('${d}')">${toFa(d)}</button>`).join('')}
      <button type="button" class="fn" id="qaFnKey" onclick="qaFn()">${isBigUnit(cur) ? toFa('000') : decSep()}</button>
      <button type="button" onclick="qaKey('0')">${toFa(0)}</button>
      <button type="button" class="fn del" onclick="qaKey('del')" aria-label="${tr('پاک کردن')}">${icon('back')}</button>
    </div>
    <div class="qa-meta">
      <button type="button" class="btn sm" id="qaAcctBtn" onclick="qaPickAccount()">${icon('card')}<b id="qaAcctName">${acct ? esc(acctLabel(acct)) : '—'}</b></button>
      <button type="button" class="btn sm" onclick="qaMore()">${icon('edit')}<b>${tr('یادداشت، تاریخ، فاکتور…')}</b></button>
    </div>
    <div class="qa-submit">
      <button type="button" class="btn primary" onclick="qaSave()">${icon('check')} ${tr('ثبت')}</button>
    </div>
  `);
  qaRenderCats();
  qaPaint();
}

function qaRenderCats() {
  const wrap = document.getElementById('qaCats');
  if (!wrap) return;
  wrap.innerHTML = CATS.filter((c) => !c.loan)
    .map(
      (c) => `<button type="button" class="qa-cat ${qa.cat === c.id ? 'on' : ''}" style="--c:${c.color}" onclick="qaSetCat('${c.id}')">
        <span class="ib" style="color:${c.color}">${icon('cat_' + c.id)}</span><span>${c.label}</span></button>`
    )
    .join('');
  const on = wrap.querySelector('.on');
  if (on && on.scrollIntoView) try { on.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) {}
  qaRenderTitles();
}
function qaRenderTitles() {
  const box = document.getElementById('qaTitles');
  if (!box) return;
  box.innerHTML = qa.type === 'out' ? titleChipsHtml(qa.cat, 'qaPickTitle') : '';
  if (qa.note) {
    const on = [...box.querySelectorAll('.tchip')].find((b) => b.dataset.title === qa.note);
    if (on) on.classList.add('on');
  }
}
export function qaPickTitle(btn) {
  const same = qa.note === btn.dataset.title;
  qa.note = same ? '' : btn.dataset.title || '';
  qa.sub = same ? '' : btn.dataset.sub || '';
  const m = lookupTitle(qa.note);
  if (!same && m && m.cat && m.cat !== qa.cat) {
    qa.cat = m.cat;
    qaRenderCats();
  }
  if (!same && !qa.amount) {
    const amt = Number(btn.dataset.amt) || (m && m.amt) || 0;
    if (amt) qa.amount = String(amt);
  }
  haptic(4);
  qaRenderTitles();
  qaPaint();
}

function qaPaint() {
  const disp = document.getElementById('qaDisp');
  const words = document.getElementById('qaWords');
  if (!disp) return;
  const n = Number(qa.amount) || 0;
  disp.textContent = qa.amount ? fmt(n) + (qa.amount.endsWith('.') ? decSep() : /\.\d*0$/.test(qa.amount) ? '' : '') : toFa(0);
  if (qa.amount && /\.(\d*)$/.test(qa.amount) && !qa.amount.endsWith('.')) {
    // نمایش دقیق اعشار تایپ‌شده (fmt ممکن است صفرهای انتهایی را حذف کند)
    const [ip, dp] = qa.amount.split('.');
    disp.textContent = fmt(Number(ip)) + decSep() + toFa(dp);
  }
  disp.classList.toggle('empty', !n);
  if (words) words.textContent = amountWords(n).replace(/\s\S+$/, '');
}

export function qaKey(k) {
  if (k === 'del') qa.amount = qa.amount.slice(0, -1);
  else if (k === '000') { if (qa.amount && !qa.amount.includes('.')) qa.amount += '000'; }
  else if (k === '.') { if (!qa.amount.includes('.')) qa.amount = (qa.amount || '0') + '.'; }
  else {
    const dec = qa.amount.split('.')[1];
    if (dec != null && dec.length >= 8) return;
    qa.amount += k;
  }
  qa.amount = qa.amount.replace(/^0+(?=\d)/, '').slice(0, 16);
  haptic(4);
  qaPaint();
}
// کلید تابعی کیبورد: «۰۰۰» برای واحدهای بزرگ (تومان)، «.» برای بقیه
function qaCurrency() {
  const a = accountById(qa.accountId);
  return (a && a.currency) || baseCur();
}
export function qaFn() {
  qaKey(isBigUnit(qaCurrency()) ? '000' : '.');
}
function qaPaintFnKey() {
  const b = document.getElementById('qaFnKey');
  if (b) b.textContent = isBigUnit(qaCurrency()) ? toFa('000') : decSep();
}

export function qaSetType(t) {
  qa.type = t;
  document.querySelectorAll('#qaType button').forEach((b) => {
    b.classList.toggle('on', b.dataset.t === t);
    b.classList.toggle('out', b.dataset.t === 'out' && t === 'out');
    b.classList.toggle('in', b.dataset.t === 'in' && t === 'in');
  });
  const cw = document.getElementById('qaCatsWrap');
  if (cw) cw.style.display = t === 'in' ? 'none' : '';
  qaRenderTitles();
}

export function qaSetCat(id) {
  qa.cat = id;
  haptic(4);
  qaRenderCats();
}

export function qaPickAccount() {
  // چرخش بین حساب‌ها اگر کم باشند؛ در غیر این صورت انتخاب از لیست
  const list = state.accounts;
  if (list.length <= 1) return;
  const wrap = document.getElementById('qaAcctBtn');
  const row = (a) => `<button type="button" class="srow" style="min-height:44px" onclick="qaChooseAccount('${a.id}')">
        <span class="ib sm">${icon(a.type === 'ارز دیجیتال' ? 'coin' : a.type === 'نقدی' ? 'cash' : a.type === 'کیف پول آنلاین' ? 'phone' : 'card')}</span>
        <span class="smid"><span class="st1">${esc(a.name)}</span><span class="st2">${esc(tr(a.type))} · ${esc(curName(a.currency))}</span></span>
        ${a.id === qa.accountId ? icon('check') : ''}</button>`;
  const gs = accountGroups(list);
  const grouped = gs.length > 1 || (gs[0] && gs[0].key !== '__none');
  const html = `<div class="card" style="margin:0 0 var(--sp-2);padding:var(--sp-2);max-height:40vh;overflow:auto" id="qaAcctList">${gs
    .map(
      (g) =>
        (grouped
          ? `<div class="small muted" style="display:flex;align-items:center;gap:6px;padding:8px 8px 4px;font-weight:700">${icon(g.key === '__none' ? 'folder' : 'bank')} ${esc(g.label)}</div>`
          : '') + g.accts.map(row).join('')
    )
    .join('')}</div>`;
  const existing = document.getElementById('qaAcctList');
  if (existing) { existing.remove(); return; }
  if (wrap) wrap.parentElement.insertAdjacentHTML('beforebegin', html);
}

export function qaChooseAccount(id) {
  qa.accountId = id;
  const a = accountById(id);
  const nm = document.getElementById('qaAcctName');
  const cu = document.getElementById('qaCur');
  if (nm && a) nm.textContent = acctLabel(a);
  if (cu && a) cu.textContent = curName(a.currency);
  if (a && isBigUnit(a.currency) && qa.amount.includes('.')) qa.amount = String(Math.round(Number(qa.amount) || 0) || '');
  qaPaintFnKey();
  qaPaint();
  const l = document.getElementById('qaAcctList');
  if (l) l.remove();
}

// رفتن به فرم کامل با حفظ چیزهایی که تا اینجا وارد شده
export function qaMore() {
  openTxForm(null, {
    full: true,
    prefill: { amount: Number(qa.amount) || '', type: qa.type, cat: qa.cat, sub: qa.sub, accountId: qa.accountId, note: qa.note, dateISO: qa.dateISO },
  });
}

export function qaSave() {
  const amount = Number(qa.amount) || 0;
  if (amount <= 0) {
    toast(tr('مبلغ را وارد کن'));
    haptic(30);
    return;
  }
  const dateISO = qa.dateISO || todayISO();
  rememberAccount(qa.accountId);
  state.transactions.push({
    id: uid(),
    amount,
    accountId: qa.accountId,
    note: qa.note || '',
    dateISO,
    type: qa.type,
    cat: qa.type === 'out' ? qa.cat : null,
    sub: qa.type === 'out' ? qa.sub || '' : '',
    reflect: '',
    month: monthOfISO(dateISO),
    updatedAt: Date.now(),
    kind: '',
    lines: [],
    unitPrice: 0,
    qty: 0,
    unit: '',
  });
  if (qa.type === 'out' && qa.note) learnTitle(qa.note, qa.cat, qa.sub, amount);
  haptic(10);
  save();
  closeModal();
  render();
  toast((tr('ثبت شد') + ' ✓'));
}

function pairTransactions(idOrPair) {
  const t = state.transactions.find((x) => x.id === idOrPair || x.pair === idOrPair);
  if (!t) return [];
  if (t.pair) return state.transactions.filter((x) => x.pair === t.pair);
  return [t];
}

export function delTx(id) {
  const group = pairTransactions(id);
  const isPair = group.length > 1;
  const inv = group.length === 1 && isInvoice(group[0]);
  askConfirm(
    isPair ? tr('این انتقال (هر دو طرف) حذف شود؟') : inv ? tr('این فاکتور و همه اقلامش حذف شود؟') : tr('این تراکنش حذف شود؟'),
    () => {
    const ids = new Set(group.map((x) => x.id));
    // اگر تراکنش قسط بود، ردیفش هم به حالت پرداخت‌نشده برگردد
    for (const g of group) {
      if (g.planId && g.planRowId && state.installments) {
        const p = state.installments.find((x) => x.id === g.planId);
        const r = p && (p.rows || []).find((x) => x.id === g.planRowId);
        if (r) { r.paidISO = null; r.txId = null; p.updatedAt = Date.now(); }
      }
    }
    state.transactions = state.transactions.filter((t) => !ids.has(t.id));
    save();
    render();
    returnAfterTx();
    toast(tr('حذف شد'));
  });
}

export function openAccountForm(a, presetBank) {
  editingAcctId = a ? a.id : null;
  const isEdit = !!a;
  if (!a && presetBank) a = { bank: presetBank, name: '', type: ACCT_TYPES[0], currency: baseCur(), initial: '' , __preset: true };
  if (a && a.__preset) { editingAcctId = null; }
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <h2>${isEdit && !a.__preset ? tr('ویرایش حساب') : tr('حساب جدید')}</h2>
    <div class="field"><label>${tr('بانک / صرافی / مؤسسه')}</label>
      <input class="input" id="aBank" list="bankList" placeholder="${tr('مثلاً بانک ملت، نوبیتکس، نقد')}" value="${a ? esc(a.bank || '') : ''}" autocomplete="off">
      <datalist id="bankList">${[...new Set([...state.accounts.map((x) => x.bank).filter(Boolean), ...KNOWN_BANKS])]
        .map((b) => `<option value="${esc(b)}"></option>`)
        .join('')}</datalist>
      <div class="small muted" style="margin-top:6px">${tr('حساب‌های یک مؤسسه در صفحهٔ حساب‌ها یک‌کاسه نشان داده می‌شوند.')}</div>
    </div>
    <div class="field"><label>${tr('نام حساب / کارت')}</label>
      <input class="input" id="aName" placeholder="${tr('مثلاً کارت حقوق، حساب پس‌انداز')}" value="${a ? esc(a.name) : ''}">
    </div>
    <div class="field"><label>${tr('نوع')}</label>
      <select class="input" id="aType">
        ${ACCT_TYPES.map((t) => `<option value="${t}" ${a && a.type === t ? 'selected' : ''}>${tr(t)}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>${tr('واحد پول')}</label>
      <select class="input" id="aCur" onchange="toggleCustomCurrency('a')">
        ${currencyOptions(a ? a.currency : baseCur())}
      </select>
    </div>
    <div class="field" id="aCurCustomWrap" style="display:none"><label>${tr('نام واحد پول جدید')}</label>
      <input class="input" id="aCurCustom" placeholder="${tr('مثلاً روبل، ین، بیت‌کوین')}">
      <div class="small muted" style="margin-top:6px">${tr('این واحد به لیست اضافه می‌شود و دفعه بعد در گزینه‌ها هست.')}</div>
    </div>
    <div class="field"><label>${tr('۴ رقم آخر کارت (اختیاری)')}</label>
      <input class="input" id="aLast4" inputmode="numeric" maxlength="4" placeholder="1234" value="${a ? esc(a.last4 || '') : ''}">
    </div>
    <div class="field"><label>${tr('موجودی اولیه')}</label>
      <input class="input" id="aInit" type="number" step="any" inputmode="decimal" placeholder="${toFa(0)}" value="${a ? a.initial : ''}">
    </div>
    <button class="btn primary block" onclick="saveAccount()">${isEdit && !a.__preset ? tr('ذخیره') : tr('افزودن حساب')}</button>
  `);
}

export function saveAccount() {
  const name = document.getElementById('aName').value.trim();
  if (!name) {
    toast(tr('نام حساب را بنویس'));
    return;
  }
  const currency = readCurrencyChoice('a');
  if (!currency) {
    toast(tr('نام واحد پول را بنویس'));
    return;
  }
  const data = {
    name,
    bank: (document.getElementById('aBank').value || '').trim(),
    type: document.getElementById('aType').value,
    currency,
    last4: document.getElementById('aLast4').value.trim(),
    initial: parseFloat(document.getElementById('aInit').value) || 0,
    updatedAt: Date.now(),
  };
  if (editingAcctId) {
    Object.assign(accountById(editingAcctId), data);
  } else {
    state.accounts.push(Object.assign({ id: uid() }, data));
  }
  save();
  closeModal();
  render();
}

export function openAccountLedger(id) {
  const a = accountById(id);
  if (!a) return;
  rememberAccount(id);
  const bal = accountCurrent(a);
  const txs = sortTxs(state.transactions.filter((t) => t.accountId === id));
  const after = runningBalanceByTxId();
  const rows =
    txs.length === 0
      ? `<div class="empty" style="padding:22px 8px"><span class="ib lg muted">${icon('list')}</span>${tr('گردشی برای این حساب ثبت نشده.')}</div>`
      : txs
          .map((t) => {
            const transfer = isTransfer(t);
            const inv = isInvoice(t);
            const cat = t.type === 'out' && !inv ? catById(t.cat) : null;
            const title = t.note
              ? esc(t.note)
              : transfer
                ? tr('انتقال بین حساب‌ها')
                : inv
                  ? tr('فاکتور')
                  : t.type === 'in'
                    ? tr('درآمد')
                    : cat
                      ? cat.label
                      : tr('خرج');
            const sign = t.type === 'in' || t.type === 'transferIn' ? '+' : '−';
            const amtClass = transfer ? 'transfer' : t.type;
            const bal = after[t.id];
            const balTxt = bal == null ? '' : `<div class="bal">${tr('مانده')} ${fmt(bal)}</div>`;
            return `<div class="item" onclick="openTxForm(findTx('${t.id}'))">
              <div class="mid">
                <div class="t1">${title}${inv ? (' <span class="badge">' + tr('فاکتور') + '</span>') : ''}</div>
                <div class="t2">${fmtDate(t.dateISO)}${transfer ? (' · ' + tr('انتقال')) : inv ? ' · ' + (t.lines || []).length + (' ' + tr('قلم')) : cat ? ' · ' + cat.label : ''}</div>
              </div>
              <div class="amt-col">
                <div class="amt ${amtClass}">${sign}${fmt(t.amount)}</div>
                ${balTxt}
              </div>
            </div>`;
          })
          .join('');
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <h2>${esc(a.name)}</h2>
    <div class="stat" style="background:var(--bg2);margin-bottom:12px">
      <div class="lbl">${tr('موجودی')}</div>
      <div class="val ${bal >= 0 ? 'green' : 'red'}">${fmt(bal)} ${esc(curName(a.currency))}</div>
      <div class="sub">${esc(a.type)}${a.last4 ? ' · •••• ' + a.last4 : ''}</div>
    </div>
    <div class="row" style="margin-bottom:12px">
      <button class="btn sm primary" style="flex:1" onclick="closeModal();openTxForm()">+ ${tr('تراکنش')}</button>
      <button class="btn sm" style="flex:1" onclick="openAccountForm(findAccount('${a.id}'))">${icon('edit')} ${tr('ویرایش حساب')}</button>
    </div>
    <div style="max-height:48vh;overflow:auto">${rows}</div>
  `);
}

export function openPocketLedger(catId, mk) {
  const c = catById(catId);
  if (!c) return;
  mk = mk || curMonthKey();
  const spent = catSpent(mk, catId);
  const ceil = catCeiling(mk, catId);
  const carried = catCarried(mk, catId);
  const over = c.target === 0 ? spent > 0 : ceil > 0 && spent > ceil;
  const left = Math.max(0, ceil - spent);
  const items = pocketItems(mk, catId);
  const rows =
    items.length === 0
      ? `<div class="empty" style="padding:22px 8px"><span class="em">${c.emoji}</span>${tr(c.loan ? 'گردشی در این پاکت برای {m} ثبت نشده.' : 'خرجی در این پاکت برای {m} ثبت نشده.', { m: monthLabel(mk) })}</div>`
      : items
          .map((it) => {
            const a = accountById(it.accountId);
            return `<div class="item" onclick="openTxForm(findTx('${it.txId}'),{back:&quot;openPocketLedger('${catId}','${mk}')&quot;})">
              <div class="mid">
                <div class="t1">${esc(it.title)}${it.invoice ? (' <span class="badge">' + tr('فاکتور') + '</span>') : ''}</div>
                <div class="t2">${fmtDate(it.dateISO)} · ${a ? esc(a.name) : '—'}</div>
              </div>
              <div class="amt ${it.inflow ? 'in' : 'out'}">${it.inflow ? '+' : '−'}${fmt(it.amount)}${a && a.currency !== baseCur() ? ` <small class="muted">${esc(curName(a.currency))}</small><div class="small muted" style="font-weight:400">≈ ${fmtShort(it.amount * rateOf(a.currency))}</div>` : ''}</div>
            </div>`;
          })
          .join('');
  if (c.loan) {
    const f = loanFlow(mk);
    openModal(`
    <button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <h2>${c.emoji} ${c.label}</h2>
    <p class="small muted">${tr('پولی که قرض می‌دهی یا می‌گیری خرج یا درآمد واقعی نیست؛ این‌جا جدا نگه داشته می‌شود و وارد پاکت‌های دیگر و بودجهٔ ماه نمی‌شود.')}</p>
    <div class="grid2" style="margin-bottom:12px">
      <div class="stat"><div class="lbl">${tr('داده‌ام (قرض دادن / پس دادن)')}</div><div class="val red">${fmtShort(f.out)}</div></div>
      <div class="stat"><div class="lbl">${tr('گرفته‌ام (قرض گرفتن / برگشت طلب)')}</div><div class="val green">${fmtShort(f.in)}</div></div>
    </div>
    <div class="row" style="margin-bottom:12px">
      <button class="btn sm primary" style="flex:1" onclick="closeModal();switchTab('debts');openDebtForm()">+ ${tr('ثبت طلب / بدهی')}</button>
      <button class="btn sm" style="flex:1" onclick="closeModal();switchTab('debts')">${tr('فهرست طلب و بدهی')}</button>
    </div>
    <div style="max-height:44vh;overflow:auto">${rows}</div>
  `);
    return;
  }
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <h2>${c.emoji} ${c.label}</h2>
    <div class="stat" style="background:var(--bg2);margin-bottom:12px">
      <div class="lbl">${monthLabel(mk)} · ${tr('سهم')} ${toFa(c.target)}${pctSign()}</div>
      <div class="val ${over ? 'red' : 'green'}">${fmt(spent)} ${curName(baseCur())}</div>
      <div class="sub">${ceil ? (tr('سقف') + ' ') + fmt(ceil) + (over ? (' · ' + tr('از سقف رد شد')) : (' · ' + tr('مانده') + ' ') + fmt(left)) : tr('بودجه این ماه ثبت نشده')}</div>
      ${carried ? `<div class="sub">${tr('شامل {amt} ماندهٔ همین پاکت از ماه قبل', { amt: fmt(carried) })}</div>` : ''}
    </div>
    <div class="row" style="margin-bottom:12px">
      <button class="btn sm primary" style="flex:1" onclick="openTxForm(null,{cat:'${c.id}'})">+ ${tr('خرج در این پاکت')}</button>
      <button class="btn sm" style="flex:1" onclick="openCatReport('${c.id}','${mk}')">${icon('chart')} ${tr('به تفکیک زیرشاخه')}</button>
    </div>
    <div style="max-height:48vh;overflow:auto">${rows}</div>
  `);
}

export function delAccount(id) {
  const hasTx = state.transactions.some((t) => t.accountId === id);
  askConfirm(hasTx ? tr('این حساب و تراکنش‌های مربوط به آن حذف می‌شود. ادامه می‌دهی؟') : tr('این حساب حذف شود؟'), () => {
    for (const d of state.debts || []) {
      if (d.accountId === id) {
        d.accountId = '';
        d.txId = null;
        d.settleTxId = null;
        d.updatedAt = Date.now();
      }
    }
    const pairs = new Set(
      state.transactions.filter((t) => t.accountId === id && t.pair).map((t) => t.pair)
    );
    state.accounts = state.accounts.filter((a) => a.id !== id);
    state.transactions = state.transactions.filter((t) => {
      if (t.accountId === id) return false;
      if (t.pair && pairs.has(t.pair)) return false;
      return true;
    });
    save();
    render();
    toast(tr('حذف شد'));
  });
}

export function openInvestForm(inv) {
  editingInvId = inv ? inv.id : null;
  const isEdit = !!inv;
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <h2 style="display:flex;align-items:center">${isEdit ? tr('ویرایش دارایی') : tr('دارایی جدید')}${infoTip(tr('این بخش فقط برای ردیابی «ارزش دارایی» است. خرجِ خریدِ آن را جداگانه در تراکنش‌ها (پاکت آزادی مالی) ثبت کن.'), 'lg')}</h2>
    <div class="field"><label>${tr('نام دارایی')}</label>
      <input class="input" id="iName" placeholder="${tr('مثلاً طلا، زمین، ماشین')}" value="${inv ? esc(inv.name) : ''}">
    </div>
    <div class="row">
      <div class="col field"><label>${tr('مقدار')}</label>
        <input class="input" id="iQty" type="number" step="any" inputmode="decimal" min="0" placeholder="${tr('مثلاً ۵')}" value="${inv ? inv.qty : ''}">
      </div>
      <div class="col field"><label>${tr('واحد')}</label>
        <input class="input" id="iUnit" placeholder="${tr('گرم / متر / عدد')}" value="${inv ? esc(inv.unit || '') : ''}">
      </div>
    </div>
    <div class="field"><label>${tr('واحد پول')}</label>
      <select class="input" id="iCur" onchange="toggleCustomCurrency('i')">
        ${currencyOptions(inv ? inv.currency : baseCur())}
      </select>
    </div>
    <div class="field" id="iCurCustomWrap" style="display:none"><label>${tr('نام واحد پول جدید')}</label>
      <input class="input" id="iCurCustom" placeholder="${tr('مثلاً روبل، ین، بیت‌کوین')}">
      <div class="small muted" style="margin-top:6px">${tr('این واحد به لیست اضافه می‌شود و دفعه بعد در گزینه‌ها هست.')}</div>
    </div>
    <div class="row">
      <div class="col field"><label>${tr('قیمت خرید (هر واحد)')}</label>
        <input class="input" id="iBuy" type="number" step="any" inputmode="decimal" min="0" placeholder="${toFa(0)}" value="${inv ? inv.buy : ''}">
      </div>
      <div class="col field"><label>${tr('قیمت امروز (هر واحد)')}</label>
        <input class="input" id="iPriceNow" type="number" step="any" inputmode="decimal" min="0" placeholder="${toFa(0)}" value="${inv ? inv.cur : ''}">
      </div>
    </div>
    <div style="height:12px"></div>
    <button class="btn primary block" onclick="saveInvest()">${isEdit ? tr('ذخیره') : tr('افزودن دارایی')}</button>
  `);
}

export function saveInvest() {
  const name = document.getElementById('iName').value.trim();
  if (!name) {
    toast(tr('نام دارایی را بنویس'));
    return;
  }
  const qty = parseFloat(document.getElementById('iQty').value);
  if (!qty || qty <= 0) {
    toast(tr('مقدار را درست وارد کن'));
    return;
  }
  const currency = readCurrencyChoice('i');
  if (!currency) {
    toast(tr('نام واحد پول را بنویس'));
    return;
  }
  const data = {
    name,
    qty,
    unit: document.getElementById('iUnit').value.trim(),
    currency,
    buy: parseFloat(document.getElementById('iBuy').value) || 0,
    cur: parseFloat(document.getElementById('iPriceNow').value) || 0,
    updatedAt: Date.now(),
  };
  if (editingInvId) {
    Object.assign(state.investments.find((x) => x.id === editingInvId), data);
  } else {
    state.investments.push(Object.assign({ id: uid() }, data));
  }
  save();
  closeModal();
  render();
}

export function delInvest(id) {
  askConfirm(tr('این دارایی حذف شود؟'), () => {
    state.investments = state.investments.filter((i) => i.id !== id);
    save();
    render();
    toast(tr('حذف شد'));
  });
}

export function editInvestPrice(id) {
  const inv = state.investments.find((i) => i.id === id);
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <h2>${tr('به‌روزرسانی قیمت')}</h2>
    <p class="muted small" style="margin-top:-6px">${esc(inv.name)} — ${inv.qty} ${esc(inv.unit || '')}</p>
    <div class="field"><label>${tr('قیمت امروز (هر {u})', { u: esc(inv.unit || tr('واحد')) })}</label>
      <input class="input" id="pNew" type="number" step="any" inputmode="decimal" min="0" value="${inv.cur}">
    </div>
    <button class="btn primary block" onclick="savePrice('${id}')">${tr('ذخیره قیمت')}</button>
  `);
}

export function savePrice(id) {
  const inv = state.investments.find((i) => i.id === id);
  inv.cur = parseFloat(document.getElementById('pNew').value) || 0;
  inv.updatedAt = Date.now();
  save();
  closeModal();
  render();
  toast((tr('قیمت به‌روز شد') + ' ✓'));
}

export function openBudgetForm(mk) {
  mk = mk || curMonthKey();
  const b = state.budgets[mk];
  const [sy, sm] = mk.split('/').map(Number);
  const cur = bookNow();
  const years = [];
  for (let y = cur[0] - 2; y <= cur[0] + 2; y++) years.push(y);
  const greg = false;
  const names = bookCalendar() === 'gregorian' ? gregMonths() : jalaliMonths();
  const monthOpts = greg
    ? ''
    : names.map(
        (name, i) => `<option value="${i + 1}" ${i + 1 === sm ? 'selected' : ''}>${name}</option>`
      ).join('');
  const yearOpts = years
    .map((y) => `<option value="${y}" ${y === sy ? 'selected' : ''}>${y}</option>`)
    .join('');
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <h2>${b ? tr('ویرایش بودجه') : tr('ثبت بودجه')}</h2>
    <p class="muted small" style="margin-top:-6px">${tr('ماه موردنظر را انتخاب کن (مقدار پیش‌فرض، ماه فعلی است).')}</p>
    <div class="row">
      <div class="col field"><label>${tr('ماه')}</label>
        <select class="input" id="bMonth">${monthOpts}</select>
      </div>
      <div class="col field" ${greg ? 'style="display:none"' : ''}><label>${tr('سال')}</label>
        <select class="input" id="bYear">${yearOpts}</select>
      </div>
    </div>
    <div class="field"><label>${tr('مبلغ بودجه')} (${curName(baseCur())})</label>
      <input class="input" id="bAmount" type="number" step="any" inputmode="decimal" min="0" placeholder="${tr('مثلاً 15000000')}" value="${b ? b.amount : ''}">
    </div>
    <button class="btn primary block" onclick="saveBudget()">${b ? tr('ذخیره تغییرات') : tr('ذخیره بودجه')}</button>
  `);
}

export function saveBudget() {
  const amount = parseFloat(document.getElementById('bAmount').value);
  if (!amount || amount <= 0) {
    toast(tr('مبلغ بودجه را وارد کن'));
    return;
  }
  const mv = document.getElementById('bMonth').value;
  const m = mv.includes('/') ? parseInt(mv.split('/')[1], 10) : parseInt(mv, 10);
  const y = mv.includes('/') ? parseInt(mv.split('/')[0], 10) : parseInt(document.getElementById('bYear').value, 10);
  const mk = y + '/' + String(m).padStart(2, '0');
  state.budgets[mk] = { amount, updatedAt: Date.now() };
  save();
  closeModal();
  render();
  toast((tr('بودجه ذخیره شد') + ' ✓'));
}

export function openRateEdit(cur) {
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <h2>${tr('نرخ روز')} ${esc(curName(cur))}</h2>
    <p class="muted small" style="margin-top:-6px">${tr('هر ۱ واحد {a} چند {b} است؟ (فقط برای محاسبه دارایی کل؛ در انتقال‌ها استفاده نمی‌شود)', { a: esc(curName(cur)), b: curName(baseCur()) })}</p>
    <div class="field"><label>${curName(baseCur())} ${tr('به ازای هر واحد')}</label>
      <input class="input" id="rVal" type="number" step="any" inputmode="decimal" min="0" value="${state.rates[cur] || ''}">
    </div>
    <button class="btn primary block" onclick="saveRate('${cur}')">${tr('ذخیره نرخ')}</button>
  `);
}

export function saveRate(cur) {
  const v = parseFloat(document.getElementById('rVal').value);
  if (!v || v <= 0) {
    toast(tr('نرخ را وارد کن'));
    return;
  }
  state.rates[cur] = v;
  save();
  closeModal();
  render();
  toast((tr('نرخ ذخیره شد') + ' ✓'));
}

export function saveRateFrom(cur) {
  const el = document.getElementById('rate_' + cur);
  const v = parseFloat(el ? el.value : '');
  if (!v || v <= 0) {
    toast(tr('نرخ معتبر وارد کن'));
    return;
  }
  state.rates[cur] = v;
  save();
  render();
  toast((tr('نرخ ذخیره شد') + ' ✓'));
}

export function openTransferForm(tx) {
  if (state.accounts.length < 2) {
    toast(tr('برای انتقال، حداقل دو حساب بساز'));
    return;
  }
  const pair = tx && tx.pair ? tx.pair : null;
  const out = pair ? state.transactions.find((t) => t.pair === pair && t.type === 'transferOut') : null;
  const inn = pair ? state.transactions.find((t) => t.pair === pair && t.type === 'transferIn') : null;
  editingTransferPair = pair;
  const fromId = out ? out.accountId : state.accounts[0].id;
  const toId = inn
    ? inn.accountId
    : state.accounts.find((a) => a.id !== fromId)?.id || state.accounts[1].id;
  transferStoredRates = {};
  if (out) {
    const fa = accountById(out.accountId);
    const ta = inn ? accountById(inn.accountId) : null;
    if (fa && out.fromRate) transferStoredRates[fa.currency] = out.fromRate;
    if (ta && out.toRate) transferStoredRates[ta.currency] = out.toRate;
  }
  const opts = accountOptGroups('');
  openModal(`<button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <h2 style="display:flex;align-items:center">${pair ? tr('ویرایش انتقال') : tr('انتقال بین حساب‌ها')}${infoTip(tr('انتقال هزینه یا درآمد نیست و در گزارش‌ها حساب نمی‌شود.'), 'lg')}</h2>
    <div class="field"><label>${tr('از حساب')}</label><select class="input" id="trFrom" onchange="transferAccountsChanged()">${opts}</select></div>
    <div class="field"><label>${tr('به حساب')}</label><select class="input" id="trTo" onchange="transferAccountsChanged()">${opts}</select></div>
    <div class="field"><label>${tr('مبلغ از حساب مبدأ')}</label><input class="input" id="trAmount" type="number" step="any" inputmode="decimal" min="0" placeholder="${tr('مبلغ به واحد حساب مبدأ')}" value="${out ? out.amount : ''}" oninput="updateTransferPreview()"></div>
    <div id="trBalance" class="small muted" style="margin:-8px 0 12px"></div>
    <div id="trRates"></div>
    <div id="trPreview" class="hint" style="margin-bottom:12px;display:none"></div>
    <div class="field"><label>${tr('توضیح (اختیاری)')}</label><input class="input" id="trNote" placeholder="${tr('مثلاً انتقال به کارت خرید')}" value="${esc((out && out.note) || (inn && inn.note) || '')}"></div>
    <div class="field"><label>${tr('تاریخ')}</label><input class="input" id="trDate" type="date" value="${(out && out.dateISO) || (inn && inn.dateISO) || todayISO()}"></div>
    <button class="btn primary block" onclick="saveTransfer()">${pair ? tr('ذخیره انتقال') : tr('ثبت انتقال')}</button>
    ${pair ? '<button class="btn danger block" style="margin-top:8px" onclick="delTx(\'' + (out || inn).id + ('\')">' + tr('حذف این انتقال') + '</button>') : ''}
  `);
  document.getElementById('trFrom').value = fromId;
  document.getElementById('trTo').value = toId;
  renderTransferRates();
  renderTransferBalance();
  updateTransferPreview();
}

// موجودی قابل برداشت از حساب مبدأ؛ هنگام ویرایش، مبلغ قبلیِ همین انتقال به موجودی برگردانده می‌شود
function transferSourceAvailable(fromId) {
  const acct = accountById(fromId);
  if (!acct) return 0;
  let bal = accountCurrent(acct);
  if (editingTransferPair) {
    const out = state.transactions.find(
      (t) => t.pair === editingTransferPair && t.type === 'transferOut'
    );
    if (out && out.accountId === fromId) bal += out.amount || 0;
  }
  return bal;
}

function renderTransferBalance() {
  const el = document.getElementById('trBalance');
  const fromEl = document.getElementById('trFrom');
  if (!el || !fromEl) return;
  const acct = accountById(fromEl.value);
  if (!acct) {
    el.textContent = '';
    return;
  }
  const avail = Math.max(0, transferSourceAvailable(acct.id));
  el.innerHTML = `${tr('موجودی قابل برداشت از')} ${esc(acct.name)}: <b style="color:var(--text)">${fmt(avail)} ${esc(curName(acct.currency))}</b>`;
}

function renderTransferRates() {
  const wrap = document.getElementById('trRates');
  const fromEl = document.getElementById('trFrom');
  const toEl = document.getElementById('trTo');
  if (!wrap || !fromEl || !toEl) return;
  const from = accountById(fromEl.value);
  const to = accountById(toEl.value);

  // مقادیری که کاربر همین الان در فرم وارد کرده را بر اساس ارز نگه می‌داریم
  const typed = {};
  ['From', 'To'].forEach((w) => {
    const el = document.getElementById('trRate' + w);
    if (el && el.dataset.cur && el.value) typed[el.dataset.cur] = el.value;
  });

  const rateField = (which, acct) => {
    const cur = acct.currency;
    const val =
      typed[cur] !== undefined
        ? typed[cur]
        : transferStoredRates[cur] !== undefined
          ? transferStoredRates[cur]
          : state.rates[cur] || '';
    return `<div class="field"><label>${tr('نرخ {a} برای این انتقال ({b} به ازای هر واحد)', { a: esc(curName(cur)), b: curName(baseCur()) })}</label>
      <input class="input" id="trRate${which}" data-cur="${esc(cur)}" type="number" step="any" inputmode="decimal" min="0" placeholder="${tr('مثلاً 90000')}" value="${val}" oninput="updateTransferPreview()">
    </div>`;
  };

  let html = '';
  if (from && to && from.currency !== to.currency) {
    if (from.currency !== baseCur()) html += rateField('From', from);
    if (to.currency !== baseCur()) html += rateField('To', to);
  }
  if (html) {
    html =
      html;
  }
  wrap.innerHTML = html;
}

export function transferAccountsChanged() {
  renderTransferRates();
  renderTransferBalance();
  updateTransferPreview();
}

function readTransferRates(from, to) {
  const read = (which) => {
    const el = document.getElementById('trRate' + which);
    return parseFloat(el ? el.value : '') || 0;
  };
  const fromRate = from.currency === baseCur() ? 1 : read('From');
  const toRate = to.currency === baseCur() ? 1 : read('To');
  return { fromRate, toRate };
}

export function updateTransferPreview() {
  const fromEl = document.getElementById('trFrom');
  const toEl = document.getElementById('trTo');
  const amtEl = document.getElementById('trAmount');
  const box = document.getElementById('trPreview');
  if (!fromEl || !toEl || !amtEl || !box) return;
  const from = accountById(fromEl.value);
  const to = accountById(toEl.value);
  const amount = parseFloat(amtEl.value) || 0;
  if (!from || !to || !amount) {
    box.style.display = 'none';
    return;
  }
  box.style.display = '';
  const avail = transferSourceAvailable(from.id);
  if (amount > avail + 1e-9) {
    box.innerHTML = `<span style="color:var(--red)">${tr('مبلغ از موجودی حساب مبدأ بیشتر است. حداکثر برداشت:')} <b>${fmt(Math.max(0, avail))} ${esc(from.currency)}</b></span>`;
    return;
  }
  if (from.currency === to.currency) {
    box.innerHTML = `${tr('واریز به مقصد:')} <b>${fmt(amount)} ${esc(curName(to.currency))}</b> ${tr('(بدون تبدیل)')}`;
    return;
  }
  const { fromRate, toRate } = readTransferRates(from, to);
  if (!fromRate || !toRate) {
    box.textContent = tr('نرخ تبدیل این انتقال را در فیلد بالا وارد کن.');
    return;
  }
  const toman = amount * fromRate;
  const dest = toman / toRate;
  box.innerHTML = `${tr('ارزش انتقال:')} <b>${fmt(toman)} ${curName(baseCur())}</b><br>${tr('واریز به مقصد:')} <b>${fmt(dest)} ${esc(curName(to.currency))}</b><br><span class="small muted">${tr('نرخ این انتقال —')} ${esc(from.currency)}: ${fmt(fromRate)} ${baseCur()} · ${esc(curName(to.currency))}: ${fmt(toRate)} ${baseCur()}</span>`;
}

export function saveTransfer() {
  const from = document.getElementById('trFrom').value;
  const to = document.getElementById('trTo').value;
  const amount = parseFloat(document.getElementById('trAmount').value);
  if (from === to) {
    toast(tr('حساب مبدأ و مقصد باید متفاوت باشند'));
    return;
  }
  if (!amount || amount <= 0) {
    toast(tr('مبلغ معتبر وارد کن'));
    return;
  }
  const available = transferSourceAvailable(from);
  if (amount > available + 1e-9) {
    toast((tr('مبلغ از موجودی حساب مبدأ بیشتر است؛ حداکثر') + ' ') + fmt(Math.max(0, available)));
    return;
  }
  const fromAcct = accountById(from);
  const toAcct = accountById(to);
  const sameCurrency = fromAcct.currency === toAcct.currency;
  let fromRate = 1;
  let toRate = 1;
  if (!sameCurrency) {
    const rates = readTransferRates(fromAcct, toAcct);
    fromRate = rates.fromRate;
    toRate = rates.toRate;
    if (!fromRate || fromRate <= 0 || !toRate || toRate <= 0) {
      toast(tr('نرخ تبدیل این انتقال را وارد کن'));
      return;
    }
  }
  const destinationAmount = sameCurrency ? amount : (amount * fromRate) / toRate;
  const dateISO = document.getElementById('trDate').value || todayISO();
  const month = monthOfISO(dateISO);
  const note = document.getElementById('trNote').value.trim();
  const stamp = Date.now();

  if (editingTransferPair) {
    let out = state.transactions.find((t) => t.pair === editingTransferPair && t.type === 'transferOut');
    let inn = state.transactions.find((t) => t.pair === editingTransferPair && t.type === 'transferIn');
    if (!out) {
      out = { id: uid(), pair: editingTransferPair, type: 'transferOut', cat: null };
      state.transactions.push(out);
    }
    if (!inn) {
      inn = { id: uid(), pair: editingTransferPair, type: 'transferIn', cat: null };
      state.transactions.push(inn);
    }
    Object.assign(out, { amount, accountId: from, note, dateISO, month, updatedAt: stamp, type: 'transferOut', cat: null, fromRate, toRate });
    Object.assign(inn, {
      amount: destinationAmount,
      accountId: to,
      note: note || tr('انتقال بین حساب‌ها'),
      dateISO,
      month,
      updatedAt: stamp,
      type: 'transferIn',
      cat: null,
      fromRate,
      toRate,
    });
    toast((tr('انتقال ویرایش شد') + ' ✓'));
  } else {
    const pair = uid();
    state.transactions.push({
      id: uid(),
      pair,
      amount,
      accountId: from,
      note,
      dateISO,
      month,
      type: 'transferOut',
      cat: null,
      updatedAt: stamp,
      fromRate,
      toRate,
    });
    state.transactions.push({
      id: uid(),
      pair,
      amount: destinationAmount,
      accountId: to,
      note: note || tr('انتقال بین حساب‌ها'),
      dateISO,
      month,
      type: 'transferIn',
      cat: null,
      updatedAt: stamp,
      fromRate,
      toRate,
    });
    toast((tr('انتقال با موفقیت ثبت شد') + ' ✓'));
  }
  editingTransferPair = null;
  save();
  closeModal();
  render();
}

export function pieSVG(slices, size) {
  size = size || 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  const total = slices.reduce((s, x) => s + x.v, 0);
  if (total <= 0) {
    return `<svg width="${size}" height="${size}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#1b2435"/><text x="${cx}" y="${cy}" fill="#8b98ab" font-size="13" text-anchor="middle" dominant-baseline="middle">${tr('بدون داده')}</text></svg>`;
  }
  const positive = slices.filter((s) => s.v > 0);
  if (positive.length === 1) {
    const s = positive[0];
    return `<svg width="${size}" height="${size}" style="display:block;margin:0 auto"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${s.color}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="#141b29"/></svg>`;
  }
  let a = -Math.PI / 2;
  let paths = '';
  for (const s of slices) {
    if (s.v <= 0) continue;
    const sweep = (s.v / total) * Math.PI * 2;
    const x0 = cx + r * Math.cos(a);
    const y0 = cy + r * Math.sin(a);
    const a1 = a + sweep;
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = sweep > Math.PI ? 1 : 0;
    paths += `<path d="M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z" fill="${s.color}"/>`;
    a = a1;
  }
  return `<svg width="${size}" height="${size}" style="display:block;margin:0 auto">${paths}<circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="#141b29"/></svg>`;
}
