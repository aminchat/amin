// ─── اقساط: وام بانکی و خرید قسطی ───────────────────────────────────────────
// هر «طرح» یک جدول اقساط آزاد دارد؛ فرم فقط جدول اولیه را می‌سازد و بعد
// هر ردیف (تاریخ، مبلغ، سود، جریمه) قابل ویرایش است — حتی بعد از پرداخت.
//
// اتصال به حساب‌ها:
//   • وام: واریز اصل → تراکنش «قرض/امانت» (خارج از بودجه) به حساب دریافت
//   • پرداخت هر قسط / پیش‌پرداخت → تراکنش خرج از حساب، در پاکت انتخابی (داخل بودجه)
//   • ویرایش/حذف ردیف پرداخت‌شده → تراکنشش هماهنگ می‌شود
import { icon } from './icons.js';
import { esc, fmt, fmtShort, toFa, toast, uid, todayISO, haptic } from './utils.js';
import { fmtDate, monthOfISO, toJalali, toGregorian } from './jalali.js';
import { closeModal, openModal, askConfirm } from './modal.js';
import { render } from './view.js';
import { save, state, accountById, accountOptGroups, CATS, LOAN_CAT } from './state.js';

export function allPlans() {
  if (!state.installments) state.installments = [];
  return state.installments;
}
export function findPlan(id) {
  return allPlans().find((p) => p.id === id);
}

// ── تاریخ: n ماه جلالی بعد از تاریخ میلادی، با حفظ روزِ ماه ──
function addJMonths(iso, n) {
  const [gy, gm, gd] = iso.split('-').map(Number);
  let [jy, jm, jd] = toJalali(gy, gm, gd);
  jm += n;
  while (jm > 12) {
    jm -= 12;
    jy++;
  }
  while (jm < 1) {
    jm += 12;
    jy--;
  }
  const maxDay = jm <= 6 ? 31 : jm <= 11 ? 30 : toGregorian(jy, 12, 30) ? 30 : 29;
  const g = toGregorian(jy, jm, Math.min(jd, maxDay));
  if (!g) return iso;
  return g[0] + '-' + String(g[1]).padStart(2, '0') + '-' + String(g[2]).padStart(2, '0');
}

function daysUntil(iso) {
  if (!iso) return null;
  const a = new Date(todayISO() + 'T12:00:00');
  const b = new Date(iso + 'T12:00:00');
  return Math.round((b - a) / 86400000);
}

// ── محاسبات ──
export function rowTotal(r) {
  return (Number(r.amount) || 0) + (Number(r.interest) || 0) + (Number(r.penalty) || 0);
}
export function planStats(p) {
  const rows = p.rows || [];
  const paid = rows.filter((r) => r.paidISO);
  const unpaid = rows.filter((r) => !r.paidISO);
  const total = rows.reduce((s, r) => s + rowTotal(r), 0);
  const paidSum = paid.reduce((s, r) => s + rowTotal(r), 0);
  const remain = unpaid.reduce((s, r) => s + rowTotal(r), 0);
  const interestAll = rows.reduce((s, r) => s + (Number(r.interest) || 0), 0);
  const interestPaid = paid.reduce((s, r) => s + (Number(r.interest) || 0), 0);
  const penaltyPaid = paid.reduce((s, r) => s + (Number(r.penalty) || 0), 0);
  const next = unpaid.slice().sort((a, b) => a.dueISO.localeCompare(b.dueISO))[0] || null;
  const overdue = unpaid.filter((r) => daysUntil(r.dueISO) < 0).length;
  return { rows, paid, unpaid, total, paidSum, remain, interestAll, interestPaid, penaltyPaid, next, overdue, done: unpaid.length === 0 && rows.length > 0 };
}
// جمع ماندهٔ همهٔ طرح‌های باز (تعهدات)
export function totalRemaining() {
  return allPlans().reduce((s, p) => s + planStats(p).remain, 0);
}
// اقساطی که تا n روز آینده سررسید دارند یا عقب‌افتاده‌اند
export function dueRows(within = 3) {
  const out = [];
  for (const p of allPlans()) {
    for (const r of p.rows || []) {
      if (r.paidISO) continue;
      const n = daysUntil(r.dueISO);
      if (n !== null && n <= within) out.push({ plan: p, row: r, days: n });
    }
  }
  return out.sort((a, b) => a.row.dueISO.localeCompare(b.row.dueISO));
}
export function overdueInstallments() {
  return dueRows(0).length;
}
// جمع اقساط (پرداخت‌شده + نشده) سررسید در یک ماه جلالی
export function monthInstallments(mk) {
  let sum = 0;
  for (const p of allPlans()) for (const r of p.rows || []) if (monthOfISO(r.dueISO) === mk) sum += rowTotal(r);
  return sum;
}

