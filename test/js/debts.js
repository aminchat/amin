import { icon } from './icons.js';
import { esc, fmt, fmtShort, store, toast, uid, todayISO, infoTip } from './utils.js';
import { fmtDate, monthOfISO } from './jalali.js';
import { closeModal, openModal, askConfirm } from './modal.js';
import { render } from './view.js';
import { save, state, accountById, rateOf, accountOptGroups, LOAN_CAT, baseCur, curName } from './state.js';
import { overdueInstallments } from './installments.js';
import { t as tr } from './i18n.js';

const NOTIFY_DAY_KEY = 'capital_debt_notify_day';
let editingDebtId = null;

export function allDebts() {
  return (state.debts || []).map(migrateDebt);
}

// پرداخت‌های تسویه (جزئی یا کامل)
export function debtPaid(d) {
  return (d.payments || []).reduce((s, x) => s + (Number(x.amount) || 0), 0);
}
export function debtRemaining(d) {
  return Math.max(0, (d.amount || 0) - debtPaid(d));
}
// مهاجرت رکورد قدیمی: settled + settleTxId → یک پرداخت کامل
function migrateDebt(d) {
  if (d.payments) return d;
  d.payments = [];
  if (d.settled) {
    d.payments.push({ id: uid(), amount: d.amount, dateISO: d.settledAt || todayISO(), accountId: d.accountId || '', txId: d.settleTxId || null });
  }
  d.settleTxId = null;
  return d;
}

export function openDebts() {
  return allDebts().filter((d) => !d.settled);
}

export function daysUntilDue(dueISO) {
  if (!dueISO) return null;
  const a = new Date(todayISO() + 'T12:00:00');
  const b = new Date(dueISO + 'T12:00:00');
  return Math.round((b - a) / 86400000);
}

export function dueSoonDebts(within = 3) {
  return openDebts().filter((d) => {
    if (!d.dueISO) return false;
    const n = daysUntilDue(d.dueISO);
    return n !== null && n <= within;
  });
}

export function overdueCount() {
  return dueSoonDebts(0).length + overdueInstallments();
}

function dueLabel(dueISO) {
  if (!dueISO) return tr('بدون سررسید');
  const n = daysUntilDue(dueISO);
  if (n === null) return fmtDate(dueISO);
  if (n < 0) return (tr('عقب‌افتاده') + ' · ') + fmtDate(dueISO);
  if (n === 0) return tr('امروز سررسید است');
  if (n === 1) return tr('فردا سررسید است');
  return fmtDate(dueISO);
}

function lastDebtAccountId() {
  const withAcc = allDebts().filter((x) => x.accountId).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  if (withAcc.length && accountById(withAcc[0].accountId)) return withAcc[0].accountId;
  return state.accounts.length ? state.accounts[0].id : '';
}

function accountOptionsHtml(selectedId) {
  const opts = accountOptGroups(selectedId);
  return `<option value="" ${!selectedId ? 'selected' : ''}>— ${tr('بدون اتصال به حساب (فقط یادداشت) —')}</option>${opts}`;
}

