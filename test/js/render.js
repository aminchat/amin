import { esc, fmt, fmtT, fmtShort, toFa, store, infoTip } from './utils.js';
import { icon, accountIcon, institutionIconName } from './icons.js';
import { isGoogleLinked, googleSyncOk } from './sync.js';
import { curMonthKey, fmtDate, monthLabel, shiftMonth, jalaliNow, toGregorian, MONTHS } from './jalali.js';
import { renderSyncCard } from './sync.js';
import * as sec from './securestore.js';
import { debtHomeBanner, overdueCount, renderDebts } from './debts.js';
import { installmentHomeCard, totalRemaining, monthInstallments, renderInstallments, overdueInstallments, dueRows, rowTotal } from './installments.js';
import { debtRemaining, dueSoonDebts, daysUntilDue } from './debts.js';
import {
  CATS,
  accountById,
  accountCurrent,
  cashTotal,
  catById,
  computeMonths,
  curStats,
  hasLocalData,
  investProfit,
  investTotal,
  investValue,
  isInvoice,
  isTransfer,
  pocketItems,
  rateOf,
  runningBalanceByTxId,
  sortTxs,
  state,
  budgetOf,
  catSpent,
  catCeiling,
  loanFlow,
  accountCurrentToman,
  institutionOf,
} from './state.js';

export let txMonth = curMonthKey();
export let repMonth = curMonthKey();

function envelopeBars(mk) {
  return `<div class="pockets">${CATS.map((c) => {
    if (c.loan) {
      const f = loanFlow(mk);
      const has = f.out > 0 || f.in > 0;
      const netTxt = !has
        ? 'بدون گردش'
        : f.net === 0
          ? 'سر به سر'
          : f.net > 0
            ? '+' + fmt(f.net) + ' گرفته‌ای'
            : '−' + fmt(-f.net) + ' داده‌ای';
      return `<button type="button" class="pocket" onclick="openPocketLedger('${c.id}','${mk}')">
      <div class="pocket-head">
        <span class="pocket-ic" style="background:${c.color}22;color:${c.color}">${icon('cat_' + c.id)}</span>
        <span class="pocket-name">${c.label}</span>
        <span class="pocket-share" style="color:${c.color}">${netTxt}</span>
      </div>
      <div class="small muted" style="margin-top:6px">خارج از بودجه · داده: ${fmt(f.out)} · گرفته/برگشتی: ${fmt(f.in)}</div>
    </button>`;
    }
    const spent = catSpent(mk, c.id);
    const ceil = catCeiling(mk, c.id);
    const over = c.target === 0 ? spent > 0 : ceil > 0 && spent > ceil;
    const width = ceil > 0 ? Math.min(100, Math.round((spent / ceil) * 100)) : spent > 0 ? 100 : 0;
    return `<button type="button" class="pocket ${over ? 'over' : ''}" onclick="openPocketLedger('${c.id}','${mk}')">
      <div class="pocket-head">
        <span class="pocket-ic" style="background:${c.color}22;color:${c.color}">${icon('cat_' + c.id)}</span>
        <span class="pocket-name">${c.label}</span>
        <span class="pocket-share">${toFa(c.target)}٪</span>
      </div>
      <div class="bar"><div style="width:${width}%;background:${over ? 'var(--red)' : c.color}"></div></div>
    </button>`;
  }).join('')}</div>`;
}

export function togglePocket(el) {
  const wrap = el.closest('.pockets');
  const wasOpen = el.classList.contains('open');
  if (wrap) wrap.querySelectorAll('.pocket.open').forEach((p) => p.classList.remove('open'));
  if (!wasOpen) el.classList.add('open');
}

// روزهای ماه جلالی (۱-۶: ۳۱، ۷-۱۱: ۳۰، ۱۲: ۲۹/۳۰)
function jDaysInMonth(y, m) {
  if (m <= 6) return 31;
  if (m <= 11) return 30;
  return toGregorian(y, 12, 30) ? 30 : 29;
}

function ringSVG(pct, cls) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return `<div class="ring ${cls || ''}">
    <svg viewBox="0 0 84 84"><circle class="track" cx="42" cy="42" r="${r}"/><circle class="prog" cx="42" cy="42" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - p / 100)).toFixed(1)}"/></svg>
    <div class="pct">${toFa(Math.round(pct))}٪</div>
  </div>`;
}

function homePockets(mk) {
  return `<div class="pk-scroll">${CATS.map((c) => {
    if (c.loan) {
      const f = loanFlow(mk);
      const has = f.out > 0 || f.in > 0;
      const txt = !has ? 'بدون گردش' : f.net === 0 ? 'سر به سر' : f.net > 0 ? 'گرفته‌ای' : 'داده‌ای';
      return `<button type="button" class="pk" onclick="openPocketLedger('${c.id}','${mk}')">
        <span class="ib sm" style="background:${c.color}22;color:${c.color}">${icon('cat_loan')}</span>
        <span class="n">${c.label}</span>
        <span class="a">${has ? fmtShort(Math.abs(f.net)) : '—'}</span>
        <span class="s">${txt}</span>
      </button>`;
    }
    const spent = catSpent(mk, c.id);
    const ceil = catCeiling(mk, c.id);
    const over = c.target === 0 ? spent > 0 : ceil > 0 && spent > ceil;
    const width = ceil > 0 ? Math.min(100, Math.round((spent / ceil) * 100)) : spent > 0 ? 100 : 0;
    const left = ceil - spent;
    const sub = c.target === 0 ? (spent > 0 ? 'کاش نبود' : 'هیچی، عالی') : ceil > 0 ? (left >= 0 ? fmtShort(left) + ' مانده' : fmtShort(-left) + ' بیشتر') : 'بدون سقف';
    return `<button type="button" class="pk ${over ? 'over' : ''}" onclick="openPocketLedger('${c.id}','${mk}')">
      <span class="ib sm" style="background:${c.color}22;color:${c.color}">${icon('cat_' + c.id)}</span>
      <span class="n">${c.label}</span>
      <span class="a">${fmtShort(spent)}</span>
      <span class="s">${sub}</span>
      <span class="bar"><div style="width:${width}%;background:${over ? 'var(--red)' : c.color}"></div></span>
    </button>`;
  }).join('')}</div>`;
}

