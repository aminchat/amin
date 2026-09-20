// ─── سه چراغ سلامت مالی: «دخل و خرج» · «مدیریت ثروت» · «زندگی» ───────────────
// هر چراغ از چند نشانهٔ هم‌زمان نتیجه می‌شود، نه از یک عدد؛ و هر نشانه یک علت و یک پیام دارد.
import { state, CATS, catById, catSpent, catCeiling, catShare, incomeIn, spentIn, computeMonths, loanFlow, budgetOf, isTransfer, isInvoice, isLoanTx, txAmountToman } from './state.js';
import { curMonthKey, shiftMonth, monthLabel, daysInMonthKey } from './jalali.js';
import { t as tr } from './i18n.js';
import { fmtShort, toFa, esc, pctSign } from './utils.js';
import { icon } from './icons.js';
import { subTotals, subLabel } from './subs.js';

// ── تنظیمات (x, y, z و آستانه‌ها) ──
export const HEALTH_DEFAULTS = { investMonths: 2, funMonths: 3, charityMonths: 3, overPct: 5, wastePct: 5, incomeMode: 'auto' };
export function healthPrefs() {
  return Object.assign({}, HEALTH_DEFAULTS, state.health || {});
}
export function setHealthPref(k, v) {
  if (!state.health) state.health = {};
  state.health[k] = v;
  state.health.updatedAt = Date.now();
}

// ── مبنای «دخل»: بودجه یا درآمد؟ ──
// درآمد نامنظم (پیمانکار، پروژه‌ای): درآمد یک ماه معنی ندارد؛ میانگین ۳ ماه اخیر مبنا می‌شود.
// اگر ماهی بدون بودجه باشد، درآمدِ مبنا جای بودجه می‌نشیند.
export function incomeBase(mk) {
  const p = healthPrefs();
  const inc = incomeIn(mk);
  if (p.incomeMode === 'month') return { amount: inc, mode: 'month' };
  const last = [0, 1, 2].map((i) => incomeIn(shiftMonth(mk, -i)));
  const nz = last.filter((v) => v > 0);
  // «سابقه» = ماه‌هایی که اصلاً استفاده شده‌اند (بودجه یا خرج داشته‌اند)؛ ماه‌های قبل از نصب، «درآمد صفر» نیستند
  const usedMonths = [0, 1, 2].filter((i) => { const k = shiftMonth(mk, -i); return budgetOf(k) || spentIn(k) || incomeIn(k); }).length;
  // میانگین ۳ ماه شامل ماه‌های صفر (پیمانکار: ۳۰ میلیون در یک ماه = ۱۰ میلیون در ماه) — فقط با ۳ ماه سابقه
  const avg3 = nz.length && usedMonths >= 3 ? last.reduce((a, b) => a + b, 0) / 3 : inc;
  if (p.incomeMode === 'avg3') return { amount: avg3, mode: usedMonths >= 3 ? 'avg3' : 'month', short: usedMonths < 3 };
  if (usedMonths < 3) return { amount: inc, mode: 'month', short: true };
  // خودکار: ماه جاری بی‌درآمد ولی ماه‌های قبل درآمد داشته، یا نوسان ماه‌ها زیاد → میانگین
  const max = Math.max(...last, 0);
  const min = Math.min(...last);
  const irregular = nz.length >= 1 && (inc === 0 || (max && (max - min) / max > 0.4));
  return irregular ? { amount: avg3, mode: 'avg3' } : { amount: inc, mode: 'month' };
}

// ── تشخیص یک ماه ──
export function monthSignals(mk) {
  const p = healthPrefs();
  const budget = budgetOf(mk);
  const base = incomeBase(mk);
  const spent = spentIn(mk);
  const cats = CATS.filter((c) => !c.loan && c.target > 0);
  const over = [];
  for (const c of cats) {
    const ceil = catCeiling(mk, c.id);
    if (!ceil) continue;
    const s = catSpent(mk, c.id);
    const pct = ((s - ceil) / ceil) * 100;
    if (pct > p.overPct) over.push({ cat: c, spent: s, ceil, pct: Math.round(pct), amount: s - ceil });
  }
  const waste = catSpent(mk, 'waste');
  const wastePct = spent ? (waste / spent) * 100 : 0;
  // هدررفت به نسبت سهم از همهٔ پاکت‌ها کم شده؛ تفکیکش:
  const shareSum = cats.reduce((a, c) => a + c.target, 0) || 1;
  const wasteFrom = cats.map((c) => ({ cat: c, amount: Math.round((waste * c.target) / shareSum) }));
  const f = loanFlow(mk);
  const deficit = budget ? spent - budget : 0;
  const overIncome = base.amount ? spent - base.amount : 0;
  return { mk, budget, base, spent, over, waste, wastePct, wasteFrom, loanIn: f.in, deficit, overIncome, hasData: spent > 0 };
}

// چند ماه پشت هم یک پاکت خالی مانده (تا ماه mk، شامل خودش)
export function idleMonths(catId, mk, limit) {
  let n = 0;
  let k = mk;
  for (let i = 0; i < (limit || 12); i++) {
    if (!budgetOf(k) && !spentIn(k)) break; // ماهی که اصلاً استفاده نشده، شمرده نمی‌شود
    if (catSpent(k, catId) > 0) break;
    n++;
    k = shiftMonth(k, -1);
  }
  return n;
}