export function openDebtForm(d) {
  editingDebtId = d ? d.id : null;
  const kind = d ? d.kind : 'in';
  const accId = d ? d.accountId || '' : lastDebtAccountId();
  const acc = accountById(accId);
  const linked = !!(d && d.txId);
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <h2>${d ? tr('ویرایش مورد') : tr('طلب یا بدهی جدید')}</h2>
    <div class="seg" id="debtKindSeg" style="margin-bottom:14px">
      <button class="${kind === 'in' ? 'on' : ''}" data-k="in" onclick="setDebtKind(this)">${tr('طلب من از دیگران')}</button>
      <button class="${kind === 'out' ? 'on out' : ''}" data-k="out" onclick="setDebtKind(this)">${tr('بدهی من به دیگران')}</button>
    </div>
    <div class="field"><label>${tr('اسم طرف')}</label>
      <input class="input" id="dPerson" placeholder="${tr('مثلاً علی')}" value="${d ? esc(d.person || '') : ''}">
    </div>
    <div class="field"><label>${tr('از/به کدام حساب؟')}</label>
      <select class="input" id="dAccount" onchange="syncDebtAmountLabel()">${accountOptionsHtml(accId)}</select>
      <div class="hint" style="margin-top:6px">${tr('با انتخاب حساب، مبلغ خودکار از حساب کم/به آن اضافه می‌شود و در پاکت «قرض / امانت» می‌نشیند — نه در خرج یا درآمد ماه. حساب تسویه را موقع تسویه جدا انتخاب می‌کنی (می‌تواند فرق کند).')}</div>
    </div>
    <div class="field"><label id="dAmountLbl">${tr('مبلغ')} (${curName(acc ? acc.currency : baseCur())})</label>
      <input class="input" id="dAmount" type="number" step="any" inputmode="decimal" min="0" placeholder="${tr('مثلاً 500000')}" value="${d ? d.amount : ''}">
    </div>
    <div class="field"><label>${tr('تاریخ سررسید')}</label>
      <input class="input" id="dDue" type="date" value="${d && d.dueISO ? d.dueISO : ''}">
    </div>
    <div class="field"><label>${tr('توضیح (اختیاری)')}</label>
      <input class="input" id="dNote" placeholder="${tr('مثلاً قرض برای اجاره')}" value="${d ? esc(d.note || '') : ''}">
    </div>
    <button class="btn primary block" onclick="saveDebt()">${d ? tr('ذخیره') : tr('ثبت')}</button>
    ${d ? `<button class="btn danger block" style="margin-top:8px" onclick="delDebt('${d.id}')">${tr('حذف')}</button>` : ''}
  `);
}

export function setDebtKind(btn) {
  document.querySelectorAll('#debtKindSeg button').forEach((b) => b.classList.remove('on', 'out'));
  btn.classList.add('on');
  if (btn.dataset.k === 'out') btn.classList.add('out');
}

export function saveDebt() {
  const person = (document.getElementById('dPerson').value || '').trim();
  if (!person) {
    toast(tr('اسم طرف را بنویس'));
    return;
  }
  const amount = parseFloat(document.getElementById('dAmount').value);
  if (!amount || amount <= 0) {
    toast(tr('مبلغ را درست وارد کن'));
    return;
  }
  const onBtn = document.querySelector('#debtKindSeg button.on');
  const kind = onBtn ? onBtn.dataset.k : 'in';
  const dueISO = document.getElementById('dDue').value || '';
  const note = (document.getElementById('dNote').value || '').trim();
  const accSel = document.getElementById('dAccount');
  const accountId = accSel && accSel.value && accountById(accSel.value) ? accSel.value : '';
  const stamp = Date.now();
  if (editingDebtId) {
    const d = allDebts().find((x) => x.id === editingDebtId);
    if (!d) return;
    Object.assign(d, { person, amount, kind, dueISO, note, accountId, updatedAt: stamp });
    syncDebtTxs(d);
    toast(tr('ویرایش شد'));
  } else {
    if (!state.debts) state.debts = [];
    const d = {
      id: uid(),
      person,
      amount,
      kind,
      dueISO,
      note,
      accountId,
      createdISO: todayISO(),
      settled: false,
      settledAt: null,
      updatedAt: stamp,
    };
    state.debts.push(d);
    syncDebtTxs(d);
    toast(accountId ? (tr('ثبت شد') + ' ✓ ' + tr('و از حساب اعمال شد')) : (tr('ثبت شد') + ' ✓'));
  }
  save();
  closeModal();
  render();
}

export function syncDebtAmountLabel() {
  const sel = document.getElementById('dAccount');
  const lbl = document.getElementById('dAmountLbl');
  if (!sel || !lbl) return;
  const a = accountById(sel.value);
  lbl.textContent = tr('مبلغ') + ' (' + curName(a ? a.currency : baseCur()) + ')';
  const inp = document.getElementById('dAmount');
  if (inp) {
    inp.dataset.cur = a ? a.currency : baseCur();
    inp.dispatchEvent(new Event('input'));
  }
}

// ─── اتصال طلب/بدهی به تراکنش‌های پاکت قرض ────────────────────────────────
// طلب من (kind=in): پول از حساب خارج شده → تراکنش out ؛ تسویه → in
// بدهی من (kind=out): پول وارد حساب شده → تراکنش in ؛ تسویه → out
function upsertLinkedTx(existingId, d, phase) {
  const isOpen = phase === 'open';
  const lent = d.kind === 'in';
  const type = (isOpen ? lent : !lent) ? 'out' : 'in';
  const dateISO = isOpen ? d.createdISO || todayISO() : d.settledAt || todayISO();
  const who = d.person || '';
  const note = isOpen
    ? lent
      ? (tr('قرض دادم به') + ' ') + who
      : (tr('قرض گرفتم از') + ' ') + who
    : lent
      ? (tr('برگشت طلب از') + ' ') + who
      : (tr('پس دادم به') + ' ') + who;
  const stamp = Date.now();
  let t = existingId ? state.transactions.find((x) => x.id === existingId) : null;
  const payload = {
    amount: d.amount,
    accountId: d.accountId,
    note: note + (d.note ? ' — ' + d.note : ''),
    dateISO,
    month: monthOfISO(dateISO),
    type,
    cat: LOAN_CAT,
    reflect: '',
    kind: 'simple',
    lines: null,
    updatedAt: stamp,
    debtId: d.id,
  };
  if (t) Object.assign(t, payload);
  else {
    t = Object.assign({ id: uid() }, payload);
    state.transactions.push(t);
  }
  return t.id;
}

function removeTx(id) {
  if (!id) return;
  state.transactions = state.transactions.filter((t) => t.id !== id);
}

function paymentTx(d, pay) {
  const acc = accountById(pay.accountId);
  if (!acc || !(pay.amount > 0)) {
    removeTx(pay.txId);
    pay.txId = null;
    return;
  }
  const lent = d.kind === 'in';
  const who = d.person || '';
  const note = (lent ? (tr('برگشت طلب از') + ' ') : (tr('پس دادم به') + ' ')) + who + (pay.note ? ' — ' + pay.note : '');
  let t = pay.txId ? state.transactions.find((x) => x.id === pay.txId) : null;
  const payload = {
    amount: pay.amount,
    accountId: acc.id,
    note,
    dateISO: pay.dateISO,
    month: monthOfISO(pay.dateISO),
    type: lent ? 'in' : 'out',
    cat: LOAN_CAT,
    reflect: '',
    kind: 'simple',
    lines: null,
    updatedAt: Date.now(),
    debtId: d.id,
  };
  if (t) Object.assign(t, payload);
  else {
    t = Object.assign({ id: uid() }, payload);
    state.transactions.push(t);
  }
  pay.txId = t.id;
}

function syncDebtTxs(d) {
  migrateDebt(d);
  // تراکنش ایجاد (قرض دادن/گرفتن) فقط اگر حساب انتخاب شده
  if (!d.accountId || !accountById(d.accountId)) {
    removeTx(d.txId);
    d.txId = null;
  } else d.txId = upsertLinkedTx(d.txId, d, 'open');
  // هر پرداخت تسویه، حساب خودش را دارد
  for (const pay of d.payments) paymentTx(d, pay);
  d.settled = d.amount > 0 && debtPaid(d) >= d.amount - 0.000001;
  d.settledAt = d.settled ? (d.payments[d.payments.length - 1] || {}).dateISO || todayISO() : null;
}

export function delDebt(id) {
  const d = allDebts().find((x) => x.id === id);
  const linked = !!(d && (d.txId || (d.payments || []).some((x) => x.txId)));
  askConfirm(linked ? tr('این مورد و تراکنش‌های وصل‌شده به آن حذف شود؟') : tr('این مورد حذف شود؟'), () => {
    if (d) {
      removeTx(d.txId);
      for (const pay of d.payments || []) removeTx(pay.txId);
    }
    state.debts = allDebts().filter((d) => d.id !== id);
    save();
    render();
    toast(tr('حذف شد'));
  });
}

// شیت تسویه: مبلغ (پیش‌فرض مانده)، حساب دریافت/پرداخت، تاریخ
export function settleDebt(id) {
  const d = allDebts().find((x) => x.id === id);
  if (!d) return;
  const lent = d.kind === 'in';
  const remain = debtRemaining(d);
  const cur = debtCurrency(d);
  const hist = (d.payments || [])
    .slice()
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO))
    .map((pay) => {
      const a = accountById(pay.accountId);
      return `<div class="item" style="min-height:48px">
        <div class="ic" style="background:var(--green-soft);color:var(--green)">${icon('check')}</div>
        <div class="mid"><div class="t1">${fmt(pay.amount)} ${esc(curName(cur))}</div><div class="t2">${fmtDate(pay.dateISO)}${a ? ' · ' + esc(a.name) : (' · ' + tr('بدون حساب'))}</div></div>
        <button class="btn sm icon danger" onclick="delDebtPayment('${d.id}','${pay.id}')" aria-label="${tr('حذف')}">${icon('trash')}</button>
      </div>`;
    })
    .join('');
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <h2>${lent ? (tr('دریافت از') + ' ') : (tr('پرداخت به') + ' ')}${esc(d.person)}</h2>
    <div class="grid2" style="margin-bottom:12px">
      <div class="stat"><div class="lbl">${tr('کل')}</div><div class="val">${fmt(d.amount)}</div></div>
      <div class="stat"><div class="lbl">${tr('مانده')}</div><div class="val ${remain > 0 ? 'red' : 'green'}">${fmt(remain)}</div></div>
    </div>
    ${remain > 0 ? `
    <div class="field"><label>${tr('مبلغ')} (${esc(curName(cur))})</label>
      <input class="input" id="spAmount" type="number" step="any" inputmode="decimal" value="${remain}"></div>
    <div class="field"><label>${lent ? tr('به کدام حساب برگشت؟') : tr('از کدام حساب پرداخت شد؟')} ${infoTip(tr('می‌تواند با حساب اولیه فرق کند؛ مثلاً از ملت قرض داده‌ای و به ملی برگشته.'))}</label>
      <select class="input" id="spAcc"><option value="">— ${tr('بدون اتصال به حساب —')}</option>${accountOptGroups(d.accountId || '')}</select></div>
    <div class="field"><label>${tr('تاریخ')}</label><input class="input" id="spDate" type="date" value="${todayISO()}"></div>
    <button class="btn primary block" onclick="addDebtPayment('${d.id}')">${icon('check')} ${tr('ثبت')} ${lent ? tr('دریافت') : tr('پرداخت')}</button>` : ('<div class="hint" style="margin-bottom:12px;color:var(--green)">' + tr('کامل تسویه شده.') + '</div>')}
    ${hist ? `<div class="divider"></div><h3 class="muted" style="margin-bottom:8px">${tr('پرداخت‌ها')}</h3>${hist}` : ''}
  `);
}