function homeStatusChips() {
  const chips = [];
  // وضعیت همگام‌سازی و رمزنگاری در تنظیمات است؛ فقط اگر اتصال قطع شده باشد این‌جا هشدار می‌دهیم
  if (isGoogleLinked() && !googleSyncOk()) chips.push({ cls: 'warn', ic: 'cloud', t: 'اتصال گوگل منقضی', on: 'googleSignIn()' });
  const nw = cashTotal() + investTotal();
  chips.push({ cls: '', ic: 'wallet', t: 'خالص دارایی ' + fmtShort(nw), on: "switchTab('accounts')" });
  const oblig = totalRemaining();
  if (oblig > 0) chips.push({ cls: '', ic: 'calendar', t: 'تعهدات ' + fmtShort(oblig), on: "switchTab('debts')" });
  const inv = investTotal();
  if (inv > 0) chips.push({ cls: '', ic: 'trend', t: 'سرمایه ' + fmtShort(inv), on: "switchTab('invest')" });
  return `<div class="status-row">${chips
    .map((c) => `<button type="button" class="schip ${c.cls}" onclick="${c.on}">${icon(c.ic)}<span>${c.t}</span></button>`)
    .join('')}</div>`;
}

function onboardingCard(mk) {
  const hasAcct = state.accounts.length > 0;
  const hasBudget = !!(state.budgets[mk] && state.budgets[mk].amount);
  const hasTx = state.transactions.length > 0;
  if (hasAcct && hasBudget && hasTx) return '';
  const steps = [
    { done: hasAcct, t: 'یک حساب بساز', d: 'کارت بانکی یا پول نقد', on: 'openAccountForm()' },
    { done: hasBudget, t: 'بودجهٔ این ماه را بنویس', d: 'چقدر می‌خواهی این ماه خرج کنی؟', on: 'openBudgetForm()' },
    { done: hasTx, t: 'اولین خرج را ثبت کن', d: 'با دکمهٔ + پایین صفحه', on: 'openTxForm()' },
  ];
  return `<div class="card">
    <div class="card-head"><h3>${icon('sparkle')} شروع سریع</h3><span class="small muted">${toFa(steps.filter((x) => x.done).length)} از ${toFa(3)}</span></div>
    <div class="onb">${steps
      .map((st, i) => `<button type="button" class="onb-step ${st.done ? 'done' : ''}" onclick="${st.on}">
        <span class="n">${st.done ? icon('check') : toFa(i + 1)}</span>
        <span class="t">${st.t}<span class="d">${st.d}</span></span>${icon('chevL')}
      </button>`)
      .join('')}</div>
  </div>`;
}

function txRow(t, opts = {}) {
  const a = accountById(t.accountId);
  const inv = isInvoice(t);
  const cat = t.type === 'out' && !inv ? catById(t.cat) : null;
  const transfer = isTransfer(t);
  const icName = transfer ? 'swap' : inv ? 'receipt' : t.type === 'in' ? (t.cat === 'loan' ? 'cat_loan' : 'arrowIn') : cat ? 'cat_' + cat.id : 'arrowOut';
  const color = transfer ? 'var(--purple)' : inv ? 'var(--orange)' : t.type === 'in' ? 'var(--green)' : cat ? cat.color : 'var(--muted)';
  const title = t.note
    ? esc(t.note)
    : transfer
      ? 'انتقال بین حساب‌ها'
      : inv
        ? 'فاکتور'
        : t.type === 'in'
          ? (t.cat === 'loan' ? 'قرض / امانت' : 'درآمد')
          : cat
            ? cat.label
            : 'خرج';
  const unitHint = !inv && t.qty && t.unitPrice ? toFa(t.qty) + (t.unit ? ' ' + esc(t.unit) : '') + ' × ' + fmt(t.unitPrice) : '';
  const amtClass = transfer ? 'transfer' : t.type;
  const sign = t.type === 'in' || t.type === 'transferIn' ? '+' : '−';
  const balTxt = opts.bal == null ? '' : `<div class="bal">مانده ${fmt(opts.bal)}</div>`;
  const badges =
    (transfer ? '<span class="badge" style="color:var(--purple)">انتقال</span>' : '') +
    (inv ? '<span class="badge" style="color:var(--orange)">' + toFa((t.lines || []).length) + ' قلم</span>' : '') +
    (!opts.compact && t.type === 'out' && cat ? '<span class="badge" style="color:' + cat.color + '">' + cat.label + '</span>' : '') +
    (t.debtId ? '<span class="badge">طلب/بدهی</span>' : '') +
    (t.planId ? '<span class="badge">قسط</span>' : '') +
    (t.cat === 'waste' && t.reflect ? '<span class="badge" style="color:var(--red)">پاسخ داری</span>' : '') +
    (a && a.currency && a.currency !== 'تومان' ? '<span class="badge">' + esc(a.currency) + '</span>' : '');
  const item = `<div class="item" data-tx="${t.id}" onclick="openTxForm(findTx('${t.id}'))">
      <div class="ic" style="background:${color.startsWith('var') ? color.replace(')', '-soft)') : color + '22'};color:${color}">${icon(icName)}</div>
      <div class="mid">
        <div class="t1">${title}</div>
        <div class="t2">${fmtDate(t.dateISO)} · ${a ? esc(a.name) : '—'}${unitHint ? ' · ' + unitHint : ''} ${badges}</div>
      </div>
      <div class="amt-col"><div class="amt ${amtClass}">${sign}${fmt(t.amount)}</div>${balTxt}</div>
    </div>`;
  if (opts.noSwipe) return item;
  return `<div class="swipe" data-tx="${t.id}">
    <div class="under"><span class="l" style="color:var(--accent)">${icon('edit')} ویرایش</span><span class="r" style="color:var(--red)">حذف ${icon('trash')}</span></div>
    ${item}
  </div>`;
}