// ── تراکنش‌های وصل‌شده ──
function removeTx(id) {
  if (!id) return;
  state.transactions = state.transactions.filter((t) => t.id !== id);
}
function upsertTx(existingId, payload) {
  let t = existingId ? state.transactions.find((x) => x.id === existingId) : null;
  if (t) Object.assign(t, payload);
  else {
    t = Object.assign({ id: uid() }, payload);
    state.transactions.push(t);
  }
  return t.id;
}
function rowLabel(p, r) {
  if (r.kind === 'down') return 'پیش‌پرداخت ' + p.title;
  if (r.kind === 'interest') return 'سود ' + p.title;
  const n = (p.rows || []).filter((x) => x.kind !== 'down' && x.kind !== 'interest').indexOf(r) + 1;
  return 'قسط ' + toFa(n) + ' ' + p.title;
}
function syncRowTx(p, r) {
  const acc = accountById(r.accountId || p.accountId);
  if (!r.paidISO || r.noTx || !acc || rowTotal(r) <= 0) {
    removeTx(r.txId);
    r.txId = null;
    return;
  }
  const note = rowLabel(p, r) + (r.penalty ? ' (با جریمه)' : '');
  r.txId = upsertTx(r.txId, {
    amount: rowTotal(r),
    accountId: acc.id,
    note,
    dateISO: r.paidISO,
    month: monthOfISO(r.paidISO),
    type: 'out',
    cat: p.cat || 'need',
    reflect: '',
    kind: 'simple',
    lines: null,
    updatedAt: Date.now(),
    planId: p.id,
    planRowId: r.id,
  });
}
function syncDisburseTx(p) {
  const acc = accountById(p.disburseAccountId);
  if (p.kind !== 'loan' || !acc || !(p.principal > 0)) {
    removeTx(p.disburseTxId);
    p.disburseTxId = null;
    return;
  }
  p.disburseTxId = upsertTx(p.disburseTxId, {
    amount: p.principal,
    accountId: acc.id,
    note: 'دریافت وام ' + p.title,
    dateISO: p.startISO || todayISO(),
    month: monthOfISO(p.startISO || todayISO()),
    type: 'in',
    cat: LOAN_CAT,
    reflect: '',
    kind: 'simple',
    lines: null,
    updatedAt: Date.now(),
    planId: p.id,
  });
}
function syncAllTx(p) {
  syncDisburseTx(p);
  for (const r of p.rows || []) syncRowTx(p, r);
  p.updatedAt = Date.now();
}

// ── ژنراتور جدول ──
// mode: 'equal' (اقساط مساوی، سود داخل قسط) | 'periodic' (اصل ماهانه + سود هر n ماه) | 'purchase'
function buildRows(o) {
  const rows = [];
  const count = Math.max(1, Math.round(o.count || 1));
  if (o.mode === 'purchase' && o.down > 0) {
    rows.push({ id: uid(), kind: 'down', dueISO: o.startISO, amount: o.down, interest: 0, penalty: 0, paidISO: o.downPaid ? o.startISO : null });
  }
  const firstISO = o.mode === 'purchase' ? addJMonths(o.startISO, 1) : o.firstISO || o.startISO;
  const per = Number(o.per) || 0;
  const perInt = o.mode === 'equal' ? Number(o.perInterest) || 0 : 0;
  for (let i = 0; i < count; i++) {
    const due = addJMonths(firstISO, i);
    rows.push({ id: uid(), kind: 'pay', dueISO: due, amount: per, interest: perInt, penalty: 0, paidISO: null });
    if (o.mode === 'periodic' && o.every > 0 && (i + 1) % o.every === 0 && o.periodInterest > 0) {
      rows.push({ id: uid(), kind: 'interest', dueISO: due, amount: 0, interest: o.periodInterest, penalty: 0, paidISO: null });
    }
  }
  return rows;
}

// ── فرم ساخت / ویرایش مشخصات ──
let editingId = null;
const F = { kind: 'loan', mode: 'equal' };

