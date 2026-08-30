import { esc, fmt, store, toast, uid, todayISO } from './utils.js';
import { fmtDate } from './jalali.js';
import { closeModal, openModal, askConfirm } from './modal.js';
import { render } from './view.js';
import { save, state } from './state.js';

const NOTIFY_DAY_KEY = 'capital_debt_notify_day';
let editingDebtId = null;

export function allDebts() {
  return state.debts || [];
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
  return dueSoonDebts(0).length;
}

function dueLabel(dueISO) {
  if (!dueISO) return 'بدون سررسید';
  const n = daysUntilDue(dueISO);
  if (n === null) return fmtDate(dueISO);
  if (n < 0) return 'عقب‌افتاده · ' + fmtDate(dueISO);
  if (n === 0) return 'امروز سررسید است';
  if (n === 1) return 'فردا سررسید است';
  return fmtDate(dueISO);
}

export function openDebtForm(d) {
  editingDebtId = d ? d.id : null;
  const kind = d ? d.kind : 'in';
  openModal(`
    <button class="x" onclick="closeModal()">✕</button>
    <h2>${d ? 'ویرایش مورد' : 'طلب یا بدهی جدید'}</h2>
    <div class="seg" id="debtKindSeg" style="margin-bottom:14px">
      <button class="${kind === 'in' ? 'on' : ''}" data-k="in" onclick="setDebtKind(this)">طلب من از دیگران</button>
      <button class="${kind === 'out' ? 'on out' : ''}" data-k="out" onclick="setDebtKind(this)">بدهی من به دیگران</button>
    </div>
    <div class="field"><label>اسم طرف</label>
      <input class="input" id="dPerson" placeholder="مثلاً علی" value="${d ? esc(d.person || '') : ''}">
    </div>
    <div class="field"><label>مبلغ (تومان)</label>
      <input class="input" id="dAmount" type="number" step="any" inputmode="decimal" min="0" placeholder="مثلاً 500000" value="${d ? d.amount : ''}">
    </div>
    <div class="field"><label>تاریخ سررسید</label>
      <input class="input" id="dDue" type="date" value="${d && d.dueISO ? d.dueISO : ''}">
    </div>
    <div class="field"><label>توضیح (اختیاری)</label>
      <input class="input" id="dNote" placeholder="مثلاً قرض برای اجاره" value="${d ? esc(d.note || '') : ''}">
    </div>
    <button class="btn primary block" onclick="saveDebt()">${d ? 'ذخیره' : 'ثبت'}</button>
    ${d ? `<button class="btn danger block" style="margin-top:8px" onclick="delDebt('${d.id}')">حذف</button>` : ''}
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
    toast('اسم طرف را بنویس');
    return;
  }
  const amount = parseFloat(document.getElementById('dAmount').value);
  if (!amount || amount <= 0) {
    toast('مبلغ را درست وارد کن');
    return;
  }
  const onBtn = document.querySelector('#debtKindSeg button.on');
  const kind = onBtn ? onBtn.dataset.k : 'in';
  const dueISO = document.getElementById('dDue').value || '';
  const note = (document.getElementById('dNote').value || '').trim();
  const stamp = Date.now();
  if (editingDebtId) {
    const d = allDebts().find((x) => x.id === editingDebtId);
    if (!d) return;
    Object.assign(d, { person, amount, kind, dueISO, note, updatedAt: stamp });
    toast('ویرایش شد');
  } else {
    if (!state.debts) state.debts = [];
    state.debts.push({
      id: uid(),
      person,
      amount,
      kind,
      dueISO,
      note,
      settled: false,
      settledAt: null,
      updatedAt: stamp,
    });
    toast('ثبت شد ✓');
  }
  save();
  closeModal();
  render();
}

export function delDebt(id) {
  askConfirm('این مورد حذف شود؟', () => {
    state.debts = allDebts().filter((d) => d.id !== id);
    save();
    render();
    toast('حذف شد');
  });
}

export function settleDebt(id) {
  const d = allDebts().find((x) => x.id === id);
  if (!d) return;
  d.settled = !d.settled;
  d.settledAt = d.settled ? todayISO() : null;
  d.updatedAt = Date.now();
  save();
  render();
  toast(d.settled ? 'تسویه شد ✓' : 'دوباره باز شد');
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

function debtRow(d) {
  const mine = d.kind === 'in';
  const n = daysUntilDue(d.dueISO);
  const hot = !d.settled && n !== null && n <= 0;
  const soon = !d.settled && n !== null && n > 0 && n <= 3;
  return `
    <div class="item" style="${d.settled ? 'opacity:.62' : ''}">
      <div class="ic" style="background:${mine ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)'}">${mine ? '📥' : '📤'}</div>
      <div class="mid" onclick="openDebtForm(findDebt('${d.id}'))">
        <div class="t1">${esc(d.person)}</div>
        <div class="t2">${mine ? 'طلب من' : 'بدهی من'} · ${dueLabel(d.dueISO)}${d.note ? ' · ' + esc(d.note) : ''}</div>
      </div>
      <div style="text-align:left">
        <div class="amt ${mine ? 'in' : 'out'}">${mine ? '+' : '−'}${fmt(d.amount)}</div>
        <button class="btn sm" style="margin-top:6px" onclick="settleDebt('${d.id}')">${d.settled ? 'برگردان' : 'تسویه'}</button>
      </div>
    </div>
    ${hot ? '<div class="small" style="color:var(--red);margin:-4px 0 10px 52px">سررسید گذشته</div>' : ''}
    ${soon ? '<div class="small" style="color:var(--orange);margin:-4px 0 10px 52px">نزدیک سررسید</div>' : ''}`;
}

export function renderDebts() {
  const box = document.getElementById('debtsContent');
  if (!box) return;
  const list = sortDebts(allDebts());
  const open = list.filter((d) => !d.settled);
  const done = list.filter((d) => d.settled);
  const rec = open.filter((d) => d.kind === 'in').reduce((s, d) => s + (d.amount || 0), 0);
  const pay = open.filter((d) => d.kind === 'out').reduce((s, d) => s + (d.amount || 0), 0);
  const notifyOn = typeof Notification !== 'undefined' && Notification.permission === 'granted';

  let html = `
    <div class="grid2" style="margin-bottom:12px">
      <div class="stat"><div class="lbl">طلب باز</div><div class="val green">${fmt(rec)}</div></div>
      <div class="stat"><div class="lbl">بدهی باز</div><div class="val red">${fmt(pay)}</div></div>
    </div>
    <button class="btn primary block" style="margin-bottom:12px" onclick="openDebtForm()">+ ثبت طلب یا بدهی</button>
    ${
      notifyOn
        ? '<div class="hint" style="margin:0 0 12px">یادآوری روشن است. وقتی برنامه را باز کنی، موارد سررسیدشده را می‌گوید.</div>'
        : '<button class="btn block" style="margin-bottom:12px" onclick="enableDebtReminders()">یادآوری را روشن کن</button>'
    }`;

  if (!list.length) {
    html += `<div class="empty"><span class="em">🤝</span>هنوز طلب یا بدهی ثبت نکرده‌ای.<br>مثلاً پولی که به دوستت دادی یا از کسی قرض گرفتی.</div>`;
  } else {
    if (open.length) html += open.map(debtRow).join('');
    if (done.length) {
      html += `<div class="divider"></div><h3 class="muted" style="margin-bottom:10px">تسویه‌شده</h3>`;
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
    ? toFaSafe(late) + ' مورد سررسید شده یا امروز است'
    : toFaSafe(due.length) + ' مورد تا سه روز دیگر سررسید دارد';
  return `<div class="banner warn">⏰ <span>${text}.</span>
    <button class="btn sm primary" style="margin-right:auto" onclick="switchTab('debts')">ببین</button></div>`;
}

function toFaSafe(n) {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

export async function enableDebtReminders() {
  if (typeof Notification === 'undefined') {
    toast('این مرورگر یادآوری ندارد');
    return;
  }
  const p = await Notification.requestPermission();
  if (p !== 'granted') {
    toast('اجازه یادآوری داده نشد');
    return;
  }
  toast('یادآوری روشن شد');
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
    new Notification('طلب و بدهی', {
      body: due.length === 1
        ? due[0].person + ' — ' + dueLabel(due[0].dueISO)
        : due.length + ' مورد امروز یا عقب‌افتاده است',
      tag: 'capital-debts',
    });
  } catch (e) {}
}