export function renderHome() {
  const s = curStats();
  const mk = curMonthKey();
  const hasBudget = !!(state.budgets[mk] && state.budgets[mk].amount);
  const base = s.available > 0 ? s.available : s.budget;
  const pct = base > 0 ? Math.round((s.spent / base) * 100) : 0;
  const [jy, jm, jd] = jalaliNow();
  const daysLeft = Math.max(1, jDaysInMonth(jy, jm) - jd + 1);
  const perDay = s.remaining > 0 ? Math.floor(s.remaining / daysLeft) : 0;
  let html = '';

  html += renderSyncCard();
  html += debtHomeBanner();
  html += installmentHomeCard();
  if (!store.persisted) {
    html += `<div class="banner">${icon('alert')}<span>حالت پیش‌نمایش: ذخیره دائمی فعال نیست. فایل را روی گوشی باز کن.</span></div>`;
  }

  // کارت قهرمان
  const ringCls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';
  html += `<div class="hero">
    <div style="min-width:0">
      <div class="lbl">${icon('wallet')} قابل خرج ${monthLabel(mk)}</div>
      <div class="hero-num ${s.remaining < 0 ? 'val red' : ''}">${fmtShort(s.remaining)}</div>
      <div class="sub">${
        !hasBudget
          ? 'هنوز بودجه‌ای ثبت نشده'
          : s.remaining > 0
            ? `تا آخر ماه (${toFa(daysLeft)} روز) روزی <b>${fmtShort(perDay)}</b>`
            : 'از بودجه رد شده‌ای'
      }</div>
    </div>
    ${ringSVG(pct, ringCls)}
    <div class="hero-foot">
      <div class="kv"><div class="k">بودجه</div><div class="v">${fmtShort(s.budget)}</div></div>
      <div class="kv"><div class="k">مانده قبلی</div><div class="v">${fmtShort(s.carriedIn)}</div></div>
      <div class="kv"><div class="k">خرج شده</div><div class="v val red">${fmtShort(s.spent)}</div></div>
      ${hasBudget ? `<button type="button" class="link" onclick="openBudgetForm()">${icon('edit')}</button>` : `<button type="button" class="btn sm primary" onclick="openBudgetForm()">ثبت بودجه</button>`}
    </div>
  </div>`;

  html += homeStatusChips();
  html += onboardingCard(mk);

  html += `<div class="card" style="padding-bottom:var(--sp-2)">
    <div class="card-head"><h3>${icon('target')} پاکت‌های این ماه</h3><button type="button" class="link" onclick="switchTab('report')">جزئیات</button></div>
    ${homePockets(mk)}
  </div>`;

  // آخرین تراکنش‌ها
  const recent = sortTxs(state.transactions.slice()).slice(0, 3);
  if (recent.length) {
    html += `<div class="card">
      <div class="card-head"><h3>${icon('list')} آخرین تراکنش‌ها</h3><button type="button" class="link" onclick="switchTab('tx')">همه</button></div>
      <div class="tx-list">${recent.map((t) => txRow(t, { noSwipe: true, compact: true })).join('')}</div>
    </div>`;
  }

  document.getElementById('homeContent').innerHTML = html;
}