function catOptions(sel) {
  return CATS.filter((c) => !c.loan)
    .map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${c.label}</option>`)
    .join('');
}

export function openPlanForm(p) {
  editingId = p ? p.id : null;
  if (!state.accounts.length) {
    toast('اول یک حساب بساز');
    return;
  }
  F.kind = p ? p.kind : 'loan';
  F.mode = p ? p.mode || 'equal' : 'equal';
  const acc = p ? p.accountId : state.accounts[0].id;
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="بستن">${icon('x')}</button>
    <h2>${p ? 'ویرایش مشخصات' : 'قسط جدید'}</h2>
    <div class="seg" id="plKind" style="margin-bottom:14px">
      <button type="button" class="${F.kind === 'loan' ? 'on' : ''}" data-k="loan" onclick="plSetKind('loan')">وام</button>
      <button type="button" class="${F.kind === 'purchase' ? 'on' : ''}" data-k="purchase" onclick="plSetKind('purchase')">خرید قسطی</button>
    </div>
    <div class="field"><label>عنوان</label>
      <input class="input" id="plTitle" placeholder="${F.kind === 'loan' ? 'مثلاً وام مسکن' : 'مثلاً گوشی'}" value="${p ? esc(p.title) : ''}"></div>

    <div id="plLoanBox" style="${F.kind === 'loan' ? '' : 'display:none'}">
      <div class="row">
        <div class="col field"><label>مبلغ دریافتی (اصل وام)</label>
          <input class="input" id="plPrincipal" type="number" inputmode="numeric" placeholder="مثلاً 100000000" value="${p && p.principal ? p.principal : ''}"></div>
        <div class="col field"><label>تاریخ دریافت</label>
          <input class="input" id="plStart" type="date" value="${p ? p.startISO : todayISO()}"></div>
      </div>
      <div class="field"><label>واریز اصل وام به حساب</label>
        <select class="input" id="plDisburseAcc" onchange="plRecalc()"><option value="" ${!p || !p.disburseAccountId ? 'selected' : ''}>ثبت نشود — پول قبلاً در حسابم هست</option>${accountOptGroups(p ? p.disburseAccountId : '')}</select>
        <div class="hint" id="plDisburseHint" style="margin-top:6px">فقط اگر همین الان وام گرفته‌ای و هنوز موجودی‌اش را در حساب وارد نکرده‌ای، حساب را انتخاب کن. برای وام‌های قدیمی که پولش الان در حساب‌هایت هست «ثبت نشود» بماند وگرنه دوبار حساب می‌شود.</div>
      </div>
    </div>

    <div class="field"><label>هر قسط از کدام حساب و پاکت؟</label>
      <div class="row">
        <select class="input col" id="plAcc">${accountOptGroups(acc)}</select>
        <select class="input col" id="plCat">${catOptions(p ? p.cat : 'need')}</select>
      </div>
      <div class="hint" style="margin-top:6px">پرداخت قسط خرجِ واقعی ماه است و از بودجهٔ همان پاکت کم می‌شود.</div>
    </div>

    ${p ? '' : `
    <div class="divider"></div>
    <h3 style="margin-bottom:10px">جدول اقساط اولیه</h3>
    <div class="small muted" style="margin-bottom:10px">این فقط نقطهٔ شروع است؛ بعداً هر ردیف را جدا می‌توانی عوض کنی (مبلغ، تاریخ، سود، جریمه).</div>
    <div id="plModeBox" style="${F.kind === 'loan' ? '' : 'display:none'}">
      <div class="seg" style="margin-bottom:12px">
        <button type="button" class="${F.mode === 'equal' ? 'on' : ''}" onclick="plSetMode('equal')">اقساط مساوی</button>
        <button type="button" class="${F.mode === 'periodic' ? 'on' : ''}" onclick="plSetMode('periodic')">اصل ماهانه + سود دوره‌ای</button>
      </div>
    </div>
    <div id="plPurchaseBox" style="${F.kind === 'purchase' ? '' : 'display:none'}">
      <div class="field"><label>قیمت نقدی (اختیاری، برای مقایسه)</label>
        <input class="input" id="plCash" type="number" inputmode="numeric" placeholder="مثلاً 40000000" oninput="plRecalc()"></div>
      <div class="row">
        <div class="col field"><label>پیش‌پرداخت</label>
          <input class="input" id="plDown" type="number" inputmode="numeric" placeholder="0"></div>
        <div class="col field"><label>تاریخ خرید</label>
          <input class="input" id="plBuyDate" type="date" value="${todayISO()}"></div>
      </div>
      <label class="row" style="gap:8px;align-items:center;margin:-4px 0 12px;font-size:var(--fs-sm)"><input type="checkbox" id="plDownPaid" checked> پیش‌پرداخت را الان از حساب کم کن</label>
    </div>
    <div class="row">
      <div class="col field"><label>مدت (ماه)</label>
        <input class="input" id="plCount" type="number" inputmode="numeric" placeholder="مثلاً 36" oninput="plRecalc()"></div>
      <div class="col field" id="plRateBox" style="${F.kind === 'loan' ? '' : 'display:none'}"><label>نرخ سود سالانه ٪ (اختیاری)</label>
        <input class="input" id="plRate" type="number" inputmode="decimal" step="any" placeholder="مثلاً 23" oninput="plRecalc(true)"></div>
    </div>
    <div class="field"><label id="plPerLbl">${F.kind === 'loan' && F.mode === 'periodic' ? 'اصل هر ماه' : 'مبلغ هر قسط'}</label>
      <input class="input" id="plPer" type="number" inputmode="numeric" placeholder="مثلاً 15000000" oninput="plPerTouched=true;plRecalc()">
      <div class="hint" id="plPerHint" style="margin-top:6px">با نرخ سود پیشنهاد می‌شود؛ عدد قرارداد بانک را هر وقت خواستی جایگزین کن.</div></div>
    <div id="plEqualBox" style="${F.kind === 'loan' && F.mode === 'equal' ? '' : 'display:none'}">
      <div class="field"><label>از هر قسط چقدر سود است؟</label>
        <input class="input" id="plPerInt" type="number" inputmode="numeric" placeholder="مثلاً 2000000" oninput="plIntTouched=true;plRecalc()">
        <div class="hint" style="margin-top:6px">با نرخ سود خودکار پر می‌شود (تقسیم ساده). مثلاً قسط ۱۵ میلیون که ۲ میلیونش سود است.</div></div>
    </div>
    <div id="plPeriodicBox" style="${F.kind === 'loan' && F.mode === 'periodic' ? '' : 'display:none'}">
      <div class="row">
        <div class="col field"><label>سود هر دوره</label>
          <input class="input" id="plPeriodInt" type="number" inputmode="numeric" placeholder="مثلاً 24000000" oninput="plIntTouched=true;plRecalc()"></div>
        <div class="col field"><label>هر چند ماه یک‌بار؟</label>
          <input class="input" id="plEvery" type="number" inputmode="numeric" value="12" oninput="plRecalc()"></div>
      </div>
    </div>
    <div class="field" id="plFirstBox" style="${F.kind === 'loan' ? '' : 'display:none'}"><label>تاریخ اولین قسط</label>
      <input class="input" id="plFirst" type="date" value="${addJMonths(todayISO(), 1)}"></div>
    <div class="field"><label>چند قسط از قبل پرداخت شده؟ (برای وام‌های در جریان)</label>
      <input class="input" id="plPrepaid" type="number" inputmode="numeric" value="0" oninput="plRecalc()">
      <div class="hint" style="margin-top:6px">این‌ها فقط تیک می‌خورند؛ تراکنشی ساخته نمی‌شود و از حسابی کم نمی‌شود — چون آن پرداخت‌ها قبلاً از موجودی فعلی‌ات رفته‌اند.</div></div>
    <div class="hint" id="plSummary" style="margin-bottom:12px"></div>`}

    <div class="field"><label>توضیح (اختیاری)</label>
      <input class="input" id="plNote" value="${p ? esc(p.note || '') : ''}"></div>
    <button class="btn primary block" onclick="savePlan()">${p ? 'ذخیره' : 'ساخت جدول اقساط'}</button>
    ${p ? `<button class="btn danger block" style="margin-top:8px" onclick="delPlan('${p.id}')">حذف کامل این طرح</button>` : ''}
  `);
  if (!p) plRecalc();
}