export function addDebtPayment(id) {
  const d = allDebts().find((x) => x.id === id);
  if (!d) return;
  const amount = parseFloat(document.getElementById('spAmount').value);
  if (!amount || amount <= 0) return toast(tr('مبلغ را درست وارد کن'));
  if (amount > debtRemaining(d) + 0.000001) return toast(tr('بیشتر از مانده است'));
  d.payments.push({
    id: uid(),
    amount,
    dateISO: document.getElementById('spDate').value || todayISO(),
    accountId: document.getElementById('spAcc').value || '',
    txId: null,
  });
  d.updatedAt = Date.now();
  syncDebtTxs(d);
  save();
  closeModal();
  render();
  toast(d.settled ? (tr('تسویه کامل شد') + ' ✓') : (tr('ثبت شد') + ' · ' + tr('مانده') + ' ') + fmt(debtRemaining(d)));
}

export function delDebtPayment(id, payId) {
  const d = allDebts().find((x) => x.id === id);
  if (!d) return;
  const pay = d.payments.find((x) => x.id === payId);
  if (pay) removeTx(pay.txId);
  d.payments = d.payments.filter((x) => x.id !== payId);
  d.updatedAt = Date.now();
  syncDebtTxs(d);
  save();
  render();
  settleDebt(id);
}