export function renderTx() {
  const txs = sortTxs(state.transactions.filter((t) => t.month === txMonth));
  const after = runningBalanceByTxId();
  let html = `<div class="mnav">
    <button type="button" onclick="txShift(-1)" aria-label="ماه قبل">${icon('chevR')}</button>
    <div class="mttl">${monthLabel(txMonth)}<div class="small muted">${txMonth === curMonthKey() ? 'ماه جاری' : ''}</div></div>
    <button type="button" onclick="txShift(1)" aria-label="ماه بعد">${icon('chevL')}</button>
  </div>`;

  if (txs.length === 0) {
    html += `<div class="empty"><span class="ib lg muted">${icon('list')}</span>در این ماه تراکنشی ثبت نشده.<br>با دکمهٔ + پایین صفحه شروع کن.</div>`;
  } else {
    const sumOut = txs.filter((t) => t.type === 'out' && !isTransfer(t) && t.cat !== 'loan').reduce((x, t) => x + (t.amount || 0), 0);
    const sumIn = txs.filter((t) => t.type === 'in' && !isTransfer(t) && t.cat !== 'loan').reduce((x, t) => x + (t.amount || 0), 0);
    html += `<div class="grid2" style="margin-bottom:var(--sp-3)">
      <div class="stat"><div class="lbl">خرج این ماه</div><div class="val red">${fmtShort(sumOut)}</div></div>
      <div class="stat"><div class="lbl">درآمد این ماه</div><div class="val green">${fmtShort(sumIn)}</div></div>
    </div>`;
    // گروه‌بندی بر اساس روز
    let lastDay = '';
    for (const t of txs) {
      const day = fmtDate(t.dateISO);
      if (day !== lastDay) {
        html += `<div class="small muted" style="margin:var(--sp-3) 4px var(--sp-2);font-weight:700">${day}</div>`;
        lastDay = day;
      }
      html += txRow(t, { bal: after[t.id] });
    }
    html += `<div class="small muted" style="text-align:center;padding:var(--sp-3)">راهنما: کشیدن به چپ = حذف · به راست = ویرایش · نگه‌داشتن = تکرار</div>`;
  }
  html += `<button type="button" class="btn block" style="margin:var(--sp-2) 0" onclick="openPaperScan()">${icon('scan')} ثبت چند تراکنش از عکس کاغذ</button>`;
  document.getElementById('txContent').innerHTML = html;
  attachSwipe(document.getElementById('txContent'));
}

// ── سوایپ روی ردیف تراکنش ──
function attachSwipe(root) {
  if (!root) return;
  root.querySelectorAll('.swipe').forEach((w) => {
    const item = w.querySelector('.item');
    const id = w.dataset.tx;
    let x0 = 0, y0 = 0, dx = 0, active = false, horiz = null, lp = null, fired = false;
    const reset = () => {
      w.classList.remove('dragging');
      item.style.transform = '';
    };
    w.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      x0 = e.clientX; y0 = e.clientY; dx = 0; active = true; horiz = null; fired = false;
      lp = setTimeout(() => {
        if (horiz) return;
        fired = true;
        if (navigator.vibrate) navigator.vibrate(15);
        const t = findTxLocal(id);
        if (t) window.openTxForm(null, { repeatOf: t });
      }, 550);
    });
    w.addEventListener('pointermove', (e) => {
      if (!active) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (horiz === null && (Math.abs(mx) > 8 || Math.abs(my) > 8)) {
        horiz = Math.abs(mx) > Math.abs(my);
        if (!horiz) { active = false; clearTimeout(lp); reset(); return; }
        clearTimeout(lp);
        w.classList.add('dragging');
        try { w.setPointerCapture(e.pointerId); } catch (err) {}
      }
      if (!horiz) return;
      dx = Math.max(-120, Math.min(120, mx));
      item.style.transform = `translateX(${dx}px)`;
      e.preventDefault();
    }, { passive: false });
    const end = () => {
      clearTimeout(lp);
      if (!active) return;
      active = false;
      const d = dx;
      reset();
      if (fired) { fired = false; return; }
      if (horiz && d < -80) window.delTx(id);
      else if (horiz && d > 80) { const t = findTxLocal(id); if (t) window.openTxForm(t); }
      if (horiz && Math.abs(d) > 8) {
        // جلوگیری از کلیک بعد از سوایپ
        const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
        item.addEventListener('click', stop, { capture: true, once: true });
        setTimeout(() => item.removeEventListener('click', stop, { capture: true }), 300);
      }
    };
    w.addEventListener('pointerup', end);
    w.addEventListener('pointercancel', end);
    w.addEventListener('pointerleave', () => { if (active && !horiz) { clearTimeout(lp); } });
    w.addEventListener('contextmenu', (e) => e.preventDefault());
  });
}
function findTxLocal(id) {
  return state.transactions.find((x) => x.id === id);
}

export function txShift(d) {
  txMonth = shiftMonth(txMonth, d);
  renderTx();
}

// ── Bullet chart: برنامه در برابر واقعیت ──
// هر ردیف: نوار کم‌رنگ = سهم برنامه (X)، نوار پررنگ = خرج واقعی (Y)، خط عمودی = هدف.
// مقیاس مشترک: با بودجه → بودجه؛ بدون بودجه → کل خرج ماه (مقایسهٔ توزیع).
function bulletRows(mk, budget, totalSpent) {
  const base = budget || totalSpent;
  const cats = CATS.filter((c) => !c.loan);
  let maxV = 0;
  const rows = cats.map((c) => {
    const spent = catSpent(mk, c.id);
    const target = base ? Math.round((base * c.target) / 100) : 0;
    maxV = Math.max(maxV, spent, target);
    return { c, spent, target };
  });
  if (!maxV) maxV = 1;
  const scale = Math.max(maxV, base) * 1.06;
  const W = 100;
  return rows
    .map(({ c, spent, target }) => {
      const tw = (target / scale) * W;
      const sw = Math.min(W, (spent / scale) * W);
      const overW = spent > target ? Math.min(W, sw) - tw : 0;
      const over = c.target === 0 ? spent > 0 : target > 0 && spent > target;
      const ratio = target > 0 ? Math.round((spent / target) * 100) : 0;
      const sub = c.target === 0
        ? spent > 0 ? fmtShort(spent) + ' هدر رفت' : 'هیچی — عالی'
        : !base
          ? 'خرجی نیست'
          : over
            ? fmtShort(spent - target) + ' بیشتر از برنامه'
            : spent === target
              ? 'دقیقاً سر سهم'
              : c.id === 'invest' && spent < target
              ? fmtShort(target - spent) + ' تا هدف مانده'
              : fmtShort(target - spent) + ' مانده';
      return `<button type="button" class="brow ${over ? 'over' : ''}" onclick="openPocketLedger('${c.id}','${mk}')" style="--c:${c.color}">
        <div class="brow-head">
          <span class="brow-ic">${icon('cat_' + c.id)}</span>
          <span class="brow-name">${c.label}</span>
          <span class="brow-pct">${c.target ? toFa(ratio) + '٪ از سهم' : ''}</span>
        </div>
        <svg class="bullet" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true">
          <rect class="b-track" x="0" y="0" width="100" height="14" rx="7"/>
          ${tw > 0 ? `<rect class="b-target" x="${(W - tw).toFixed(2)}" y="0" width="${tw.toFixed(2)}" height="14" rx="7"/>` : ''}
          ${sw > 0 ? `<rect class="b-actual" x="${(W - sw).toFixed(2)}" y="4" width="${sw.toFixed(2)}" height="6" rx="3"/>` : ''}
          ${overW > 0 ? `<rect class="b-over" x="${(W - sw).toFixed(2)}" y="4" width="${overW.toFixed(2)}" height="6" rx="3"/>` : ''}
          ${tw > 0 ? `<rect class="b-mark" x="${(W - tw - 0.4).toFixed(2)}" y="-1" width="0.9" height="16" rx="0.4"/>` : ''}
        </svg>
        <div class="brow-sub">${sub}</div>
      </button>`;
    })
    .join('');
}