export function plSetKind(k) {
  F.kind = k;
  document.querySelectorAll('#plKind button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
  const show = (id, on) => {
    const el = document.getElementById(id);
    if (el) el.style.display = on ? '' : 'none';
  };
  show('plLoanBox', k === 'loan');
  show('plModeBox', k === 'loan');
  show('plPurchaseBox', k === 'purchase');
  show('plFirstBox', k === 'loan');
  show('plRateBox', k === 'loan');
  plPerTouched = false;
  plIntTouched = false;
  show('plEqualBox', k === 'loan' && F.mode === 'equal');
  show('plPeriodicBox', k === 'loan' && F.mode === 'periodic');
  const t = document.getElementById('plTitle');
  if (t) t.placeholder = k === 'loan' ? 'مثلاً وام مسکن' : 'مثلاً گوشی';
  plRecalc();
}
export function plSetMode(m) {
  F.mode = m;
  document.querySelectorAll('#plModeBox .seg button').forEach((b, i) => b.classList.toggle('on', (i === 0 && m === 'equal') || (i === 1 && m === 'periodic')));
  const eq = document.getElementById('plEqualBox');
  const pe = document.getElementById('plPeriodicBox');
  if (eq) eq.style.display = m === 'equal' ? '' : 'none';
  if (pe) pe.style.display = m === 'periodic' ? '' : 'none';
  const l = document.getElementById('plPerLbl');
  if (l) l.textContent = m === 'periodic' ? 'اصل هر ماه' : 'مبلغ هر قسط';
  plPerTouched = false;
  plIntTouched = false;
  plRecalc();
}
function v(id) {
  const el = document.getElementById(id);
  return el ? Number(el.value) || 0 : 0;
}
let plPerTouched = false;
let plIntTouched = false;
function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val ? String(Math.round(val / 1000) * 1000) : '';
}
// فرمول ساده: سود کل = اصل × نرخ سالانه × (ماه ÷ ۱۲)؛ قسط = (اصل + سود) ÷ ماه
export function plRecalc(fromRate) {
  const box = document.getElementById('plSummary');
  if (!box) return;
  const count = v('plCount');
  const rate = v('plRate');
  const principal0 = v('plPrincipal');
  // پیشنهاد خودکار از نرخ (تا وقتی کاربر دستی چیزی ننوشته)
  if (F.kind === 'loan' && count > 0 && principal0 > 0 && rate > 0) {
    const totalInt = principal0 * (rate / 100) * (count / 12);
    if (F.mode === 'equal') {
      if (!plPerTouched || fromRate) setVal('plPer', (principal0 + totalInt) / count);
      if (!plIntTouched || fromRate) setVal('plPerInt', totalInt / count);
    } else {
      const every = v('plEvery') || 12;
      if (!plPerTouched || fromRate) setVal('plPer', principal0 / count);
      if (!plIntTouched || fromRate) setVal('plPeriodInt', principal0 * (rate / 100) * (every / 12));
    }
  }
  const per = v('plPer');
  if (!count || !per) {
    box.textContent = 'مدت و مبلغ قسط را بنویس تا خلاصه را ببینی.';
    return;
  }
  let principal = 0, interest = 0, extra = '';
  if (F.kind === 'purchase') {
    const down = v('plDown');
    principal = down + count * per;
    extra = down ? ' (پیش‌پرداخت ' + fmtShort(down) + ' + ' : ' (';
    extra += toFa(count) + ' × ' + fmtShort(per) + ')';
    const cash = v('plCash');
    if (cash > 0 && principal > cash) interest = principal - cash;
  } else if (F.mode === 'equal') {
    const pi = v('plPerInt');
    principal = count * (per - pi);
    interest = count * pi;
  } else {
    const every = v('plEvery') || 12;
    principal = count * per;
    interest = Math.floor(count / every) * v('plPeriodInt');
  }
  const pre = v('plPrepaid');
  const yrs = count / 12;
  const eff = F.kind === 'loan' && principal > 0 && yrs > 0 ? (interest / principal / yrs) * 100 : 0;
  box.innerHTML =
    `کل بازپرداخت: <b>${fmt(principal + interest)}</b> تومان${extra}` +
    (interest ? `<br>${F.kind === 'purchase' ? 'نسبت به نقدی' : 'از این مبلغ'} <b style="color:var(--orange)">${fmt(interest)}</b> ${F.kind === 'purchase' ? 'بیشتر می‌پردازی.' : 'سود است'}${eff ? ' (≈ ' + toFa(eff.toFixed(1).replace('.0', '')) + '٪ در سال).' : ''}` : '') +
    (F.kind === 'loan' && principal0 > 0 && Math.abs(principal - principal0) > count ? `<br><span style="color:var(--orange)">جمع اصلِ اقساط (${fmtShort(principal)}) با مبلغ وام (${fmtShort(principal0)}) یکی نیست؛ اگر عمدی نیست مبلغ قسط را چک کن.</span>` : '') +
    (pre > 0 ? `<br>${toFa(pre)} قسط اول پرداخت‌شده تیک می‌خورد؛ ماندهٔ فعلی ≈ <b>${fmt(Math.max(0, principal + interest - pre * per - (F.mode === 'equal' ? 0 : 0)))}</b>.` : '');
  const dh = document.getElementById('plDisburseHint');
  const da = document.getElementById('plDisburseAcc');
  if (dh && da) {
    const old = pre > 0 || (document.getElementById('plStart') && document.getElementById('plStart').value < todayISO());
    dh.style.color = da.value && old ? 'var(--red)' : '';
    if (da.value && old) dh.textContent = 'توجه: این وام مربوط به گذشته است؛ با انتخاب حساب، مبلغ وام دوباره به موجودی اضافه می‌شود. اگر پول از قبل در حسابت هست «ثبت نشود» را انتخاب کن.';
  }
}

