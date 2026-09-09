import { toFa } from './utils.js';

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
  jy += Math.floor((days - 1) / 365);
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
  const [y, m] = jalaliNow();
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

export function monthLabel(key) {
  const [y, m] = key.split('/');
  return MONTHS[+m - 1] + ' ' + toFa(y);
}

export function fmtDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const [jy, jm, jd] = toJalali(y, m, d);
  return toFa(jd) + ' ' + MONTHS[jm - 1] + ' ' + toFa(jy);
}

export function monthOfISO(iso) {
  if (!iso) return curMonthKey();
  const [y, m, d] = iso.split('-').map(Number);
  const [jy, jm] = toJalali(y, m, d);
  return jy + '/' + String(jm).padStart(2, '0');
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