// امتیاز پایبندی به برنامه (۰-۱۰۰): فاصلهٔ توزیع واقعی از ۶۰/۲۰/۱۵/۵ + جریمهٔ هدررفت
function planScore(mk, totalSpent) {
  if (!totalSpent) return null;
  let diff = 0;
  for (const c of CATS) {
    if (c.loan) continue;
    const pct = (catSpent(mk, c.id) / totalSpent) * 100;
    diff += Math.abs(pct - c.target);
  }
  return Math.max(0, Math.round(100 - diff / 2));
}

export function renderReport() {
  const mk = repMonth;
  const budget = (state.budgets[mk] && state.budgets[mk].amount) || 0;
  const cm = computeMonths()[mk] || { carriedIn: 0, spent: 0, income: 0 };
  const totalSpent = cm.spent;
  const totalIncome = cm.income;
  const score = planScore(mk, totalSpent);
  const inst = monthInstallments(mk);
  const f = loanFlow(mk);
  const overCats = CATS.filter((c) => !c.loan && c.target > 0 && budget && catSpent(mk, c.id) > catCeiling(mk, c.id));
  const waste = catSpent(mk, 'waste');

  let verdict, cls;
  if (!totalSpent) { verdict = 'هنوز خرجی ثبت نشده'; cls = 'muted'; }
  else if (overCats.length) { verdict = overCats.map((c) => c.label).join(' و ') + ' از سهمش رد شد'; cls = 'red'; }
  else if (score >= 80) { verdict = 'طبق برنامه پیش می‌روی'; cls = 'green'; }
  else if (score >= 55) { verdict = 'کمی از برنامه فاصله داری'; cls = 'amber'; }
  else { verdict = 'توزیع خرج با برنامه نمی‌خواند'; cls = 'red'; }

  let html = `<div class="mnav">
    <button type="button" onclick="repShift(-1)" aria-label="ماه قبل">${icon('chevR')}</button>
    <div class="mttl">${monthLabel(mk)}</div>
    <button type="button" onclick="repShift(1)" aria-label="ماه بعد">${icon('chevL')}</button>
  </div>`;

  html += `<div class="hero rep-hero">
    <div style="min-width:0;flex:1">
      <div class="lbl">حال این ماه</div>
      <div class="rep-verdict ${cls}">${verdict}</div>
      <div class="rep-stats">
        <span><b class="red">${fmtShort(totalSpent)}</b> خرج</span>
        <span><b class="green">${fmtShort(totalIncome)}</b> درآمد</span>
        ${budget ? `<span><b>${fmtShort(budget)}</b> بودجه</span>` : ''}
      </div>
      ${inst ? `<div class="small muted" style="margin-top:6px">${fmtShort(inst)} از این خرج، قسط بوده.</div>` : ''}
    </div>
    ${score !== null ? ringSVG(score, cls) : ''}
  </div>`;

  html += `<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:4px">
      <h3 style="margin:0;display:flex;align-items:center">پاکت‌ها${infoTip(budget ? 'نوار کم‌رنگ سهم هر پاکت از بودجه است (۶۰/۲۰/۱۵/۵)؛ نوار پررنگ خرج واقعی. اگر از خط هدف رد شود قرمز می‌شود.' : 'بودجه ثبت نشده؛ سهم‌ها از کل خرج همین ماه حساب شده‌اند. برای سقف ریالی، بودجه را ثبت کن.')}</h3>
      <button class="btn sm ghost" onclick="openBudgetForm('${mk}')">${budget ? 'بودجه' : 'تعیین بودجه'}</button>
    </div>
    <div style="height:8px"></div>
    <div class="bullets">${bulletRows(mk, budget, totalSpent)}</div>
  </div>`;

  if (f.out || f.in) {
    html += `<div class="card" style="padding:0;overflow:hidden"><button type="button" class="entry" onclick="openPocketLedger('loan','${mk}')">
      <span class="ib" style="background:#14b8a622;color:#14b8a6">${icon('cat_loan')}</span>
      <span class="mid"><div class="t1">قرض / امانت این ماه</div>
      <div class="t2">داده: ${fmtShort(f.out)} · گرفته/برگشتی: ${fmtShort(f.in)} — خارج از خرج و درآمد</div></span>
      <span class="chev">${icon('chevL')}</span>
    </button></div>`;
  }

  document.getElementById('reportContent').innerHTML = html;
}