export function savePlan() {
  const title = (document.getElementById('plTitle').value || '').trim();
  if (!title) return toast('عنوان را بنویس');
  const accountId = document.getElementById('plAcc').value;
  const cat = document.getElementById('plCat').value;
  const note = (document.getElementById('plNote').value || '').trim();
  const stamp = Date.now();

  if (editingId) {
    const p = findPlan(editingId);
    if (!p) return;
    Object.assign(p, { title, accountId, cat, note, updatedAt: stamp });
    if (p.kind === 'loan') {
      p.principal = v('plPrincipal');
      p.startISO = document.getElementById('plStart').value || p.startISO;
      p.disburseAccountId = document.getElementById('plDisburseAcc').value || '';
    }
    syncAllTx(p);
    save();
    closeModal();
    render();
    toast('ذخیره شد');
    return;
  }

  const count = v('plCount');
  const per = v('plPer');
  if (!count || count > 600) return toast('مدت را به ماه وارد کن');
  if (!per) return toast('مبلغ هر قسط را بنویس');
  const kind = F.kind;
  const p = { id: uid(), kind, mode: F.mode, title, accountId, cat, note, createdISO: todayISO(), updatedAt: stamp, rows: [] };
  if (kind === 'loan') p.rate = v('plRate') || 0;
  else p.cashPrice = v('plCash') || 0;
  if (kind === 'loan') {
    p.principal = v('plPrincipal');
    p.startISO = document.getElementById('plStart').value || todayISO();
    p.disburseAccountId = document.getElementById('plDisburseAcc').value || '';
    const perInt = F.mode === 'equal' ? v('plPerInt') : 0;
    p.rows = buildRows({
      mode: F.mode,
      count,
      per: F.mode === 'equal' ? per - perInt : per,
      perInterest: perInt,
      periodInterest: v('plPeriodInt'),
      every: v('plEvery') || 12,
      firstISO: document.getElementById('plFirst').value || addJMonths(p.startISO, 1),
      startISO: p.startISO,
    });
  } else {
    p.startISO = document.getElementById('plBuyDate').value || todayISO();
    p.rows = buildRows({
      mode: 'purchase',
      count,
      per,
      down: v('plDown'),
      downPaid: document.getElementById('plDownPaid').checked,
      startISO: p.startISO,
    });
  }
  // اقساط از قبل پرداخت‌شده: فقط تیک، بدون تراکنش
  let pre = v('plPrepaid');
  for (const r of p.rows) {
    if (pre <= 0) break;
    if (r.kind === 'down') continue;
    r.paidISO = r.dueISO;
    r.noTx = true;
    pre--;
  }
  allPlans().push(p);
  syncAllTx(p);
  save();
  closeModal();
  render();
  haptic(10);
  toast('طرح اقساط ساخته شد ✓');
  openPlanDetail(p.id);
}

export function delPlan(id) {
  const p = findPlan(id);
  if (!p) return;
  const linked = (p.rows || []).some((r) => r.txId) || p.disburseTxId;
  askConfirm(linked ? 'این طرح و همهٔ تراکنش‌های وصل‌شده (واریز و اقساط) حذف شود؟' : 'این طرح حذف شود؟', () => {
    removeTx(p.disburseTxId);
    for (const r of p.rows || []) removeTx(r.txId);
    state.installments = allPlans().filter((x) => x.id !== id);
    save();
    closeModal();
    render();
    toast('حذف شد');
  });
}

