// اعلان درون‌برنامه‌ای سررسیدها: به‌جای کارت/بنر ثابت در خانه، یک‌بار در هر بازشدن برنامه از بالا می‌آید و خودش می‌رود.
import { icon } from './icons.js';
import { esc, toFa, fmtShort } from './utils.js';
import { t as tr } from './i18n.js';
import { dueRows, rowTotal } from './installments.js';
import { dueSoonDebts, daysUntilDue } from './debts.js';

const KEY = 'cap_due_notice_shown';
let timer = null;

function items() {
  const out = [];
  for (const x of dueRows(3)) out.push({ kind: 'inst', days: x.days, title: x.plan.title, amount: rowTotal(x.row), id: x.plan.id });
  for (const d of dueSoonDebts(3)) out.push({ kind: 'debt', days: daysUntilDue(d.dueISO), title: d.person || '', amount: 0, id: d.id });
  return out.sort((a, b) => a.days - b.days);
}
function dayTxt(n) {
  return n < 0 ? tr('{n} روز عقب‌افتاده', { n: toFa(-n) }) : n === 0 ? tr('امروز سررسید') : tr('{n} روز دیگر', { n: toFa(n) });
}

export function hideNotice() {
  const el = document.getElementById('appNotice');
  if (!el) return;
  el.classList.remove('show');
  clearTimeout(timer);
  setTimeout(() => el.remove(), 300);
}
export function showDueNotice(force) {
  if (document.getElementById('appNotice')) return;
  const lock = document.getElementById('lockScreen');
  if (lock && lock.style.display !== 'none' && getComputedStyle(lock).display !== 'none') return;
  let shown = false;
  try { shown = sessionStorage.getItem(KEY) === '1'; } catch (e) {}
  if (shown && !force) return;
  const list = items();
  if (!list.length) return;
  try { sessionStorage.setItem(KEY, '1'); } catch (e) {}
  const late = list.filter((x) => x.days < 0).length;
  const first = list[0];
  const head = late ? tr('{n} سررسید عقب‌افتاده', { n: toFa(late) }) : list.length === 1 ? dayTxt(first.days) : tr('{n} سررسید نزدیک', { n: toFa(list.length) });
  const sub = esc(first.title) + (first.amount ? ' · ' + fmtShort(first.amount) : '') + (late && list.length === 1 ? '' : ' · ' + dayTxt(first.days)) + (list.length > 1 ? tr(' و {n} مورد دیگر', { n: toFa(list.length - 1) }) : '');
  const go = first.kind === 'inst' ? (list.length === 1 ? `openPlanDetail('${first.id}')` : "switchTab('installments')") : "switchTab('debts')";
  const el = document.createElement('div');
  el.id = 'appNotice';
  el.className = late ? 'late' : '';
  el.innerHTML = `<button type="button" class="an-main" onclick="hideNotice();${go}">
      <span class="ib ${late ? 'red' : 'orange'}">${icon('bell')}</span>
      <span class="an-mid"><b>${head}</b><small>${sub}</small></span>
    </button>
    <button type="button" class="an-x" onclick="hideNotice()" aria-label="${tr('بستن')}">${icon('x')}</button>`;
  document.body.appendChild(el);
  // سوایپ به بالا = بستن
  let y0 = null;
  el.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchmove', (e) => { if (y0 !== null && y0 - e.touches[0].clientY > 30) { y0 = null; hideNotice(); } }, { passive: true });
  requestAnimationFrame(() => el.classList.add('show'));
  timer = setTimeout(hideNotice, 8000);
}
if (typeof window !== 'undefined') Object.assign(window, { hideNotice, showDueNotice });