// ── سه چراغ ──
// خروجی: [{id, cls:'green'|'amber'|'red'|'muted', title, line, why:[...], action}]
export function healthLights(mk) {
  mk = mk || curMonthKey();
  const p = healthPrefs();
  const cur = monthSignals(mk);
  const prev1 = monthSignals(shiftMonth(mk, -1));
  const prev2 = monthSignals(shiftMonth(mk, -2));
  const months = [cur, prev1, prev2].filter((m) => m.hasData);
  const lights = [];

  // ۱) دخل و خرج
  {
    const why = [];
    let cls = 'green';
    const overNow = cur.over;
    const overCount = months.filter((m) => m.over.length).length;
    if (cur.loanIn > 0 && cur.deficit > 0) { cls = 'red'; why.push({ t: tr('hl.loanToLive', { amt: fmtShort(cur.loanIn) }) }); }
    if (cur.base.amount && cur.overIncome > 0) { cls = 'red'; why.push({ t: tr(cur.base.mode === 'avg3' ? 'hl.overIncomeAvg' : 'hl.overIncome', { amt: fmtShort(cur.overIncome) }) }); }
    if (overNow.length) {
      const persistent = overCount >= 2;
      if (persistent) cls = 'red';
      else if (cls !== 'red') cls = 'amber';
      for (const o of overNow) {
        const subs = subTotals(mk, o.cat.id).rows.filter((r) => r.sub).slice(0, 2).map((r) => subLabel(r.sub) + ' ' + fmtShort(r.amount));
        why.push({ t: tr('hl.overShare', { c: o.cat.label, p: toFa(o.pct), amt: fmtShort(o.amount) }) + (subs.length ? ' · ' + subs.join(tr('، ')) : ''), on: `openCatReport('${o.cat.id}','${mk}')` });
      }
      why.push({ t: persistent ? tr('hl.persistent', { n: toFa(overCount) }) : tr('hl.oneOff') });
    }
    if (cur.budget && cur.base.amount && cur.budget > cur.base.amount * 1.05) {
      if (cls === 'green') cls = 'amber';
      why.push({ t: tr(cur.base.mode === 'avg3' ? 'hl.budgetOverIncomeAvg' : 'hl.budgetOverIncome', { b: fmtShort(cur.budget), i: fmtShort(cur.base.amount) }), on: `openBudgetForm('${mk}')` });
    }
    if (cur.base.short && cur.hasData) why.push({ t: tr('hl.shortHistory') });
    if (!cur.hasData) cls = 'muted';
    const line = cls === 'green' ? tr('hl.io.ok') : cls === 'amber' ? tr('hl.io.watch') : cls === 'red' ? tr('hl.io.bad') : tr('hl.noData');
    lights.push({ id: 'io', cls, title: tr('hl.io'), line, why, fix: cls === 'red' ? ioFix(cur, mk) : null });
  }

  // ۲) مدیریت ثروت (هدررفت / خرید خارج از برنامه)
  {
    const why = [];
    let cls = 'green';
    if (cur.waste > 0) {
      const wasteMonths = months.filter((m) => m.wastePct >= p.wastePct).length;
      cls = cur.wastePct >= p.wastePct ? (wasteMonths >= 2 ? 'red' : 'amber') : 'green';
      const from = cur.wasteFrom.filter((w) => w.amount > 0).map((w) => w.cat.label + ' ' + fmtShort(w.amount)).join(tr('، '));
      why.push({ t: tr('hl.wasteAmt', { amt: fmtShort(cur.waste), p: toFa(Math.round(cur.wastePct)) }), on: `openCatReport('waste','${mk}')` });
      if (from) why.push({ t: tr('hl.wasteFrom', { list: from }) });
      const reasons = subTotals(mk, 'waste').rows.filter((r) => r.sub).slice(0, 3).map((r) => subLabel(r.sub) + ' ' + fmtShort(r.amount));
      if (reasons.length) why.push({ t: tr('hl.wasteWhy', { list: reasons.join(tr('، ')) }) });
      if (wasteMonths >= 2) why.push({ t: tr('hl.wasteRepeat', { n: toFa(wasteMonths) }) });
    }
    if (!cur.hasData) cls = 'muted';
    const line = cls === 'green' ? tr('hl.w.ok') : cls === 'amber' ? tr('hl.w.watch') : cls === 'red' ? tr('hl.w.bad') : tr('hl.noData');
    lights.push({ id: 'wealth', cls, title: tr('hl.w'), line, why });
  }

  // ۳) زندگی و آینده (تفریح y، آزادی مالی x، نیکوکاری z)
  {
    const why = [];
    let cls = 'green';
    const checks = [
      { id: 'fun', n: p.funMonths, key: 'hl.funIdle' },
      { id: 'invest', n: p.investMonths, key: 'hl.investIdle' },
      { id: 'charity', n: p.charityMonths, key: 'hl.charityIdle' },
    ];
    for (const ch of checks) {
      const idle = idleMonths(ch.id, mk);
      if (idle >= ch.n) {
        const c = catById(ch.id);
        const left = Math.max(0, catCeiling(mk, ch.id) - catSpent(mk, ch.id));
        if (ch.id === 'invest' || ch.id === 'fun') cls = cls === 'red' ? 'red' : idle >= ch.n + 1 ? 'red' : 'amber';
        else if (cls === 'green') cls = 'amber';
        why.push({ t: tr(ch.key, { n: toFa(idle), amt: fmtShort(left) }), on: `openPocketLedger('${ch.id}','${mk}')` });
      }
    }
    if (!cur.hasData && !months.length) cls = 'muted';
    const line = cls === 'green' ? tr('hl.l.ok') : cls === 'amber' ? tr('hl.l.watch') : cls === 'red' ? tr('hl.l.bad') : tr('hl.noData');
    lights.push({ id: 'life', cls, title: tr('hl.l'), line, why });
  }
  return lights;
}