// ── پرداخت / لغو پرداخت یک ردیف ──
export function payRow(planId, rowId, opts) {
  const p = findPlan(planId);
  const r = p && (p.rows || []).find((x) => x.id === rowId);
  if (!r) return;
  r.paidISO = (opts && opts.dateISO) || todayISO();
  if (opts && opts.accountId) r.accountId = opts.accountId;
  r.noTx = false;
  syncRowTx(p, r);
  p.updatedAt = Date.now();
  save();
  render();
  haptic(10);
  toast(rowLabel(p, r) + ' پرداخت شد ✓');
  if (document.getElementById('plDetail')) openPlanDetail(planId);
}
export function unpayRow(planId, rowId) {
  const p = findPlan(planId);
  const r = p && (p.rows || []).find((x) => x.id === rowId);
  if (!r) return;
  r.paidISO = null;
  r.noTx = false;
  syncRowTx(p, r);
  p.updatedAt = Date.now();
  save();
  render();
  toast('پرداخت لغو شد');
  openPlanDetail(planId);
}

// پرداخت با انتخاب حساب/تاریخ (شیت کوچک)
export function openPayRow(planId, rowId) {
  const p = findPlan(planId);
  const r = p && (p.rows || []).find((x) => x.id === rowId);
  if (!r) return;
  const acc = r.accountId || p.accountId;
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="بستن">${icon('x')}</button>
    <h2>${rowLabel(p, r)}</h2>
    <div class="stat" style="margin-bottom:12px"><div class="lbl">مبلغ پرداخت</div><div class="val">${fmt(rowTotal(r))} <span class="small muted">تومان</span></div>
      ${r.interest || r.penalty ? `<div class="sub">اصل ${fmt(r.amount)}${r.interest ? ' + سود ' + fmt(r.interest) : ''}${r.penalty ? ' + جریمه ' + fmt(r.penalty) : ''}</div>` : ''}</div>
    <div class="field"><label>از کدام حساب؟</label><select class="input" id="prAcc">${accountOptGroups(acc)}</select></div>
    <div class="field"><label>تاریخ پرداخت</label><input class="input" id="prDate" type="date" value="${todayISO()}"></div>
    <div class="field"><label>جریمهٔ دیرکرد (اختیاری)</label><input class="input" id="prPenalty" type="number" inputmode="numeric" value="${r.penalty || ''}" placeholder="0"></div>
    <button class="btn primary block" onclick="confirmPayRow('${p.id}','${r.id}')">${icon('check')} ثبت پرداخت</button>
  `);
}
export function confirmPayRow(planId, rowId) {
  const p = findPlan(planId);
  const r = p && (p.rows || []).find((x) => x.id === rowId);
  if (!r) return;
  r.penalty = v('prPenalty');
  closeModal();
  payRow(planId, rowId, { accountId: document.getElementById('prAcc').value, dateISO: document.getElementById('prDate').value });
}

// ── ویرایش یک ردیف ──
export function openRowEdit(planId, rowId) {
  const p = findPlan(planId);
  const r = rowId ? (p.rows || []).find((x) => x.id === rowId) : null;
  openModal(`
    <button class="x" onclick="openPlanDetail('${planId}')" aria-label="بستن">${icon('x')}</button>
    <h2>${r ? 'ویرایش ردیف' : 'ردیف جدید'}</h2>
    <div class="field"><label>نوع</label>
      <select class="input" id="rwKind">
        <option value="pay" ${!r || r.kind === 'pay' ? 'selected' : ''}>قسط</option>
        <option value="interest" ${r && r.kind === 'interest' ? 'selected' : ''}>سود (جداگانه)</option>
        <option value="down" ${r && r.kind === 'down' ? 'selected' : ''}>پیش‌پرداخت</option>
      </select></div>
    <div class="row">
      <div class="col field"><label>اصل</label><input class="input" id="rwAmount" type="number" inputmode="numeric" value="${r ? r.amount || '' : ''}"></div>
      <div class="col field"><label>سود</label><input class="input" id="rwInterest" type="number" inputmode="numeric" value="${r ? r.interest || '' : ''}"></div>
      <div class="col field"><label>جریمه</label><input class="input" id="rwPenalty" type="number" inputmode="numeric" value="${r ? r.penalty || '' : ''}"></div>
    </div>
    <div class="field"><label>سررسید</label><input class="input" id="rwDue" type="date" value="${r ? r.dueISO : todayISO()}"></div>
    <div class="field"><label>تاریخ پرداخت (خالی = پرداخت نشده)</label><input class="input" id="rwPaid" type="date" value="${r && r.paidISO ? r.paidISO : ''}"></div>
    <div class="field"><label>حساب پرداخت</label><select class="input" id="rwAcc">${accountOptGroups(r ? r.accountId || p.accountId : p.accountId)}</select></div>
    <button class="btn primary block" onclick="saveRow('${planId}','${r ? r.id : ''}')">ذخیره</button>
    ${r ? `<button class="btn danger block" style="margin-top:8px" onclick="delRow('${planId}','${r.id}')">حذف این ردیف</button>` : ''}
  `);
}
export function saveRow(planId, rowId) {
  const p = findPlan(planId);
  if (!p) return;
  let r = rowId ? p.rows.find((x) => x.id === rowId) : null;
  if (!r) {
    r = { id: uid() };
    p.rows.push(r);
  }
  r.kind = document.getElementById('rwKind').value;
  r.amount = v('rwAmount');
  r.interest = v('rwInterest');
  r.penalty = v('rwPenalty');
  r.dueISO = document.getElementById('rwDue').value || r.dueISO || todayISO();
  r.paidISO = document.getElementById('rwPaid').value || null;
  r.accountId = document.getElementById('rwAcc').value;
  if (r.paidISO) r.noTx = false;
  p.rows.sort((a, b) => a.dueISO.localeCompare(b.dueISO));
  syncRowTx(p, r);
  p.updatedAt = Date.now();
  save();
  render();
  toast('ذخیره شد');
  openPlanDetail(planId);
}
export function delRow(planId, rowId) {
  const p = findPlan(planId);
  if (!p) return;
  const r = p.rows.find((x) => x.id === rowId);
  if (r) removeTx(r.txId);
  p.rows = p.rows.filter((x) => x.id !== rowId);
  p.updatedAt = Date.now();
  save();
  render();
  openPlanDetail(planId);
}

// ── جزئیات یک طرح ──
export function openPlanDetail(id) {
  const p = findPlan(id);
  if (!p) return;
  const st = planStats(p);
  const pct = st.total > 0 ? Math.round((st.paidSum / st.total) * 100) : 0;
  let payN = 0;
  const rows = st.rows
    .slice()
    .sort((a, b) => a.dueISO.localeCompare(b.dueISO))
    .map((r) => {
      if (r.kind === 'pay') payN++;
      const n = daysUntil(r.dueISO);
      const late = !r.paidISO && n < 0;
      const soon = !r.paidISO && n >= 0 && n <= 3;
      const lbl = r.kind === 'down' ? 'پیش‌پرداخت' : r.kind === 'interest' ? 'سود دوره' : 'قسط ' + toFa(payN);
      const sub = r.paidISO
        ? 'پرداخت شد ' + fmtDate(r.paidISO) + (r.noTx ? ' · بدون تراکنش' : '')
        : late
          ? '<span style="color:var(--red)">عقب‌افتاده · ' + fmtDate(r.dueISO) + '</span>'
          : (soon ? '<span style="color:var(--orange)">' : '') + 'سررسید ' + fmtDate(r.dueISO) + (soon ? '</span>' : '');
      const parts = [];
      if (r.interest) parts.push('سود ' + fmtShort(r.interest));
      if (r.penalty) parts.push('جریمه ' + fmtShort(r.penalty));
      return `<div class="item" style="min-height:56px;${r.paidISO ? 'opacity:.7' : ''}">
        <div class="ic" style="background:${r.paidISO ? 'var(--green-soft)' : late ? 'var(--red-soft)' : 'var(--card2)'};color:${r.paidISO ? 'var(--green)' : late ? 'var(--red)' : 'var(--muted)'}">${icon(r.paidISO ? 'check' : r.kind === 'interest' ? 'coin' : 'calendar')}</div>
        <div class="mid" onclick="openRowEdit('${p.id}','${r.id}')">
          <div class="t1">${lbl}${parts.length ? ' <span class="badge">' + parts.join(' · ') + '</span>' : ''}</div>
          <div class="t2">${sub}</div>
        </div>
        <div class="amt-col">
          <div class="amt ${r.paidISO ? '' : 'out'}">${fmt(rowTotal(r))}</div>
          ${r.paidISO
            ? `<button class="btn sm" style="margin-top:4px" onclick="unpayRow('${p.id}','${r.id}')">لغو</button>`
            : `<button class="btn sm primary" style="margin-top:4px" onclick="openPayRow('${p.id}','${r.id}')">پرداخت</button>`}
        </div>
      </div>`;
    })
    .join('');
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="بستن">${icon('x')}</button>
    <div id="plDetail">
    <h2>${esc(p.title)} <span class="badge">${p.kind === 'loan' ? 'وام' : 'خرید قسطی'}</span></h2>
    <div class="grid3" style="margin-bottom:10px">
      <div class="stat"><div class="lbl">مانده</div><div class="val red">${fmtShort(st.remain)}</div></div>
      <div class="stat"><div class="lbl">پرداخت‌شده</div><div class="val green">${fmtShort(st.paidSum)}</div></div>
      <div class="stat"><div class="lbl">سود کل</div><div class="val orange">${fmtShort(st.interestAll)}</div><div class="sub">${fmtShort(st.interestPaid)} داده‌ای</div></div>
    </div>
    <div class="pbar" style="margin:4px 0 6px"><div style="width:${pct}%"></div></div>
    <div class="small muted" style="display:flex;justify-content:space-between;margin-bottom:12px"><span>${toFa(st.paid.length)} از ${toFa(st.rows.length)} پرداخت</span><span>${toFa(pct)}٪</span></div>
    <div class="row" style="margin-bottom:12px">
      <button class="btn sm" style="flex:1" onclick="openRowEdit('${p.id}','')">${icon('plus')} ردیف</button>
      <button class="btn sm" style="flex:1" onclick="openPlanForm(findPlan('${p.id}'))">${icon('edit')} مشخصات</button>
    </div>
    <div style="max-height:52vh;overflow:auto">${rows || '<div class="empty">ردیفی نیست.</div>'}</div>
    </div>
  `);
}