export function findDebt(id) {
  return allDebts().find((d) => d.id === id);
}

function sortDebts(list) {
  return list.slice().sort((a, b) => {
    if (!!a.settled !== !!b.settled) return a.settled ? 1 : -1;
    const ad = a.dueISO || '9999';
    const bd = b.dueISO || '9999';
    if (ad !== bd) return ad.localeCompare(bd);
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

// واحد پول یک مورد = واحد حسابش (بدون حساب → تومان)
function debtCurrency(d) {
  const a = d.accountId && accountById(d.accountId);
  return (a && a.currency) || baseCur();
}
// معادل تومانی؛ اگر نرخ ثبت نشده باشد null
function debtToman(d) {
  const cur = debtCurrency(d);
  if (cur === baseCur()) return d.amount || 0;
  const r = rateOf(cur);
  return r ? (d.amount || 0) * r : null;
}
function sumToman(list) {
  let sum = 0;
  const missing = new Set();
  for (const d of list) {
    const v = debtToman(d);
    if (v == null) missing.add(debtCurrency(d));
    else sum += v;
  }
  return { sum, missing: [...missing] };
}

function debtRow(d) {
  const mine = d.kind === 'in';
  const cur = debtCurrency(d);
  const foreign = cur !== baseCur();
  const tm = foreign ? debtToman(d) : null;
  const n = daysUntilDue(d.dueISO);
  const hot = !d.settled && n !== null && n <= 0;
  const soon = !d.settled && n !== null && n > 0 && n <= 3;
  return `
    <div class="item" style="${d.settled ? 'opacity:.62' : ''}">
      <div class="ic" style="background:${mine ? 'var(--green-soft)' : 'var(--red-soft)'};color:${mine ? 'var(--green)' : 'var(--red)'}">${icon(mine ? 'arrowIn' : 'arrowOut')}</div>
      <div class="mid" onclick="openDebtForm(findDebt('${d.id}'))">
        <div class="t1">${esc(d.person)}</div>
        <div class="t2">${mine ? tr('طلب من') : tr('بدهی من')} · ${dueLabel(d.dueISO)}${d.note ? ' · ' + esc(d.note) : ''}${
          d.accountId && accountById(d.accountId) ? ' · <span class="badge" style="color:#14b8a6">' + esc(accountById(d.accountId).name) + '</span>' : ''
        }</div>
      </div>
      <div style="text-align:left">
        <div class="amt ${mine ? 'in' : 'out'}">${mine ? '+' : '−'}${foreign ? fmt(debtRemaining(d)) : fmtShort(debtRemaining(d))}${foreign ? ' <span class="badge">' + esc(cur) + '</span>' : ''}</div>
        ${foreign ? `<div class="small muted">${tm == null ? (tr('نرخ') + ' ') + esc(curName(cur)) + (' ' + tr('ثبت نشده')) : '≈ ' + fmtShort(tm) + ' ' + baseCur()}</div>` : ''}
        ${!d.settled && debtPaid(d) > 0 ? `<div class="small muted">${tr('{a} از {b} تسویه شده', { a: fmtShort(debtPaid(d)), b: fmtShort(d.amount) })}</div>` : ''}
        <button class="btn sm" style="margin-top:6px" onclick="settleDebt('${d.id}')">${d.settled ? tr('جزئیات') : tr('تسویه')}</button>
      </div>
    </div>
    ${hot ? ('<div class="small" style="color:var(--red);margin:-4px 0 10px 52px">' + tr('سررسید گذشته') + '</div>') : ''}
    ${soon ? ('<div class="small" style="color:var(--orange);margin:-4px 0 10px 52px">' + tr('نزدیک سررسید') + '</div>') : ''}`;
}

export function renderDebts() {
  const box = document.getElementById('debtsContent');
  if (!box) return;
  const list = sortDebts(allDebts());
  const open = list.filter((d) => !d.settled);
  const done = list.filter((d) => d.settled);
  const openRem = open.map((d) => Object.assign({}, d, { amount: debtRemaining(d) }));
  const recT = sumToman(openRem.filter((d) => d.kind === 'in'));
  const payT = sumToman(openRem.filter((d) => d.kind === 'out'));
  const rec = recT.sum;
  const pay = payT.sum;
  const missing = [...new Set([...recT.missing, ...payT.missing])];
  // ریز جمع به تفکیک واحد پول (فقط وقتی ارز خارجی هست)
  const byCur = {};
  for (const d of openRem) {
    const c = debtCurrency(d);
    byCur[c] = byCur[c] || { in: 0, out: 0 };
    byCur[c][d.kind === 'in' ? 'in' : 'out'] += d.amount || 0;
  }
  const curs = Object.keys(byCur);
  const breakdown =
    curs.length > 1 || (curs.length === 1 && curs[0] !== baseCur())
      ? `<div class="hint" style="margin:0 0 12px">${tr('به تفکیک واحد:')} ${curs
          .map((c) => `<b>${esc(curName(c))}</b> ${tr('طلب')} ${c === baseCur() ? fmtShort(byCur[c].in) : fmt(byCur[c].in)} / ${tr('بدهی')} ${c === baseCur() ? fmtShort(byCur[c].out) : fmt(byCur[c].out)}`)
          .join(' · ')}</div>`
      : '';
  const missingHint = missing.length
    ? `<div class="hint" style="color:var(--orange);margin:0 0 12px">${tr('نرخ')} ${missing.map(esc).join('، ')} ${tr('ثبت نشده؛ این موارد در جمع کل حساب نشده‌اند. نرخ را از تنظیمات')} ← ${tr('نرخ ارز وارد کن.')}</div>`
    : '';
  const notifyOn = typeof Notification !== 'undefined' && Notification.permission === 'granted';

  const net = rec - pay;
  let html = `
    <div class="hero">
      <div style="min-width:0"><div class="lbl">${icon('handshake')} ${tr('خالص طلب و بدهی')}</div>
      <div class="hero-num ${net < 0 ? 'val red' : ''}">${fmtShort(net)}</div>
      <div class="sub"><span style="color:var(--green)">${tr('طلب')} ${fmtShort(rec)}</span> · <span style="color:var(--red)">${tr('بدهی')} ${fmtShort(pay)}</span>${
        breakdown ? ` · <button type="button" class="link" style="padding:0 4px" onclick="document.getElementById('debtBreak').style.display=''">${tr('جزئیات')}</button>` : ''
      }</div></div>
      <span class="ib lg ${net < 0 ? 'red' : 'green'}">${icon(net < 0 ? 'arrowOut' : 'arrowIn')}</span>
    </div>
    <div id="debtBreak" style="display:none">${breakdown}</div>
    ${missingHint}`;

  if (!list.length) {
    html += `<div class="empty"><span class="ib lg muted">${icon('handshake')}</span>${tr('هنوز طلب یا بدهی ثبت نکرده‌ای.')}<br>${tr('مثلاً پولی که به دوستت دادی یا از کسی قرض گرفتی.')}</div>`;
  } else {
    if (open.length) html += open.map(debtRow).join('');
    if (done.length) {
      html += `<div class="divider"></div><h3 class="muted" style="margin-bottom:10px">${tr('تسویه‌شده')}</h3>`;
      html += done.map(debtRow).join('');
    }
  }
  box.innerHTML = html;
}

export function debtHomeBanner() {
  const due = dueSoonDebts(3);
  if (!due.length) return '';
  const late = due.filter((d) => daysUntilDue(d.dueISO) <= 0).length;
  const text = late
    ? toFaSafe(late) + (' ' + tr('مورد سررسید شده یا امروز است'))
    : toFaSafe(due.length) + (' ' + tr('مورد تا سه روز دیگر سررسید دارد'));
  return `<div class="banner warn">${icon('bell')}<span>${text}.</span>
    <button class="btn sm primary" style="margin-right:auto" onclick="switchTab('debts')">${tr('ببین')}</button></div>`;
}

function toFaSafe(n) {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

export async function enableDebtReminders() {
  if (typeof Notification === 'undefined') {
    toast(tr('این مرورگر یادآوری ندارد'));
    return;
  }
  const p = await Notification.requestPermission();
  if (p !== 'granted') {
    toast(tr('اجازه یادآوری داده نشد'));
    return;
  }
  toast(tr('یادآوری روشن شد'));
  notifyDueDebts(true);
  render();
}

export function notifyDueDebts(force) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const due = dueSoonDebts(0);
  if (!due.length) return;
  const day = todayISO();
  if (!force && store.get(NOTIFY_DAY_KEY) === day) return;
  store.set(NOTIFY_DAY_KEY, day);
  try {
    new Notification(tr('طلب و بدهی'), {
      body: due.length === 1
        ? due[0].person + ' — ' + dueLabel(due[0].dueISO)
        : due.length + (' ' + tr('مورد امروز یا عقب‌افتاده است')),
      tag: 'capital-debts',
    });
  } catch (e) {}
}
