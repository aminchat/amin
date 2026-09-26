// «وضوح»: چند درصد خرج ماه زیرشاخه دارد. حلقهٔ کوچک در خانه، قفل‌گشایی گزارش، و جشن لحظه‌ای.
import { icon } from './icons.js';
import { esc, toFa, fmtShort, pctSign, toast, store } from './utils.js';
import { t as tr } from './i18n.js';
import { state, CATS, save } from './state.js';
import { curMonthKey, monthLabel } from './jalali.js';
import { spendItems } from './subs.js';
import { healthLights } from './health.js';
import { openModal } from './modal.js';

export const CLEAR_PCT = 80; // «ماه شفاف»
export const UNLOCK_PCT = 50; // سطح ۲ گزارش باز می‌شود

export function clarity(mk, catId) {
  mk = mk || curMonthKey();
  const items = spendItems(mk, catId).filter((it) => it.cat !== 'loan');
  let total = 0, tagged = 0, n = 0, nTagged = 0;
  const untagged = [];
  for (const it of items) {
    total += it.amount; n++;
    if (it.sub) { tagged += it.amount; nTagged++; } else untagged.push(it);
  }
  const pct = total > 0 ? Math.round((tagged / total) * 100) : 0;
  // چند قلمِ بی‌زیرشاخه (از بزرگ به کوچک) باید زده شود تا به آستانه برسیم
  const needFor = (goal) => {
    if (!total || pct >= goal) return 0;
    let t = tagged, k = 0;
    for (const it of untagged.sort((a, b) => b.amount - a.amount)) { t += it.amount; k++; if ((t / total) * 100 >= goal) break; }
    return k;
  };
  return { pct, total, tagged, n, nTagged, nUntagged: n - nTagged, needFor };
}

// ── حلقهٔ کوچک (SVG) ──
export function miniRing(pct, size, color) {
  size = size || 18;
  const r = (size - 3) / 2, c = 2 * Math.PI * r;
  return `<svg class="mring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="var(--border)" stroke-width="3" fill="none"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${color || 'var(--accent)'}" stroke-width="3" fill="none" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - Math.min(100, pct) / 100)).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}
export function clarityChip(mk) {
  const c = clarity(mk);
  if (!c.n) return null;
  const clear = c.pct >= CLEAR_PCT;
  return { cls: clear ? 'ok' : '', html: `${miniRing(c.pct, 16, clear ? 'var(--green)' : 'var(--accent)')}<span>${clear ? tr('ماه شفاف') : tr('وضوح') + ' ' + toFa(c.pct) + pctSign()}</span>`, on: `openClarity('${mk}')` };
}

// ── صفحهٔ وضوح: توضیح + هر پاکت ──
export function openClarity(mk) {
  mk = mk || curMonthKey();
  const all = clarity(mk);
  const clear = all.pct >= CLEAR_PCT;
  const rows = CATS.filter((c) => !c.loan).map((c) => ({ c, k: clarity(mk, c.id) })).filter((x) => x.k.n > 0);
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <h2>${tr('وضوح خرج‌ها')} · ${monthLabel(mk)}</h2>
    <div class="clar-hero ${clear ? 'clear' : ''}">
      ${miniRing(all.pct, 84, clear ? 'var(--green)' : 'var(--accent)')}
      <div><div class="big">${toFa(all.pct)}${pctSign()}</div><div class="small muted">${clear ? tr('ماه شفاف — گزارش کامل باز است') : tr('{n} خرج دیگر را زیرشاخه بزن تا ماه شفاف شود', { n: toFa(all.needFor(CLEAR_PCT)) })}</div></div>
    </div>
    <p class="small muted">${tr('زیرشاخه یعنی به‌جای «ضروریات» بدانی «خواربار ۴۰٪، قبض ۲۵٪…». هرچه وضوح بالاتر، گزارش و بینش‌ها دقیق‌تر و سرمایه‌ات مدیریت‌پذیرتر.')}</p>
    <div class="sgroup">${rows.map(({ c, k }) => `<button type="button" class="srow" onclick="${k.nUntagged ? `openQuickCategorize('${c.id}','${mk}')` : `openPocketLedger('${c.id}','${mk}')`}">
      <span class="sic" style="background:${c.color}">${icon('cat_' + c.id)}</span>
      <span class="smid"><span class="st1">${esc(c.label)}</span><span class="st2">${k.nUntagged ? tr('{n} خرج بدون زیرشاخه', { n: toFa(k.nUntagged) }) : tr('همه دسته‌بندی شده ✓')}</span></span>
      <span class="clar-pct">${miniRing(k.pct, 22, k.pct >= CLEAR_PCT ? 'var(--green)' : c.color)}<b>${toFa(k.pct)}${pctSign()}</b></span>
    </button>`).join('') || `<div class="empty">${tr('خرجی در این ماه نیست.')}</div>`}</div>
  `);
}