// ── کارت هر طرح در صفحهٔ طلب و بدهی ──
function planCard(p) {
  const st = planStats(p);
  const pct = st.total > 0 ? Math.round((st.paidSum / st.total) * 100) : 0;
  const nxt = st.next;
  const n = nxt ? daysUntil(nxt.dueISO) : null;
  const nextTxt = st.done
    ? '<span style="color:var(--green)">تسویه شد</span>'
    : nxt
      ? (n < 0 ? '<span style="color:var(--red)">عقب‌افتاده · </span>' : n <= 3 ? '<span style="color:var(--orange)">به‌زودی · </span>' : 'بعدی ') + fmtDate(nxt.dueISO) + ' · ' + fmtShort(rowTotal(nxt))
      : '';
  return `<div class="card" style="padding:var(--sp-3)">
    <div class="row" style="align-items:center;gap:var(--sp-3)" onclick="openPlanDetail('${p.id}')">
      <span class="ib ${st.overdue ? 'red' : st.done ? 'green' : ''}">${icon(p.kind === 'loan' ? 'bank' : 'gift')}</span>
      <div style="flex:1;min-width:0">
        <div class="t1" style="font-size:var(--fs-md)">${esc(p.title)}</div>
        <div class="t2">${toFa(st.paid.length)} از ${toFa(st.rows.length)} · ${nextTxt}</div>
      </div>
      <div class="amt-col"><div class="amt out">${fmtShort(st.remain)}</div><div class="bal">مانده</div></div>
    </div>
    <div class="pbar" style="margin:10px 0 8px"><div style="width:${pct}%;background:${st.overdue ? 'var(--red)' : 'var(--accent)'}"></div></div>
    ${nxt && !st.done && n <= 7 ? `<button class="btn sm block" onclick="openPayRow('${p.id}','${nxt.id}')">${icon('check')} پرداخت ${nxt.kind === 'interest' ? 'سود' : 'قسط'} ${fmtShort(rowTotal(nxt))}</button>` : ''}
  </div>`;
}