export function repShift(d) {
  repMonth = shiftMonth(repMonth, d);
  renderReport();
}

export function renderInvest() {
  const total = investTotal();
  const totalBuy = state.investments.reduce((s, i) => s + i.qty * i.buy * rateOf(i.currency), 0);
  const plAll = total - totalBuy;
  let html = `
  <div class="hero">
    <div style="min-width:0"><div class="lbl">${icon('trend')} ارزش کل سرمایه‌گذاری</div>
    <div class="hero-num">${fmtShort(total)}</div>
    <div class="sub ${plAll >= 0 ? 'val green' : 'val red'}">${plAll >= 0 ? 'سود' : 'زیان'} کلی: ${fmtShort(Math.abs(plAll))}</div></div>
    <span class="ib lg ${plAll >= 0 ? 'green' : 'red'}">${icon('trend')}</span>
  </div>
`;

  if (state.investments.length === 0) {
    html += `<div class="empty"><span class="ib lg muted">${icon('trend')}</span>هنوز دارایی ثبت نکرده‌ای.<br>طلا، ملک، ماشین یا هر سرمایه‌ای را با دکمهٔ + بالا اضافه کن.</div>`;
  } else {
    html += state.investments
      .map((i) => {
        const val = investValue(i);
        const pl = investProfit(i);
        const curSuffix = i.currency !== 'تومان' ? ` (${fmt(rateOf(i.currency))} ت/${i.currency})` : '';
        return `<div class="card" style="padding:14px">
        <div class="row" style="align-items:center;margin-bottom:6px;cursor:pointer" onclick="openInvestForm(findInvest('${i.id}'))">
          <div style="flex:1"><b>${esc(i.name)}</b> <span class="badge">${toFa(i.qty)} ${esc(i.unit || '')}</span></div>
          <div class="small muted">${i.currency}</div><span class="schev">${icon('chevL')}</span>
        </div>
        <div class="grid2" style="margin:10px 0">
          <div class="stat"><div class="lbl">ارزش فعلی</div><div class="val accent">${i.currency !== 'تومان' ? fmt(val) : fmtShort(val)}</div><div class="sub">${i.currency !== 'تومان' ? '≈ ' + fmtShort(val * rateOf(i.currency)) + ' تومان' : 'تومان'}</div></div>
          <div class="stat"><div class="lbl">سود / زیان</div><div class="val ${pl >= 0 ? 'green' : 'red'}">${pl >= 0 ? '+' : '−'}${i.currency !== 'تومان' ? fmt(Math.abs(pl)) : fmtShort(Math.abs(pl))}</div><div class="sub">از زمان خرید</div></div>
        </div>
        <div class="small muted" style="margin-bottom:10px">قیمت خرید هر ${esc(i.unit || 'واحد')}: ${fmt(i.buy)} · قیمت امروز: <b style="color:var(--text)">${fmt(i.cur)}</b>${curSuffix}</div>
        <button class="btn sm block" onclick="editInvestPrice('${i.id}')">${icon('refresh')} به‌روزرسانی قیمت امروز</button>
      </div>`;
      })
      .join('');
  }
  document.getElementById('investContent').innerHTML = html;
}

const openGroups = new Set();
let groupsInit = false;

export function toggleAcctGroup(key) {
  if (openGroups.has(key)) openGroups.delete(key);
  else openGroups.add(key);
  renderAccounts();
}

function acctRow(a) {
  const bal = accountCurrent(a);
  const isForeign = a.currency !== 'تومان';
  const rate = rateOf(a.currency);
  const cls = a.type === 'پول نقد' ? 'green' : a.type && a.type.includes('ارز') ? 'purple' : '';
  return `<div class="item">
    <div class="ib ${cls}" onclick="openAccountLedger('${a.id}')">${icon(accountIcon(a.type))}</div>
    <div class="mid" onclick="openAccountLedger('${a.id}')">
      <div class="t1">${esc(a.name)}${a.last4 ? ` <span class="badge">•••• ${toFa(a.last4)}</span>` : ''}</div>
      <div class="t2">${esc(a.type)}${isForeign ? ` · <span class="badge">${esc(a.currency)}</span>${rate ? ` <span class="faint">نرخ ${fmtShort(rate)}</span>` : ''}` : ''}</div>
    </div>
    <div class="amt-col">
      <div class="amt ${bal >= 0 ? 'in' : 'out'}">${isForeign ? fmt(bal) : fmtShort(bal)}</div>
      ${isForeign ? `<div class="bal">${rate ? '≈ ' + fmtShort(bal * rate) : 'بدون نرخ'}</div>` : ''}
      <button class="btn sm" style="margin-top:6px" onclick="openAccountForm(findAccount('${a.id}'))">ویرایش</button>
    </div>
  </div>`;
}

