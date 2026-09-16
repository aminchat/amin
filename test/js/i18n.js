// ─── چندزبانه (i18n) ───
// زبان: 'auto' (از گوشی) یا کد صریح. رشته‌ها در i18n/<lang>.js؛ انگلیسی مرجع، فارسی پیش‌فرض برای fa.
import { store, setFaDigits } from './utils.js';

export const LANGS = [
  { id: 'fa', name: 'فارسی', dir: 'rtl', digits: 'fa', cal: 'jalali', locale: 'fa-IR' },
  { id: 'en', name: 'English', dir: 'ltr', digits: 'en', cal: 'gregorian', locale: 'en-US' },
];
const KEY = 'capital_lang';
const CAL_KEY = 'capital_cal';

let cur = null; // {id, dir, ...}
let dict = {};
let fallback = {};

function detect() {
  const pref = store.get(KEY) || 'auto';
  if (pref !== 'auto' && LANGS.some((l) => l.id === pref)) return pref;
  const nav = (typeof navigator !== 'undefined' && (navigator.language || (navigator.languages || [])[0])) || 'fa';
  const short = String(nav).toLowerCase().split('-')[0];
  return LANGS.some((l) => l.id === short) ? short : 'en';
}

export function langPref() {
  return store.get(KEY) || 'auto';
}
export function lang() {
  return cur ? cur.id : 'fa';
}
export function langInfo() {
  return cur || LANGS[0];
}
export function isRTL() {
  return langInfo().dir === 'rtl';
}
// تقویم: 'auto' → بر اساس زبان
export function calendar() {
  const p = store.get(CAL_KEY) || 'auto';
  return p === 'auto' ? langInfo().cal : p;
}
export function calPref() {
  return store.get(CAL_KEY) || 'auto';
}
export function setCalendar(v) {
  store.set(CAL_KEY, v || 'auto');
}
export function useFaDigits() {
  return langInfo().digits === 'fa';
}

// ترجمه: t('key') یا t('key', {n: 3}) با جایگزینی {n}
export function t(key, vars) {
  let s = dict[key];
  if (s === undefined) s = fallback[key];
  if (s === undefined) s = key;
  if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(vars[k]);
  return s;
}
export function has(key) {
  return dict[key] !== undefined || fallback[key] !== undefined;
}

export async function initI18n() {
  const id = detect();
  await loadLang(id);
}

async function loadLang(id) {
  const info = LANGS.find((l) => l.id === id) || LANGS[0];
  const [en, mine] = await Promise.all([import('../i18n/en.js'), info.id === 'en' ? null : import('../i18n/' + info.id + '.js')]);
  fallback = en.default;
  dict = mine ? mine.default : en.default;
  cur = info;
  setFaDigits(info.digits === 'fa');
  applyDocument();
}

function applyDocument() {
  const html = document.documentElement;
  html.lang = cur.id;
  html.dir = cur.dir;
  html.setAttribute('data-lang', cur.id);
}

export async function setLang(pref) {
  store.set(KEY, pref || 'auto');
  await loadLang(detect());
}

// ماه‌های میلادی (برای تقویم میلادی)
export function gregMonths() {
  return t('months.greg').split('|');
}
export function jalaliMonths() {
  return t('months.jalali').split('|');
}