export function renderInstallments() {
  const box = document.getElementById('installmentsContent');
  if (!box) return;
  const plans = allPlans().slice().sort((a, b) => {
    const sa = planStats(a), sb = planStats(b);
    if (sa.done !== sb.done) return sa.done ? 1 : -1;
    return (sa.next ? sa.next.dueISO : '9').localeCompare(sb.next ? sb.next.dueISO : '9');
  });
  const remain = totalRemaining();
  const paidAll = allPlans().reduce((s, p) => s + planStats(p).paidSum, 0);
  const intAll = allPlans().reduce((s, p) => s + planStats(p).interestAll, 0);
  let html = '';
  if (plans.length) {
    html += `<div class="hero">
      <div style="min-width:0"><div class="lbl">${icon('calendar')} ماندهٔ اقساط</div>
      <div class="hero-num">${fmtShort(remain)}<small>تومان</small></div>
      <div class="sub">پرداخت‌شده ${fmtShort(paidAll)} · سود کل ${fmtShort(intAll)}</div></div>
      <span class="ib lg ${overdueInstallments() ? 'red' : ''}">${icon('calendar')}</span>
    </div>`;
    html += plans.map(planCard).join('');
  } else {
    html += `<div class="empty"><span class="ib lg muted">${icon('calendar')}</span>وام یا خرید قسطی ثبت نکرده‌ای.<br>با دکمهٔ + بالا یا پایین صفحه شروع کن.</div>`;
  }
  box.innerHTML = html;
}

export function installmentsSection() {
  const plans = allPlans().slice().sort((a, b) => {
    const sa = planStats(a), sb = planStats(b);
    if (sa.done !== sb.done) return sa.done ? 1 : -1;
    return (sa.next ? sa.next.dueISO : '9') .localeCompare(sb.next ? sb.next.dueISO : '9');
  });
  const remain = totalRemaining();
  return `<div class="divider"></div>
    <div class="card-head"><h3>${icon('calendar')} اقساط</h3>${plans.length ? `<span class="small muted">ماندهٔ کل ${fmtShort(remain)}</span>` : ''}</div>
    ${plans.length ? plans.map(planCard).join('') : `<div class="empty" style="padding:var(--sp-4)">وام یا خرید قسطی نداری.</div>`}
    <button class="btn block" style="margin-bottom:12px" onclick="openPlanForm()">${icon('plus')} وام / خرید قسطی جدید</button>`;
}

// ── کارت یادآوری خانه ──
export function installmentHomeCard() {
  const due = dueRows(3);
  if (!due.length) return '';
  const first = due[0];
  const more = due.length - 1;
  const lateN = due.filter((x) => x.days < 0).length;
  return `<div class="card" style="border-color:${lateN ? 'var(--red-soft)' : 'var(--orange-soft)'}">
    <div class="row" style="align-items:center;gap:var(--sp-3)">
      <span class="ib ${lateN ? 'red' : 'orange'}">${icon('bell')}</span>
      <div style="flex:1;min-width:0">
        <div class="t1">${rowLabel(first.plan, first.row)} · ${fmtShort(rowTotal(first.row))} تومان</div>
        <div class="t2">${first.days < 0 ? '<span style="color:var(--red)">' + toFa(-first.days) + ' روز عقب‌افتاده</span>' : first.days === 0 ? 'امروز سررسید است' : toFa(first.days) + ' روز دیگر'}${more ? ' · ' + toFa(more) + ' مورد دیگر' : ''}</div>
      </div>
    </div>
    <div class="row" style="margin-top:var(--sp-3)">
      <button class="btn sm primary" style="flex:1" onclick="openPayRow('${first.plan.id}','${first.row.id}')">${icon('check')} پرداخت شد</button>
      <button class="btn sm" style="flex:1" onclick="switchTab('debts')">${more ? 'همه' : 'جزئیات'}</button>
    </div>
  </div>`;
}
