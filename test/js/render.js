import { esc, fmt, fmtT, fmtShort, toFa, store, infoTip, pctSign } from './utils.js';
import { lightsHtml } from './health.js';
import { t as tr } from './i18n.js';
import { icon, accountIcon, institutionIconName } from './icons.js';
import { isGoogleLinked, googleSyncOk } from './sync.js';
import { curMonthKey, fmtDate, monthLabel, shiftMonth, jalaliNow, toGregorian, MONTHS, bookNow, daysInMonthKey } from './jalali.js';
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
  institutionOf, baseCur, currencyInfo, curName } from './state.js';

export let txMonth = curMonthKey();
export let repMonth = curMonthKey();
export function resetMonths() {
  txMonth = curMonthKey();
  repMonth = curMonthKey();
}

function envelopeBars(mk) {
  return `<div class="pockets">${CATS.map((c) => {
    if (c.loan) {
      const f = loanFlow(mk);
      const has = f.out > 0 || f.in > 0;
      const netTxt = !has
        ? tr('pk.noFlow')
        : f.net === 0
          ? tr('pk.even')
          : f.net > 0
            ? '+' + fmt(f.net) + ' ' + tr('pk.received')
            : '−' + fmt(-f.net) + ' ' + tr('pk.given');
      return `<button type="button" class="pocket" onclick="openPocketLedger('${c.id}','${mk}')">
      <div class="pocket-head">
        <span class="pocket-ic" style="background:${c.color}22;color:${c.color}">${icon('cat_' + c.id)}</span>
        <span class="pocket-name">${c.label}</span>
        <span class="pocket-share" style="color:${c.color}">${netTxt}</span>
      </div>
      <div class="small muted" style="margin-top:6px">${tr('خارج از بودجه')} · ${tr('داده:')} ${fmt(f.out)} · ${tr('گرفته/برگشتی:')} ${fmt(f.in)}</div>
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
        <span class="pocket-share">${toFa(c.target)}${pctSign()}</span>
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
    <div class="pct">${toFa(Math.round(pct))}${pctSign()}</div>
  </div>`;
}

function homePockets(mk) {
  return `<div class="pk-scroll">${CATS.map((c) => {
    if (c.loan) {
      const f = loanFlow(mk);
      const has = f.out > 0 || f.in > 0;
      const txt = !has ? tr('pk.noFlow') : f.net === 0 ? tr('pk.even') : f.net > 0 ? tr('pk.received') : tr('pk.given');
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
    const sub = c.target === 0 ? (spent > 0 ? tr('pk.wish') : tr('pk.none')) : ceil > 0 ? (left >= 0 ? tr('pk.left', { amt: fmtShort(left) }) : tr('pk.over', { amt: fmtShort(-left) })) : tr('pk.noCeil');
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
  if (isGoogleLinked() && !googleSyncOk()) chips.push({ cls: 'warn', ic: 'cloud', t: tr('home.chip.googleExpired'), on: 'googleSignIn()' });
  const nw = cashTotal() + investTotal();
  chips.push({ cls: '', ic: 'wallet', t: tr('home.chip.netWorth', { amt: fmtShort(nw) }), on: "switchTab('accounts')" });
  const oblig = totalRemaining();
  if (oblig > 0) chips.push({ cls: '', ic: 'calendar', t: tr('home.chip.oblig', { amt: fmtShort(oblig) }), on: "switchTab('debts')" });
  const inv = investTotal();
  if (inv > 0) chips.push({ cls: '', ic: 'trend', t: tr('home.chip.invest', { amt: fmtShort(inv) }), on: "switchTab('invest')" });
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
    { done: hasAcct, t: tr('home.onb.acct'), d: tr('home.onb.acctSub'), on: 'openAccountForm()' },
    { done: hasBudget, t: tr('home.onb.budget'), d: tr('home.onb.budgetSub'), on: 'openBudgetForm()' },
    { done: hasTx, t: tr('home.onb.tx'), d: tr('home.onb.txSub'), on: 'openTxForm()' },
  ];
  return `<div class="card">
    <div class="card-head"><h3>${icon('sparkle')} ${tr('home.onb.title')}</h3><span class="small muted">${tr('home.onb.of', { done: toFa(steps.filter((x) => x.done).length), total: toFa(3) })}</span></div>
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
      ? tr('tx.transfer')
      : inv
        ? tr('tx.invoice')
        : t.type === 'in'
          ? (t.cat === 'loan' ? tr('cat.loan') : tr('tx.income'))
          : cat
            ? cat.label
            : tr('tx.expense');
  const unitHint = !inv && t.qty && t.unitPrice ? toFa(t.qty) + (t.unit ? ' ' + esc(tr(t.unit)) : '') + ' × ' + fmt(t.unitPrice) : '';
  const amtClass = transfer ? 'transfer' : t.type;
  const sign = t.type === 'in' || t.type === 'transferIn' ? '+' : '−';
  const balTxt = opts.bal == null ? '' : `<div class="bal">${tr('tx.balance', { amt: fmt(opts.bal) })}</div>`;
  const badges =
    (transfer ? '<span class="badge" style="color:var(--purple)">' + tr('tx.badge.transfer') + '</span>' : '') +
    (inv ? '<span class="badge" style="color:var(--orange)">' + tr('tx.items', { n: toFa((t.lines || []).length) }) + '</span>' : '') +
    (!opts.compact && t.type === 'out' && cat ? '<span class="badge" style="color:' + cat.color + '">' + cat.label + '</span>' : '') +
    (t.debtId ? '<span class="badge">' + tr('tx.badge.debt') + '</span>' : '') +
    (t.planId ? '<span class="badge">' + tr('tx.badge.plan') + '</span>' : '') +
    (t.cat === 'waste' && t.reflect ? '<span class="badge" style="color:var(--red)">' + tr('tx.badge.reflect') + '</span>' : '') +
    (a && a.currency && a.currency !== baseCur() ? '<span class="badge">' + esc(curName(a.currency)) + '</span>' : '');
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
    <div class="under"><span class="r" style="color:var(--red)">${icon('trash')} ${tr('act.delete')}</span><span class="l" style="color:var(--accent)">${tr('act.edit')} ${icon('edit')}</span></div>
    ${item}
  </div>`;
}

export function renderHome() {
  const s = curStats();
  const mk = curMonthKey();
  const hasBudget = !!(state.budgets[mk] && state.budgets[mk].amount);
  const base = s.available > 0 ? s.available : s.budget;
  const pct = base > 0 ? Math.round((s.spent / base) * 100) : 0;
  const [by, bm, bd] = bookNow();
  const daysLeft = Math.max(1, daysInMonthKey(by + '/' + String(bm).padStart(2, '0')) - bd + 1);
  const perDay = s.remaining > 0 ? Math.floor(s.remaining / daysLeft) : 0;
  let html = '';

  html += renderSyncCard();
  html += debtHomeBanner();
  html += installmentHomeCard();
  if (!store.persisted) {
    html += `<div class="banner">${icon('alert')}<span>${tr('home.preview')}</span></div>`;
  }

  // کارت قهرمان
  const ringCls = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '';
  html += `<div class="hero">
    <div style="min-width:0">
      <div class="lbl">${icon('wallet')} ${tr('home.spendable', { month: monthLabel(mk) })}</div>
      <div class="hero-num ${s.remaining < 0 ? 'val red' : ''}">${fmtShort(s.remaining)}</div>
      <div class="sub">${
        !hasBudget
          ? tr('home.noBudget')
          : s.remaining > 0
            ? tr('home.perDay', { days: toFa(daysLeft), amt: fmtShort(perDay) })
            : tr('home.overBudget')
      }</div>
    </div>
    ${ringSVG(pct, ringCls)}
    <div class="hero-foot">
      <div class="kv"><div class="k">${tr('home.budget')}</div><div class="v">${fmtShort(s.budget)}</div></div>
      <div class="kv"><div class="k">${tr('home.carried')}</div><div class="v">${fmtShort(s.carriedIn)}</div></div>
      <div class="kv"><div class="k">${tr('home.spent')}</div><div class="v val red">${fmtShort(s.spent)}</div></div>
      ${hasBudget ? `<button type="button" class="link" onclick="openBudgetForm()">${icon('edit')}</button>` : `<button type="button" class="btn sm primary" onclick="openBudgetForm()">${tr('act.setBudget')}</button>`}
    </div>
  </div>`;

  html += homeStatusChips();
  if (hasBudget || s.spent) html += lightsHtml(mk, true);
  html += onboardingCard(mk);

  html += `<div class="card" style="padding-bottom:var(--sp-2)">
    <div class="card-head"><h3>${icon('target')} ${tr('home.pockets')}</h3><button type="button" class="link" onclick="switchTab('report')">${tr('act.details')}</button></div>
    ${homePockets(mk)}
  </div>`;

  // آخرین تراکنش‌ها
  const recent = sortTxs(state.transactions.slice()).slice(0, 3);
  if (recent.length) {
    html += `<div class="card">
      <div class="card-head"><h3>${icon('list')} ${tr('home.recent')}</h3><button type="button" class="link" onclick="switchTab('tx')">${tr('act.all')}</button></div>
      <div class="tx-list">${recent.map((t) => txRow(t, { noSwipe: true, compact: true })).join('')}</div>
    </div>`;
  }

  document.getElementById('homeContent').innerHTML = html;
}

export function renderTx() {
  const txs = sortTxs(state.transactions.filter((t) => t.month === txMonth));
  const after = runningBalanceByTxId();
  let html = `<div class="mnav">
    <button type="button" onclick="txShift(-1)" aria-label="${tr('act.prevMonth')}">${icon('chevR')}</button>
    <div class="mttl">${monthLabel(txMonth)}<div class="small muted">${txMonth === curMonthKey() ? tr('tx.curMonth') : ''}</div></div>
    <button type="button" onclick="txShift(1)" aria-label="${tr('act.nextMonth')}">${icon('chevL')}</button>
  </div>`;

  if (txs.length === 0) {
    html += `<div class="empty"><span class="ib lg muted">${icon('list')}</span>${tr('tx.empty')}</div>`;
  } else {
    const sumOut = txs.filter((t) => t.type === 'out' && !isTransfer(t) && t.cat !== 'loan').reduce((x, t) => x + (t.amount || 0), 0);
    const sumIn = txs.filter((t) => t.type === 'in' && !isTransfer(t) && t.cat !== 'loan').reduce((x, t) => x + (t.amount || 0), 0);
    html += `<div class="grid2" style="margin-bottom:var(--sp-3)">
      <div class="stat"><div class="lbl">${tr('tx.spentMonth')}</div><div class="val red">${fmtShort(sumOut)}</div></div>
      <div class="stat"><div class="lbl">${tr('tx.incomeMonth')}</div><div class="val green">${fmtShort(sumIn)}</div></div>
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
    html += `<div class="small muted" style="text-align:center;padding:var(--sp-3)">${tr('tx.swipeHelp')}</div>`;
  }
  html += `<button type="button" class="btn block" style="margin:var(--sp-2) 0" onclick="openPaperScan()">${icon('scan')} ${tr('act.scanPaper')}</button>`;
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
    w.addEventListener('pointercancel', () => { clearTimeout(lp); active = false; reset(); });
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
        ? spent > 0 ? tr('rep.wasted', { amt: fmtShort(spent) }) : tr('pk.none')
        : !base
          ? tr('rep.noSpendRow')
          : over
            ? tr('rep.overPlan', { amt: fmtShort(spent - target) })
            : spent === target
              ? tr('rep.exact')
              : c.id === 'invest' && spent < target
              ? tr('rep.toGoal', { amt: fmtShort(target - spent) })
              : tr('rep.left', { amt: fmtShort(target - spent) });
      return `<button type="button" class="brow ${over ? 'over' : ''}" onclick="openCatReport('${c.id}','${mk}')" style="--c:${c.color}">
        <div class="brow-head">
          <span class="brow-ic">${icon('cat_' + c.id)}</span>
          <span class="brow-name">${c.label}</span>
          <span class="brow-pct">${c.target ? tr('rep.ofShare', { pct: toFa(ratio) }) : ''}</span>
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
  if (!totalSpent) { verdict = tr('rep.noSpend'); cls = 'muted'; }
  else if (overCats.length) { verdict = tr('rep.overCat', { cats: overCats.map((c) => c.label).join(tr('rep.and')) }); cls = 'red'; }
  else if (waste > 0 && waste >= totalSpent * 0.05) { verdict = tr('rep.wasteHigh', { amt: fmtShort(waste) }); cls = 'red'; }
  else if (score >= 80) { verdict = tr('rep.onTrack'); cls = 'green'; }
  else if (score >= 55) { verdict = tr('rep.drift'); cls = 'amber'; }
  else { verdict = tr('rep.offPlan'); cls = 'red'; }

  let html = `<div class="mnav">
    <button type="button" onclick="repShift(-1)" aria-label="${tr('act.prevMonth')}">${icon('chevR')}</button>
    <div class="mttl">${monthLabel(mk)}</div>
    <button type="button" onclick="repShift(1)" aria-label="${tr('act.nextMonth')}">${icon('chevL')}</button>
  </div>`;

  html += `<div class="hero rep-hero">
    <div style="min-width:0;flex:1">
      <div class="lbl">${tr('rep.mood')}</div>
      <div class="rep-verdict ${cls}">${verdict}</div>
      <div class="rep-stats">
        <span><b class="red">${fmtShort(totalSpent)}</b> ${tr('rep.spent')}</span>
        <span><b class="green">${fmtShort(totalIncome)}</b> ${tr('rep.income')}</span>
        ${budget ? `<span><b>${fmtShort(budget)}</b> ${tr('rep.budget')}</span>` : ''}
      </div>
      ${inst ? `<div class="small muted" style="margin-top:6px">${tr('rep.instOf', { amt: fmtShort(inst) })}</div>` : ''}
    </div>
    ${score !== null ? ringSVG(score, cls) : ''}
  </div>`;

  html += lightsHtml(mk);

  html += `<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:4px">
      <h3 style="margin:0;display:flex;align-items:center">${tr('rep.pockets')}${infoTip(budget ? tr('rep.tipBudget') : tr('rep.tipNoBudget'))}</h3>
      <button class="btn sm ghost" onclick="openBudgetForm('${mk}')">${budget ? tr('act.budget') : tr('act.setBudget')}</button>
    </div>
    <div style="height:8px"></div>
    <div class="bullets">${bulletRows(mk, budget, totalSpent)}</div>
  </div>`;

  if (f.out || f.in) {
    html += `<div class="card" style="padding:0;overflow:hidden"><button type="button" class="entry" onclick="openPocketLedger('loan','${mk}')">
      <span class="ib" style="background:#14b8a622;color:#14b8a6">${icon('cat_loan')}</span>
      <span class="mid"><div class="t1">${tr('rep.loanTitle')}</div>
      <div class="t2">${tr('rep.loanSub', { out: fmtShort(f.out), in: fmtShort(f.in) })}</div></span>
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
    <div style="min-width:0"><div class="lbl">${icon('trend')} ${tr('inv.total')}</div>
    <div class="hero-num">${fmtShort(total)}</div>
    <div class="sub ${plAll >= 0 ? 'val green' : 'val red'}">${plAll >= 0 ? tr('inv.profit') : tr('inv.loss')} ${tr('inv.overall')}: ${fmtShort(Math.abs(plAll))}</div></div>
    <span class="ib lg ${plAll >= 0 ? 'green' : 'red'}">${icon('trend')}</span>
  </div>
`;

  if (state.investments.length === 0) {
    html += `<div class="empty"><span class="ib lg muted">${icon('trend')}</span>${tr('inv.empty')}</div>`;
  } else {
    html += state.investments
      .map((i) => {
        const val = investValue(i);
        const pl = investProfit(i);
        const curSuffix = i.currency !== baseCur() ? ` (${fmtShort(rateOf(i.currency))} ${curName(baseCur())}/${curName(i.currency)})` : '';
        return `<div class="card" style="padding:14px">
        <div class="row" style="align-items:center;margin-bottom:6px;cursor:pointer" onclick="openInvestForm(findInvest('${i.id}'))">
          <div style="flex:1"><b>${esc(i.name)}</b> <span class="badge">${toFa(i.qty)} ${esc(i.unit || '')}</span></div>
          <div class="small muted">${curName(i.currency)}</div><span class="schev">${icon('chevL')}</span>
        </div>
        <div class="grid2" style="margin:10px 0">
          <div class="stat"><div class="lbl">${tr('inv.value')}</div><div class="val accent">${i.currency !== baseCur() ? fmt(val) + ' ' + esc(currencyInfo(i.currency).symbol) : fmtShort(val)}</div><div class="sub">${i.currency !== baseCur() ? '≈ ' + fmtShort(val * rateOf(i.currency)) + ' ' + baseCur() : ''}</div></div>
          <div class="stat"><div class="lbl">${tr('inv.pl')}</div><div class="val ${pl >= 0 ? 'green' : 'red'}">${pl >= 0 ? '+' : '−'}${i.currency !== baseCur() ? fmt(Math.abs(pl)) : fmtShort(Math.abs(pl))}</div><div class="sub">${tr('inv.sinceBuy')}</div></div>
        </div>
        <div class="small muted" style="margin-bottom:10px">${tr('inv.buyPrice', { unit: esc(i.unit || tr('inv.unit')), buy: fmt(i.buy), cur: fmt(i.cur), suffix: curSuffix })}</div>
        <button class="btn sm block" onclick="editInvestPrice('${i.id}')">${icon('refresh')} ${tr('act.updatePrice')}</button>
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
  const isForeign = a.currency !== baseCur();
  const rate = rateOf(a.currency);
  const cls = a.type === 'پول نقد' ? 'green' : a.type && a.type.includes('ارز') ? 'purple' : '';
  return `<div class="item">
    <div class="ib ${cls}" onclick="openAccountLedger('${a.id}')">${icon(accountIcon(a.type))}</div>
    <div class="mid" onclick="openAccountLedger('${a.id}')">
      <div class="t1">${esc(a.name)}${a.last4 ? ` <span class="badge">•••• ${toFa(a.last4)}</span>` : ''}</div>
      <div class="t2">${esc(tr(a.type))}${isForeign ? ` · <span class="badge">${esc(curName(a.currency))}</span>${rate ? ` <span class="faint">${tr('acc.rate', { r: fmtShort(rate) })}</span>` : ''}` : ''}</div>
    </div>
    <div class="amt-col">
      <div class="amt ${bal >= 0 ? 'in' : 'out'}">${isForeign ? fmt(bal) : fmtShort(bal)}</div>
      ${isForeign ? `<div class="bal">${rate ? '≈ ' + fmtShort(bal * rate) : tr('acc.noRate')}</div>` : ''}
      <button class="btn sm" style="margin-top:6px" onclick="openAccountForm(findAccount('${a.id}'))">${tr('act.edit')}</button>
    </div>
  </div>`;
}

export function renderAccounts() {
  const foreign = [...new Set(state.accounts.map((a) => a.currency).filter((c) => c !== baseCur()))];
  let html = '';

  if (state.accounts.length === 0) {
    html += `<div class="empty"><span class="ib lg muted">${icon('card')}</span>${tr('acc.empty')}</div>`;
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
      <div style="min-width:0"><div class="lbl">${icon('bank')} ${tr('acc.total')}</div>
      <div class="hero-num">${fmtShort(total)}</div>
      <div class="sub">${tr('acc.summary', { n: toFa(state.accounts.length), g: toFa(keys.length) })}</div></div>
      <span class="ib lg">${icon('card')}</span>
    </div>`;

    for (const k of keys) {
      const accts = groups.get(k);
      const label = k === '__none' ? tr('acc.noInst') : k;
      const sum = accts.reduce((s, a) => s + accountCurrentToman(a), 0);
      const open = openGroups.has(k);
      const curs = [...new Set(accts.map((a) => a.currency))];
      const sub =
        tr('acc.n', { n: toFa(accts.length) }) +
        (curs.length > 1 ? ' · ' + curs.join('، ') : curs[0] !== baseCur() ? ' · ' + curs[0] : '');
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
            <span class="small muted">${pct ? tr('acc.ofTotal', { pct: toFa(pct) }) : ''}</span>
          </span>
          <span class="pocket-chev" style="margin-right:6px;display:flex">${icon(open ? 'chevD' : 'chevL')}</span>
        </button>
        ${open ? `<div class="acct-group-body">${accts.map(acctRow).join('')}
          <button class="btn sm block ghost" style="margin:0 0 2px" onclick="openAccountForm(null,'${k === '__none' ? '' : esc(k).replace(/'/g, '&#39;')}')">${icon('plus')} ${tr('acc.newIn', { name: k === '__none' ? tr('acc.thisGroup') : esc(label) })}</button>
        </div>` : ''}
      </div>`;
    }
  }

  const missingRate = foreign.filter((c) => !rateOf(c));
  if (missingRate.length) {
    html += `<div class="hint" style="color:var(--orange)">${tr('acc.missingRate', { curs: missingRate.map(esc).join('، ') })} <button type="button" class="link" style="padding:0 4px" onclick="openSettingsRates()">${tr('act.setRate')}</button></div>`;
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
  const rec = debts.filter((d) => d.kind === 'in').reduce((s, d) => s + debtRemaining(d) * rateOf((accountById(d.accountId) || {}).currency || baseCur()), 0);
  const pay = debts.filter((d) => d.kind === 'out').reduce((s, d) => s + debtRemaining(d) * rateOf((accountById(d.accountId) || {}).currency || baseCur()), 0);
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
  const dayTxt = (n) => (n < 0 ? tr('time.daysLate', { n: toFa(-n) }) : n === 0 ? tr('time.today') : tr('time.inDays', { n: toFa(n) }));
  // زیرنویس‌های معنادار به‌جای شمارش
  const foreign = state.accounts.filter((a) => a.currency && a.currency !== baseCur()).length;
  const accSub = foreign ? tr('as.foreign', { n: toFa(foreign) }) : '';
  const totalBuy = state.investments.reduce((x, i) => x + i.qty * i.buy * rateOf(i.currency), 0);
  const pl = inv - totalBuy;
  const invSub = state.investments.length && totalBuy ? `<span class="${pl >= 0 ? 'green' : 'red'}">${pl >= 0 ? tr('inv.profit') : tr('inv.loss')} ${fmtShort(Math.abs(pl))}</span>` : '';
  const nextDebt = debts.filter((d) => d.dueISO).sort((a, b) => a.dueISO.localeCompare(b.dueISO))[0];
  const debtSub = lateDebts > 0 ? tr('as.overdueDebts', { n: toFa(lateDebts) }) : nextDebt ? tr('as.dueNext', { when: dayTxt(daysUntilDue(nextDebt.dueISO)) }) : debts.length ? '' : tr('as.noOpen');
  const nextRow = dueRows(3650)[0];
  const instSub = lateInst > 0 ? tr('as.overdueInst', { n: toFa(lateInst) }) : nextRow ? tr('as.nextInst', { when: dayTxt(nextRow.days), amt: fmtShort(rowTotal(nextRow.row)) }) : plans ? '' : tr('as.noPlans');
  box.innerHTML = `
    <div class="hero">
      <div style="min-width:0"><div class="lbl">${icon('wallet')} ${tr('as.netWorth')}</div>
      <div class="hero-num">${fmtShort(nw)}</div>
      <div class="sub">${tr('as.cashInv', { cash: fmtShort(cash), inv: fmtShort(inv) })}</div></div>
      <span class="ib lg">${icon('wallet')}</span>
    </div>
    <div class="card" style="padding:0;overflow:hidden">
      ${entry('accounts', 'card', '', tr('nav.accounts'), state.accounts.length, accSub, fmtShort(cash))}
      ${entry('invest', 'trend', 'green', tr('nav.invest'), state.investments.length, invSub, fmtShort(inv))}
      ${entry('debts', 'handshake', 'purple', tr('nav.debts'), debts.length, debtSub, `<span style="color:var(--green)">+${fmtShort(rec)}</span> <span class="small muted">/</span> <span style="color:var(--red)">−${fmtShort(pay)}</span>`, lateDebts > 0)}
      ${entry('installments', 'calendar', 'orange', tr('nav.installments'), plans, instSub, plans ? fmtShort(inst) : '—', lateInst > 0)}
    </div>
    ${oblig > 0 ? `<div class="card oblig">
      <div class="oblig-head"><span class="ib red">${icon('alert')}</span><span class="t1" style="flex:1">${tr('as.oblig')}${infoTip(tr('as.obligTip'))}</span><span class="amt out">${fmtShort(oblig)}</span></div>
      <div class="oblig-rows">
        ${pay > 0 ? `<div class="oblig-row"><span>${tr('as.debtOthers')}</span><b>${fmtShort(pay)}</b></div>` : ''}
        ${inst > 0 ? `<div class="oblig-row"><span>${tr('as.instLeft')}</span><b>${fmtShort(inst)}</b></div>` : ''}
      </div>
    </div>` : ''}`;
}

export function renderAll() {
  const steps = [
    [tr('خانه'), renderHome],
    [tr('تراکنش'), renderTx],
    [tr('گزارش'), renderReport],
    [tr('سرمایه‌گذاری'), renderInvest],
    [tr('حساب‌ها'), renderAccounts],
    [tr('طلب و بدهی'), renderDebts],
    [tr('اقساط'), renderInstallments],
    [tr('سرمایه'), renderAssetsOverview],
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
  const d0 = new Date();
  const iso = d0.getFullYear() + '-' + String(d0.getMonth() + 1).padStart(2, '0') + '-' + String(d0.getDate()).padStart(2, '0');
  const txt = fmtDate(iso);
  const today = document.getElementById('todayLbl');
  if (today) today.textContent = txt + ' · ' + tr('unit') + ': ' + curName(baseCur());
}
