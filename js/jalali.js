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
