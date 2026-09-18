import { toFa } from './utils.js';
import { jalaliMonths, gregMonths } from './i18n.js';

// تقویم بودجه (ماه حسابداری): 'jalali' | 'gregorian' — از state می‌آید و برای هر دفتر ثابت است
let bookCal = 'jalali';
export function setBookCalendar(c) {
  bookCal = c === 'gregorian' ? 'gregorian' : 'jalali';
}
export function bookCalendar() {
  return bookCal;
}
const calendar = () => bookCal;
export function isoToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// تعداد روزهای ماهِ کلید (در هر دو تقویم)
export function daysInMonthKey(key) {
  const [y, m] = key.split('/').map(Number);
  if (bookCal === 'gregorian') return new Date(y, m, 0).getDate();
  return m <= 6 ? 31 : m <= 11 ? 30 : toGregorian(y, 12, 30) ? 30 : 29;
}
// [سال، ماه، روز] امروز در تقویم بودجه
export function bookNow() {
  const d = new Date();
  if (bookCal === 'gregorian') return [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  return toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function toJalali(gy, gm, gd) {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) -
    80 +
    gd +
    gdm[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  // trunc نه floor: وقتی days===0 (نوروزِ سال‌های خاص) باید 0 بدهد، نه −1 (پورت از PHP intval)
  jy += Math.trunc((days - 1) / 365);
  if (days > 365) days = (days - 1) % 365;
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

export function jalaliNow() {
  const d = new Date();
  return toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export const MONTHS = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
];

export function curMonthKey() {
  const [y, m] = bookNow();
  return y + '/' + String(m).padStart(2, '0');
}

export function shiftMonth(key, delta) {
  let [y, m] = key.split('/').map(Number);
  m += delta;
  while (m > 12) {
    m -= 12;
    y++;
  }
  while (m < 1) {
    m += 12;
    y--;
  }
  return y + '/' + String(m).padStart(2, '0');
}

// برچسب ماه (کلید همیشه شمسی است؛ در تقویم میلادی بازهٔ معادل نمایش داده می‌شود)
export function monthLabel(key) {
  const [y, m] = key.split('/').map(Number);
  if (bookCal === 'gregorian') return gregMonths()[m - 1] + ' ' + toFa(y);
  return jalaliMonths()[m - 1] + ' ' + toFa(y);
}

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (bookCal === 'gregorian') return toFa(d) + ' ' + gregMonths()[m - 1].slice(0, 3) + ' ' + toFa(y);
  const [jy, jm, jd] = toJalali(y, m, d);
  return toFa(jd) + ' ' + jalaliMonths()[jm - 1] + ' ' + toFa(jy);
}

export function monthOfISO(iso) {
  if (!iso) return curMonthKey();
  const [y, m, d] = iso.split('-').map(Number);
  if (bookCal === 'gregorian') return y + '/' + String(m).padStart(2, '0');
  const [jy, jm] = toJalali(y, m, d);
  return jy + '/' + String(jm).padStart(2, '0');
}
// n ماهِ تقویم بودجه بعد از یک تاریخ ISO، با حفظ روز ماه (برای اقساط)
export function addBookMonths(iso, n) {
  const [gy, gm, gd] = iso.split('-').map(Number);
  if (bookCal === 'gregorian') {
    const d = new Date(gy, gm - 1 + n, 1);
    const max = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(gd, max));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  let [jy, jm, jd] = toJalali(gy, gm, gd);
  jm += n;
  while (jm > 12) { jm -= 12; jy++; }
  while (jm < 1) { jm += 12; jy--; }
  const maxDay = jm <= 6 ? 31 : jm <= 11 ? 30 : toGregorian(jy, 12, 30) ? 30 : 29;
  const g = toGregorian(jy, jm, Math.min(jd, maxDay));
  if (!g) return iso;
  return g[0] + '-' + String(g[1]).padStart(2, '0') + '-' + String(g[2]).padStart(2, '0');
}

export function toGregorian(jy, jm, jd) {
  jy = +jy;
  jm = +jm;
  jd = +jd;
  if (!jy || !jm || !jd) return null;
  const t = new Date(jy + 621, 2, 1);
  t.setDate(t.getDate() - 50);
  for (let i = 0; i < 450; i++) {
    const y = t.getFullYear();
    const m = t.getMonth() + 1;
    const d = t.getDate();
    const j = toJalali(y, m, d);
    if (j[0] === jy && j[1] === jm && j[2] === jd) return [y, m, d];
    t.setDate(t.getDate() + 1);
  }
  return null;
}

export function parseAppDate(v) {
  if (!v) return '';
  const s = String(v)
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .trim();
  const m = s.match(/(\d{3,4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return '';
  let y = +m[1];
  let mo = +m[2];
  let d = +m[3];
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return '';
  if (y >= 1200 && y <= 1700) {
    const g = toGregorian(y, mo, d);
    if (!g) return '';
    y = g[0];
    mo = g[1];
    d = g[2];
  } else if (y < 1800) return '';
  return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
}

// ─── ورودی تاریخ: در دفتر شمسی، به‌جای تقویم میلادیِ مرورگر سه انتخابگر روز/ماه/سال شمسی ───
function pad2(n) {
  return String(n).padStart(2, '0');
}
function jMax(jy, jm) {
  return jm <= 6 ? 31 : jm <= 11 ? 30 : toGregorian(jy, 12, 30) ? 30 : 29;
}
export function enhanceDateInputs(root) {
  if (bookCal !== 'jalali' || !root || !root.querySelectorAll) return;
  for (const inp of root.querySelectorAll('input[type="date"]:not([data-jd])')) {
    inp.dataset.jd = '1';
    const wrap = document.createElement('div');
    wrap.className = 'jdate';
    const sel = (cls) => {
      const s = document.createElement('select');
      s.className = 'input ' + cls;
      return s;
    };
    const sd = sel('jd-d');
    const sm = sel('jd-m');
    const sy = sel('jd-y');
    const sub = document.createElement('div');
    sub.className = 'jd-sub small muted';
    const names = jalaliMonths();
    const [ty] = jalaliNow();
    const fill = (s, from, to, lab) => {
      s.innerHTML = '';
      for (let i = from; i <= to; i++) {
        const o = document.createElement('option');
        o.value = i;
        o.textContent = lab ? lab(i) : toFa(i);
        s.appendChild(o);
      }
    };
    fill(sm, 1, 12, (i) => names[i - 1]);
    fill(sy, ty - 30, ty + 30);
    let empty = !inp.value; // فیلد خالی (مثلاً «پرداخت نشده») خالی می‌ماند تا کاربر دست بزند
    const optEmpty = () => {
      if (!inp.required && (empty || !inp.value)) {
        for (const s of [sd, sm, sy]) {
          if (!s.querySelector('option[value=""]')) {
            const o = document.createElement('option');
            o.value = '';
            o.textContent = '—';
            s.insertBefore(o, s.firstChild);
          }
        }
      }
    };
    const fromInput = () => {
      if (!inp.value) {
        empty = true;
        optEmpty();
        sd.value = sm.value = sy.value = '';
        sub.textContent = '';
        return;
      }
      empty = false;
      const [gy, gm, gd] = inp.value.split('-').map(Number);
      const [jy, jm, jd] = toJalali(gy, gm, gd);
      if (jy < ty - 30 || jy > ty + 30) fill(sy, Math.min(jy, ty - 30), Math.max(jy, ty + 30));
      fill(sd, 1, jMax(jy, jm));
      sy.value = jy;
      sm.value = jm;
      sd.value = jd;
      sub.textContent = toFa(gd) + ' ' + gregMonths()[gm - 1] + ' ' + toFa(gy);
    };
    const toInput = () => {
      let jy = +sy.value || ty;
      let jm = +sm.value || 1;
      let jd = +sd.value || 1;
      const mx = jMax(jy, jm);
      if (jd > mx) jd = mx;
      const g = toGregorian(jy, jm, jd);
      if (!g) return;
      inp.value = g[0] + '-' + pad2(g[1]) + '-' + pad2(g[2]);
      fromInput();
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
    };
    for (const s of [sd, sm, sy]) s.addEventListener('change', toInput);
    inp.addEventListener('change', fromInput);
    inp.classList.add('jd-native');
    inp.after(wrap);
    wrap.append(sd, sm, sy);
    wrap.after(sub);
    fromInput();
    // اگر کد بعداً value را عوض کرد (بدون رویداد) هم‌گام بماند
    const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
    Object.defineProperty(inp, 'value', {
      get() {
        return desc.get.call(this);
      },
      set(v) {
        desc.set.call(this, v);
        fromInput();
      },
      configurable: true,
    });
  }
}
