// راهنمای پیش‌رونده: هر نکته فقط وقتی نشان داده می‌شود که شرطش برقرار شده باشد،
// یک‌بار، روی همان عنصر واقعی رابط (Spotlight). بدون تور اولیه، بدون پاپ‌آپ متنی.
import { icon } from './icons.js';
import { esc, store } from './utils.js';
import { t as tr } from './i18n.js';
import { state, hasLocalData } from './state.js';
import { curMonthKey } from './jalali.js';
import { healthLights } from './health.js';

const KEY = 'capital_tips';
let seen = null;
let timer = 0;
let activeTip = null;

function load() {
  if (seen) return seen;
  try { seen = JSON.parse(store.get(KEY) || '{}') || {}; } catch (e) { seen = {}; }
  return seen;
}
function mark(id) {
  load()[id] = Date.now();
  store.set(KEY, JSON.stringify(seen));
}
export function resetGuides() {
  seen = {};
  store.set(KEY, '{}');
}

const txCount = () => state.transactions.length;
const hasBudget = () => { const b = state.budgets[curMonthKey()]; return !!(b && b.amount); };

// tab: خانه/تراکنش/گزارش/ثروت — sel: هدف Spotlight — when: شرط
const TIPS = [
  { id: 'firstTx', tab: 'home', sel: '#fab', when: () => state.accounts.length > 0 && txCount() === 0,
    title: 'اولین خرج را ثبت کن', text: 'با این دکمه خرج یا درآمد امروز را در چند ثانیه وارد می‌کنی؛ پاکتش را هم همان‌جا انتخاب می‌کنی.' },
  { id: 'budget', tab: 'home', sel: '.hero-foot .btn.primary', when: () => txCount() >= 1 && !hasBudget(),
    title: 'بودجهٔ این ماه', text: 'درآمد ماه را بده تا چهار پاکت (۶۰/۲۰/۱۵/۵) ساخته شود و بدانی هر روز چقدر می‌توانی خرج کنی.' },
  { id: 'pockets', tab: 'home', sel: '.pk-scroll', when: () => hasBudget() && txCount() >= 3,
    title: 'پاکت‌ها', text: 'هر پاکت سهمی از درآمد دارد. روی هر کدام ضربه بزن تا خرج‌های همان پاکت را ببینی.' },
  { id: 'lights', tab: 'home', sel: '.lights.compact', when: () => hasBudget() && healthLights(curMonthKey()).some((l) => l.cls === 'amber' || l.cls === 'red'),
    title: 'سه‌چراغ', text: 'زرد یعنی احتیاط، قرمز یعنی توقف. ضربه بزن تا دلیل و راه‌حل هر چراغ را ببینی.' },
  { id: 'carry', tab: 'home', sel: '.hero-foot .kv:nth-child(2)', when: () => { const s = window.curStats && window.curStats(); return !!(s && s.carriedIn); },
    title: 'انتقال از ماه قبل', text: 'ماندهٔ ماه قبل به این ماه می‌آید؛ کسری و هدررفت هم به نسبت از همهٔ پاکت‌ها کم می‌شود.' },
  { id: 'txSwipe', tab: 'tx', sel: '.mnav', when: () => txCount() >= 5,
    title: 'ماه‌های قبل', text: 'با پیکان‌ها بین ماه‌ها جابه‌جا شو؛ روی هر تراکنش ضربه بزن تا ویرایش یا حذفش کنی.' },
  { id: 'bullet', tab: 'report', sel: '.bullets', when: () => hasBudget() && txCount() >= 5,
    title: 'هدف در برابر واقعی', text: 'خط باریک، هدف پاکت است و میله، خرج واقعی. روی هر ردیف ضربه بزن تا ریز خرج‌ها و زیرشاخه‌ها را ببینی.' },
  { id: 'payRow', tab: 'home', sel: '.card .btn.sm.primary[onclick^="openPayRow"]', when: () => (state.installments || []).length > 0,
    title: 'قسط با یک ضربه', text: 'وقتی قسط را پرداخت کردی همین‌جا تأیید کن؛ تراکنشش خودکار در پاکت خودش ثبت می‌شود.' },
  { id: 'assets', tab: 'assets', sel: '.asset-tabs, .seg', when: () => state.accounts.length >= 2 || state.debts.length > 0,
    title: 'ثروت', text: 'حساب‌ها، دارایی‌ها، طلب/بدهی و اقساط همه این‌جا هستند؛ با زبانه‌ها جابه‌جا شو.' },
];

// ── فراخوانی بعد از هر render ──
export function guideAfterRender(tab) {
  clearTimeout(timer);
  if (activeTip) return;
  timer = setTimeout(() => tryShow(tab), 700);
}
function blocked() {
  const ov = document.getElementById('overlay');
  return !hasLocalData(state) || document.getElementById('onboard') || document.body.classList.contains('locked') || (ov && ov.classList.contains('show'));
}
function tryShow(tab) {
  if (blocked()) return;
  const s = load();
  for (const tip of TIPS) {
    if (s[tip.id] || tip.tab !== tab) continue;
    let ok = false;
    try { ok = tip.when(); } catch (e) { ok = false; }
    if (!ok) continue;
    const el = document.querySelector(tip.sel);
    if (!el || !el.offsetParent) continue;
    show(tip, el);
    return;
  }
}

function show(tip, el) {
  activeTip = tip;
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  const g = document.createElement('div');
  g.id = 'guide';
  g.innerHTML = `<div class="g-hole"></div>
    <div class="g-bubble" role="dialog" aria-live="polite">
      <div class="g-t">${icon('sparkle') || ''}${esc(tr(tip.title))}</div>
      <div class="g-x">${esc(tr(tip.text))}</div>
      <div class="g-act"><button type="button" class="link-btn" onclick="guideDismissAll()">${tr('دیگر نشان نده')}</button><button type="button" class="btn sm primary" onclick="guideClose()">${tr('فهمیدم')}</button></div>
    </div>`;
  g.addEventListener('click', (e) => { if (e.target === g || e.target.classList.contains('g-hole')) guideClose(); });
  document.body.appendChild(g);
  const place = () => position(el, g);
  place();
  requestAnimationFrame(place);
  g._onResize = place;
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
}
function position(el, g) {
  const r = el.getBoundingClientRect();
  const pad = 6;
  const hole = g.querySelector('.g-hole');
  const b = g.querySelector('.g-bubble');
  hole.style.cssText = `top:${r.top - pad}px;left:${r.left - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px`;
  const vh = window.innerHeight;
  const below = r.bottom + 14 + b.offsetHeight < vh || r.top < vh / 2;
  b.classList.toggle('up', !below);
  if (below) { b.style.top = `${Math.min(r.bottom + 14, vh - b.offsetHeight - 12)}px`; b.style.bottom = ''; }
  else { b.style.bottom = `${vh - r.top + 14}px`; b.style.top = ''; }
}
export function guideClose() {
  const g = document.getElementById('guide');
  if (g) {
    window.removeEventListener('resize', g._onResize);
    window.removeEventListener('scroll', g._onResize, true);
    g.remove();
  }
  if (activeTip) mark(activeTip.id);
  activeTip = null;
}
export function guideDismissAll() {
  TIPS.forEach((t) => (load()[t.id] = Date.now()));
  store.set(KEY, JSON.stringify(seen));
  guideClose();
}

if (typeof window !== 'undefined') Object.assign(window, { guideClose, guideDismissAll, resetGuides });