// ── قفل سطح ۲ گزارش ──
export function lockedReportHtml(mk, catId) {
  const k = clarity(mk, catId);
  if (k.n < 3 || k.pct >= UNLOCK_PCT) return '';
  const need = k.needFor(UNLOCK_PCT);
  return `<div class="rep-lock" onclick="openQuickCategorize('${catId}','${mk}')">
    <div class="stack ghost"><span style="width:38%"></span><span style="width:27%"></span><span style="width:20%"></span><span style="width:15%"></span></div>
    <div class="rl-txt">${icon('lock')}<span>${tr('{n} خرج دیگر را زیرشاخه بزن تا نمودار و بینش‌های این پاکت باز شود', { n: toFa(need) })}</span></div>
    <button type="button" class="btn sm primary">${icon('tag')} ${tr('دسته‌بندی سریع')} · ${tr('حدود {s} ثانیه', { s: toFa(need * 3) })}</button>
  </div>`;
}

// ── جشن لحظه‌ای ──
export function celebrate(msg) {
  toast(msg);
  if (matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#3d8bfd', '#22c55e', '#f59e0b', '#a78bfa', '#ef4444', '#14b8a6'];
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('i');
    p.style.cssText = `left:${50 + (Math.random() - 0.5) * 40}%;background:${colors[i % colors.length]};--dx:${(Math.random() - 0.5) * 260}px;--dy:${-120 - Math.random() * 220}px;--r:${Math.random() * 720}deg;animation-delay:${Math.random() * 120}ms`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 1400);
}

// بعد از هر رندر: عبور از آستانهٔ «ماه شفاف» یا برگشت چراغ به سبز → جشن (هر کدام یک‌بار در ماه)
let lastLights = null;
export function celebrateAfterRender() {
  if (document.body.classList.contains('locked') || document.getElementById('onboard')) return;
  const mk = curMonthKey();
  const flags = (state.cheers = state.cheers || {});
  const k = clarity(mk);
  if (k.n >= 5 && k.pct >= CLEAR_PCT && !flags['clear:' + mk]) {
    flags['clear:' + mk] = Date.now();
    save();
    celebrate('✦ ' + tr('ماه شفاف! {p}٪ خرج‌ها زیرشاخه دارند', { p: toFa(k.pct) }));
    return;
  }
  let ls = [];
  try { ls = healthLights(mk); } catch (e) { return; }
  const now = Object.fromEntries(ls.map((l) => [l.id, l.cls]));
  if (lastLights) {
    for (const id of Object.keys(now)) {
      if ((lastLights[id] === 'amber' || lastLights[id] === 'red') && now[id] === 'green' && !flags['green:' + mk + ':' + id]) {
        flags['green:' + mk + ':' + id] = Date.now();
        save();
        const l = ls.find((x) => x.id === id);
        celebrate('✓ ' + tr('{t} دوباره سبز شد', { t: l ? l.title : '' }));
        break;
      }
    }
  }
  lastLights = now;
}

if (typeof window !== 'undefined') Object.assign(window, { openClarity, celebrate });