export function renderAccounts() {
  const foreign = [...new Set(state.accounts.map((a) => a.currency).filter((c) => c !== 'تومان'))];
  let html = '';

  if (state.accounts.length === 0) {
    html += `<div class="empty"><span class="ib lg muted">${icon('card')}</span>هنوز حسابی نساخته‌ای.<br>با دکمهٔ + بالای صفحه شروع کن.<br><br>کارت بانکی، پول نقد یا کیف پول ارزی اضافه کن.</div>`;
  } else {
    // گروه‌بندی بر اساس مؤسسه
    const groups = new Map();
    for (const a of state.accounts) {
      const k = institutionOf(a) || '__none';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(a);
    }
    const keys = [...groups.keys()].sort((x, y) => {
      if (x === '__none') return 1;
      if (y === '__none') return -1;
      const tx = groups.get(x).reduce((s, a) => s + accountCurrentToman(a), 0);
      const ty = groups.get(y).reduce((s, a) => s + accountCurrentToman(a), 0);
      return ty - tx;
    });
    if (!groupsInit) {
      groupsInit = true;
      // پیش‌فرض: گروه‌های تک‌حسابی باز، بقیه بسته (اگر فقط یک گروه هست، باز)
      if (keys.length === 1) openGroups.add(keys[0]);
      else for (const k of keys) if (groups.get(k).length === 1) openGroups.add(k);
    }
    const total = cashTotal();
    html += `<div class="hero">
      <div style="min-width:0"><div class="lbl">${icon('bank')} جمع همهٔ حساب‌ها</div>
      <div class="hero-num">${fmtShort(total)}</div>
      <div class="sub">${toFa(state.accounts.length)} حساب در ${toFa(keys.length)} مؤسسه</div></div>
      <span class="ib lg">${icon('card')}</span>
    </div>`;

    for (const k of keys) {
      const accts = groups.get(k);
      const label = k === '__none' ? 'بدون مؤسسه' : k;
      const sum = accts.reduce((s, a) => s + accountCurrentToman(a), 0);
      const open = openGroups.has(k);
      const curs = [...new Set(accts.map((a) => a.currency))];
      const sub =
        toFa(accts.length) +
        (accts.length === 1 ? ' حساب' : ' حساب') +
        (curs.length > 1 ? ' · ' + curs.join('، ') : curs[0] !== 'تومان' ? ' · ' + curs[0] : '');
      const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((sum / total) * 100))) : 0;
      html += `<div class="card acct-group ${open ? 'open' : ''}" style="padding:0;overflow:hidden">
        <button type="button" class="acct-group-head" onclick="toggleAcctGroup('${esc(k).replace(/'/g, '&#39;')}')">
          <span class="ib">${icon(k === '__none' ? 'folder' : institutionIconName(accts))}</span>
          <span style="flex:1;min-width:0;text-align:right">
            <span class="t1" style="font-size:14.5px;display:block">${esc(label)}</span>
            <span class="t2" style="display:block">${sub}</span>
            <span class="bar" style="margin-top:6px;height:4px"><span style="display:block;height:100%;width:${pct}%;background:var(--accent);border-radius:99px"></span></span>
          </span>
          <span style="text-align:left">
            <span class="amt ${sum >= 0 ? 'in' : 'out'}" style="display:block">${fmtShort(sum)}</span>
            <span class="small muted">${pct ? toFa(pct) + '٪ از کل' : ''}</span>
          </span>
          <span class="pocket-chev" style="margin-right:6px;display:flex">${icon(open ? 'chevD' : 'chevL')}</span>
        </button>
        ${open ? `<div class="acct-group-body">${accts.map(acctRow).join('')}
          <button class="btn sm block ghost" style="margin:0 0 2px" onclick="openAccountForm(null,'${k === '__none' ? '' : esc(k).replace(/'/g, '&#39;')}')">${icon('plus')} حساب جدید در ${k === '__none' ? 'این گروه' : esc(label)}</button>
        </div>` : ''}
      </div>`;
    }
  }

  const missingRate = foreign.filter((c) => !rateOf(c));
  if (missingRate.length) {
    html += `<div class="hint" style="color:var(--orange)">نرخ ${missingRate.map(esc).join('، ')} ثبت نشده؛ این حساب‌ها در جمع تومانی نیستند. <button type="button" class="link" style="padding:0 4px" onclick="openSettingsRates()">ثبت نرخ</button></div>`;
  }
  document.getElementById('accountsContent').innerHTML = html;
}

// اعداد بزرگ (.hero-num / .stat .val) اگر از کادر بیرون بزنند، خودکار کوچک می‌شوند
export function fitNumbers(root) {
  const els = (root || document).querySelectorAll('.hero-num, .stat .val, .kbd-display');
  els.forEach((el) => {
    el.style.fontSize = '';
    if (!el.offsetParent) return; // مخفی
    const base = parseFloat(getComputedStyle(el).fontSize) || 16;
    const min = Math.max(12, base * 0.5);
    let size = base;
    let guard = 0;
    const limit = () => Math.min(el.clientWidth, el.parentElement ? el.parentElement.clientWidth : Infinity);
    while (el.scrollWidth > limit() + 1 && size > min && guard++ < 24) {
      size -= 1;
      el.style.fontSize = size + 'px';
    }
  });
}
let fitTimer = null;
if (typeof window !== 'undefined') {
  window.addEventListener('resize', () => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => fitNumbers(), 120);
  });
}