// جهت‌گیری وقتی دخل/خرج قرمز است: سمت خرج (زیرشاخه‌های قابل‌مدیریت) یا سمت دخل
function ioFix(cur, mk) {
  const FIXED = new Set(['housing', 'bills', 'insurance', 'education', 'kids']);
  const need = subTotals(mk, 'need');
  const fixed = need.rows.filter((r) => FIXED.has(r.sub)).reduce((a, r) => a + r.amount, 0);
  const flexible = need.total - fixed;
  const needShare = cur.spent ? need.total / cur.spent : 0;
  const gap = Math.max(cur.deficit, cur.overIncome, ...cur.over.map((o) => o.amount), 0);
  const candidates = [];
  for (const c of CATS.filter((x) => !x.loan && x.target > 0)) {
    for (const r of subTotals(mk, c.id).rows) {
      if (!r.sub || FIXED.has(r.sub)) continue;
      candidates.push({ cat: c, sub: r.sub, amount: r.amount });
    }
  }
  candidates.sort((a, b) => b.amount - a.amount);
  const earn = needShare >= 0.7 && fixed >= flexible;
  return { gap, earn, perDay: Math.round(gap / (daysInMonthKey(mk) || 30)), fixed, flexible, candidates: candidates.slice(0, 5) };
}

// ── HTML: سه چراغ (فشرده برای خانه، کامل برای گزارش) ──
export function lightsHtml(mk, compact) {
  const ls = healthLights(mk);
  if (compact) {
    return `<div class="lights compact" onclick="openHealth('${mk}')">${ls.map((l) => `<span class="light ${l.cls}"><i></i>${esc(l.title)}</span>`).join('')}${icon('chevL')}</div>`;
  }
  return `<div class="lights">${ls
    .map((l) => `<button type="button" class="light-card ${l.cls}" onclick="openHealth('${mk}','${l.id}')"><span class="dot"></span><span class="lt">${esc(l.title)}</span><span class="ll">${esc(l.line)}</span></button>`)
    .join('')}</div>`;
}
export function healthDetailHtml(mk, focus) {
  const ls = healthLights(mk);
  return ls
    .map((l) => {
      const fx = l.fix;
      return `<div class="hcard ${l.cls} ${focus === l.id ? 'focus' : ''}" id="hl_${l.id}">
      <div class="hhead"><span class="dot"></span><b>${esc(l.title)}</b><span class="hline">${esc(l.line)}</span></div>
      ${l.why.length ? `<div class="hwhy">${l.why.map((w) => `<div class="hw" ${w.on ? `onclick="closeModal();${w.on}"` : ''}>${icon(w.on ? 'chevL' : 'info')}<span>${w.t}</span></div>`).join('')}</div>` : ''}
      ${fx ? fixHtml(fx, mk) : ''}
    </div>`;
    })
    .join('');
}
function fixHtml(fx, mk) {
  if (!fx.gap) return '';
  const cut = fx.candidates.length
    ? `<div class="hfix"><div class="hft">${icon('scissors')} ${tr('hl.fix.cut')}</div>${fx.candidates
        .map((c) => `<div class="hw" onclick="closeModal();openSubReport('${c.cat.id}','${c.sub}','${mk}')">${icon('chevL')}<span>${esc(subLabel(c.sub))} <small class="muted">· ${esc(c.cat.label)}</small></span><b>${fmtShort(c.amount)}</b></div>`)
        .join('')}</div>`
    : '';
  const earn = `<div class="hfix"><div class="hft">${icon('trend')} ${tr('hl.fix.earn')}</div>
    <div class="hw"><span>${tr('hl.fix.earnLine', { amt: fmtShort(fx.gap), day: fmtShort(fx.perDay) })}</span></div>
    <div class="hw muted"><span>${tr('hl.fix.earnWays')}</span></div></div>`;
  const head = `<div class="hgap">${tr('hl.fix.gap', { amt: fmtShort(fx.gap) })}${fx.earn ? ' — ' + tr('hl.fix.mostlyFixed', { f: fmtShort(fx.fixed) }) : ''}</div>`;
  return head + (fx.earn ? earn + cut : cut + earn);
}