// صفحهٔ مرور تب «دارایی»
export function renderAssetsOverview() {
  const box = document.getElementById('assetsOverview');
  if (!box) return;
  const cash = cashTotal();
  const inv = investTotal();
  const nw = cash + inv;
  const debts = (state.debts || []).filter((d) => !d.settled);
  const rec = debts.filter((d) => d.kind === 'in').reduce((s, d) => s + debtRemaining(d) * rateOf((accountById(d.accountId) || {}).currency || 'تومان'), 0);
  const pay = debts.filter((d) => d.kind === 'out').reduce((s, d) => s + debtRemaining(d) * rateOf((accountById(d.accountId) || {}).currency || 'تومان'), 0);
  const inst = totalRemaining();
  const oblig = pay + inst;
  const lateDebts = overdueCount() - overdueInstallments();
  const lateInst = overdueInstallments();
  const plans = (state.installments || []).length;
  const entry = (id, ic, cls, t1, count, t2, num, alert) =>
    `<button type="button" class="entry" onclick="setAssetTab('${id}')">
      <span class="ib ${cls}">${icon(ic)}</span>${alert ? '<span class="dot-alert"></span>' : ''}
      <span class="mid"><span class="t1">${t1}${count ? ` <span class="badge">${toFa(count)}</span>` : ''}</span>${t2 ? `<span class="t2 ${alert ? 'red' : ''}">${t2}</span>` : ''}</span>
      <span class="num">${num}</span><span class="chev">${icon('chevL')}</span>
    </button>`;
  const dayTxt = (n) => (n < 0 ? toFa(-n) + ' روز عقب افتاده' : n === 0 ? 'امروز' : toFa(n) + ' روز دیگر');
  // زیرنویس‌های معنادار به‌جای شمارش
  const foreign = state.accounts.filter((a) => a.currency && a.currency !== 'تومان').length;
  const accSub = foreign ? toFa(foreign) + ' حساب ارزی' : '';
  const totalBuy = state.investments.reduce((x, i) => x + i.qty * i.buy * rateOf(i.currency), 0);
  const pl = inv - totalBuy;
  const invSub = state.investments.length && totalBuy ? `<span class="${pl >= 0 ? 'green' : 'red'}">${pl >= 0 ? 'سود' : 'زیان'} ${fmtShort(Math.abs(pl))}</span>` : '';
  const nextDebt = debts.filter((d) => d.dueISO).sort((a, b) => a.dueISO.localeCompare(b.dueISO))[0];
  const debtSub = lateDebts > 0 ? toFa(lateDebts) + ' مورد سررسید گذشته' : nextDebt ? 'سررسید بعدی ' + dayTxt(daysUntilDue(nextDebt.dueISO)) : debts.length ? '' : 'موردی باز نیست';
  const nextRow = dueRows(3650)[0];
  const instSub = lateInst > 0 ? toFa(lateInst) + ' قسط عقب‌افتاده' : nextRow ? 'قسط بعدی ' + dayTxt(nextRow.days) + ' · ' + fmtShort(rowTotal(nextRow.row)) : plans ? '' : 'وام یا خرید قسطی نداری';
  box.innerHTML = `
    <div class="hero">
      <div style="min-width:0"><div class="lbl">${icon('wallet')} خالص دارایی</div>
      <div class="hero-num">${fmtShort(nw)}</div>
      <div class="sub">نقد ${fmtShort(cash)} · سرمایه ${fmtShort(inv)}</div></div>
      <span class="ib lg">${icon('wallet')}</span>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      ${entry('accounts', 'card', '', 'حساب‌ها', state.accounts.length, accSub, fmtShort(cash))}
      ${entry('invest', 'trend', 'green', 'سرمایه', state.investments.length, invSub, fmtShort(inv))}
      ${entry('debts', 'handshake', 'purple', 'طلب و بدهی', debts.length, debtSub, `<span style="color:var(--green)">+${fmtShort(rec)}</span> <span class="small muted">/</span> <span style="color:var(--red)">−${fmtShort(pay)}</span>`, lateDebts > 0)}
      ${entry('installments', 'calendar', 'orange', 'اقساط', plans, instSub, plans ? fmtShort(inst) : '—', lateInst > 0)}
    </div>
    ${oblig > 0 ? `<div class="card oblig">
      <div class="oblig-head"><span class="ib red">${icon('alert')}</span><span class="t1" style="flex:1">تعهدات${infoTip('جمع بدهی‌های باز و اقساط پرداخت‌نشده. در خالص دارایی بالا لحاظ نشده است.')}</span><span class="amt out">${fmtShort(oblig)}</span></div>
      <div class="oblig-rows">
        ${pay > 0 ? `<div class="oblig-row"><span>بدهی به دیگران</span><b>${fmtShort(pay)}</b></div>` : ''}
        ${inst > 0 ? `<div class="oblig-row"><span>اقساط باقی‌مانده</span><b>${fmtShort(inst)}</b></div>` : ''}
      </div>
    </div>` : ''}`;
}

export function renderAll() {
  const steps = [
    ['خانه', renderHome],
    ['تراکنش', renderTx],
    ['گزارش', renderReport],
    ['سرمایه', renderInvest],
    ['حساب‌ها', renderAccounts],
    ['طلب و بدهی', renderDebts],
    ['اقساط', renderInstallments],
    ['دارایی', renderAssetsOverview],
  ];
  for (const [name, fn] of steps) {
    try {
      fn();
    } catch (err) {
      console.error(name, err);
      if (window.__capLog) window.__capLog(name, err);
    }
  }
  fitNumbers();
  const settingsBtn = document.getElementById('btnSettings');
  if (settingsBtn) settingsBtn.classList.toggle('has-alert', overdueCount() > 0);
}

export function setTodayLabel() {
  const [y, m, d] = jalaliNow();
  const txt = toFa(d) + ' ' + MONTHS[m - 1] + ' ' + toFa(y);
  const today = document.getElementById('todayLbl');
  if (today) today.textContent = txt + ' · واحد: تومان';
}
