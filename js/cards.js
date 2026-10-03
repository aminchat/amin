// کارت بانکی گرافیکی: تشخیص بانک از ۶ رقم اول (BIN)، بررسی لون، و پیش‌نمایش کارت با رنگ همان بانک.
// شمارهٔ کامل هیچ‌جا ذخیره نمی‌شود؛ فقط ۴ رقم آخر + شناسهٔ بانک.
import { esc, toFa } from './utils.js';
import { t as tr } from './i18n.js';

// [نام, رنگ تیره, رنگ روشن, فایل لوگو در icons/banks/]
// لوگوها و رنگ‌ها: masihgh/iranian-bank-list (MIT)
const BANKS = {
  melli: ['بانک ملی', '#0b3d91', '#f2b705', 'melli.svg'],
  sepah: ['بانک سپه', '#005c8a', '#0093dd', 'sepah.svg'],
  tejarat: ['بانک تجارت', '#1e3a8a', '#2563eb', 'tejarat.svg'],
  saderat: ['بانک صادرات', '#29166f', '#6d5bd0', 'saderat.svg'],
  mellat: ['بانک ملت', '#a10f26', '#f1557f', 'mellat.svg'],
  refah: ['بانک رفاه', '#1e7a00', '#5cc43a', 'refahkargaran.svg'],
  keshavarzi: ['بانک کشاورزی', '#112c09', '#4ade80', 'keshavarzi.svg'],
  maskan: ['بانک مسکن', '#b43a0a', '#ff7a3d', 'maskan.svg'],
  postbank: ['پست بانک', '#00552a', '#008840', 'post.svg'],
  tosee_taavon: ['بانک توسعه تعاون', '#065f66', '#0b8a93', 'tosetaavon.svg'],
  tosee_saderat: ['بانک توسعه صادرات', '#044a0e', '#066e16', 'tosesaderat.svg'],
  sanat_madan: ['بانک صنعت و معدن', '#0f317e', '#4c6fd1', 'sanatmadan.svg'],
  eghtesad_novin: ['بانک اقتصاد نوین', '#3b1a63', '#5c2e91', 'eghtesad.svg'],
  parsian: ['بانک پارسیان', '#6e0a15', '#a10f1f', 'parsian.svg'],
  pasargad: ['بانک پاسارگاد', '#1f2937', '#ffc110', 'pasargad.svg'],
  karafarin: ['بانک کارآفرین', '#0d5a4e', '#168474', 'karafarin.svg'],
  saman: ['بانک سامان', '#00698f', '#00aae8', 'saman.svg'],
  sina: ['بانک سینا', '#16469c', '#4f7fd6', 'sina.svg'],
  sarmayeh: ['بانک سرمایه', '#4b5563', '#a7a7a7', 'sarmaye.svg'],
  ayandeh: ['بانک آینده', '#4a1942', '#c084fc', 'ayande.svg'],
  shahr: ['بانک شهر', '#8f0000', '#dd0000', 'shahr.svg'],
  day: ['بانک دی', '#005a68', '#008a9f', 'day.svg'],
  mehr_iran: ['بانک قرض‌الحسنه مهر ایران', '#006b36', '#00a653', 'mehriran.svg'],
  resalat: ['بانک قرض‌الحسنه رسالت', '#005a80', '#0092cf', 'resalat.svg'],
  gardeshgari: ['بانک گردشگری', '#6e0609', '#af0a0f', 'gardeshgari.svg'],
  iranzamin: ['بانک ایران‌زمین', '#2e0966', '#490fa2', 'iranzamin.svg'],
  khavarmianeh: ['بانک خاورمیانه', '#9a4f00', '#f7941e', 'khavarmianeh.svg'],
  melal: ['مؤسسه ملل', '#232466', '#37389a', 'melal.svg'],
  noor: ['بانک نور', '#0a7a85', '#11b8c7', 'noor.svg'],
  ansar: ['بانک انصار', '#92400e', '#fcd34d', 'ansar.svg'],
  mehr_eghtesad: ['بانک مهر اقتصاد', '#006b36', '#00a653', 'mehreghtesad.svg'],
  ghavamin: ['بانک قوامین', '#085a2a', '#0e8a42', 'ghavvamin.svg'],
  hekmat: ['بانک حکمت ایرانیان', '#002147', '#0057a1', 'hekmat.svg'],
  kosar: ['مؤسسه کوثر', '#9a3412', '#fed7aa', 'kosar.svg'],
  tat: ['بانک تات', '#4b1a7a', '#8a2be2', ''],
  iran_venezuela: ['بانک ایران‌ونزوئلا', '#1f2166', '#3437a1', 'iran-venezuela.svg'],
  markazi: ['بانک مرکزی', '#1f2937', '#64748b', 'centeral.svg'],
  blu: ['بلوبانک', '#0369a1', '#3094ea', 'blu.svg'],
};
const BIN = {
  603799: 'melli', 589210: 'sepah', 627353: 'tejarat', 585983: 'tejarat', 603769: 'saderat', 610433: 'mellat', 991975: 'mellat',
  589463: 'refah', 603770: 'keshavarzi', 639217: 'keshavarzi', 628023: 'maskan', 627760: 'postbank', 502908: 'tosee_taavon',
  627648: 'tosee_saderat', 207177: 'tosee_saderat', 627961: 'sanat_madan', 627412: 'eghtesad_novin', 622106: 'parsian', 639194: 'parsian', 627884: 'parsian',
  502229: 'pasargad', 639347: 'pasargad', 627488: 'karafarin', 502910: 'karafarin', 621986: 'saman', 639346: 'sina', 639607: 'sarmayeh',
  636214: 'ayandeh', 502806: 'shahr', 504706: 'shahr', 502938: 'day', 606373: 'mehr_iran', 504172: 'resalat', 505416: 'gardeshgari', 505785: 'iranzamin',
  585947: 'khavarmianeh', 588947: 'khavarmianeh', 606256: 'melal', 507677: 'noor', 627381: 'ansar', 639370: 'mehr_eghtesad', 639599: 'ghavamin', 636949: 'hekmat', 505801: 'kosar',
  581874: 'iran_venezuela', 636795: 'markazi',
};
// بلوبانک: BIN سامان با پیشوند ۸ رقمی
const BIN8 = { 62198619: 'blu', 62198618: 'blu' };

export function cardDigits(s) {
  return String(s || '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, (d) => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '').slice(0, 16);
}
export function luhnOk(digits) {
  const d = cardDigits(digits);
  if (d.length !== 16) return false;
  let sum = 0;
  for (let i = 0; i < 16; i++) {
    let n = +d[i];
    if (i % 2 === 0) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
  }
  return sum % 10 === 0;
}
// {id, name, dark, light} یا null
export function bankByBin(digits) {
  const d = cardDigits(digits);
  if (d.length < 6) return null;
  const id = (d.length >= 8 && BIN8[d.slice(0, 8)]) || BIN[d.slice(0, 6)];
  return id ? bankById(id) : null;
}
export function bankById(id) {
  const b = BANKS[id];
  return b ? { id, name: b[0], dark: b[1], light: b[2], logo: b[3] ? 'icons/banks/' + b[3] : '' } : null;
}
// از روی نام مؤسسه (برای کارت‌های قدیمی که فقط نام دارند)
export function bankByName(name) {
  const n = String(name || '').replace(/\s+/g, '').replace('ی', 'ي');
  if (!n) return null;
  for (const id of Object.keys(BANKS)) {
    const bn = BANKS[id][0].replace(/\s+/g, '').replace('ی', 'ي');
    if (n === bn || n.includes(bn.replace(/^(بانک|مؤسسه)/, ''))) return bankById(id);
  }
  return null;
}
export function bankOf(acct) {
  return (acct && acct.bankId && bankById(acct.bankId)) || bankByName(acct && acct.bank) || null;
}
export function fmtCardNo(digits, mask) {
  const d = cardDigits(digits);
  let s = mask ? '••••••••••••' + (d.slice(-4) || '••••') : d.padEnd(16, '•');
  if (!mask && d.length < 16) s = d + '•'.repeat(16 - d.length);
  return toFa(s.replace(/(.{4})(?=.)/g, '$1 '));
}

// پیش‌نمایش کارت. opts: {number|last4, name, bank(name text), bankId, amount, compact, onclick}
export function cardHtml(o) {
  const b = (o.bankId && bankById(o.bankId)) || bankByBin(o.number) || bankByName(o.bank);
  const dark = b ? b.dark : '#334155', light = b ? b.light : '#64748b';
  const bankName = b ? b.name : (o.bank || tr('کارت بانکی'));
  const num = o.number ? fmtCardNo(o.number, false) : fmtCardNo(o.last4 || '', true);
  return `<div class="bcard ${o.compact ? 'compact' : ''}" style="--c1:${dark};--c2:${light}" ${o.onclick ? `onclick="${o.onclick}"` : ''}>
    <div class="bc-top"><span class="bc-bank">${b && b.logo ? `<img class="bc-logo" src="${b.logo}" alt="">` : ''}${esc(bankName)}</span><span class="bc-chip"></span></div>
    <div class="bc-num" dir="ltr">${num}</div>
    <div class="bc-bot"><span class="bc-name">${esc(o.name || '')}</span>${o.amount !== undefined ? `<span class="bc-amt">${o.amount}</span>` : ''}</div>
  </div>`;
}
export function bankLogoHtml(b, cls) {
  return b && b.logo ? `<img class="${cls || 'bank-logo'}" src="${b.logo}" alt="">` : '';
}
export function allBanks() {
  return Object.keys(BANKS).map(bankById);
}

// آیکن واحد پول: SVG درون‌خطی (نه <img>) تا نماد از فونت صفحه رندر شود و «مربع خالی» نشود
import { currencyInfo } from './state.js';
const CUR_ICONS = {
  TMN: ['#0f766e', 'ت', 34], IRR: ['#0e7490', '﷼', 26], USD: ['#15803d', '$', 36], EUR: ['#1d4ed8', '€', 34], GBP: ['#7e22ce', '£', 34],
  AED: ['#b45309', 'د.إ', 22], TRY: ['#b91c1c', '₺', 34], JPY: ['#be123c', '¥', 34], CNY: ['#dc2626', '¥', 34, '#fde047'], RUB: ['#1e40af', '₽', 32],
  INR: ['#ea580c', '₹', 32], CAD: ['#dc2626', 'C$', 24], AUD: ['#0e7490', 'A$', 24], CHF: ['#dc2626', 'Fr', 24], IQD: ['#166534', 'ع.د', 20],
  AFN: ['#0f766e', '؋', 32], AZN: ['#1d4ed8', '₼', 30], AMD: ['#ea580c', '֏', 30], OMR: ['#991b1b', 'ر.ع', 20], QAR: ['#7f1d1d', 'ر.ق', 20],
  SAR: ['#166534', 'ر.س', 20], KWD: ['#1e3a8a', 'د.ك', 20], USDT: ['#26a17b', '₮', 36],
};
// نمادهایی که فونت‌ها اغلب ندارند، با مسیر کشیده می‌شوند
const CUR_PATHS = {
  BTC: '<circle cx="32" cy="32" r="30" fill="#f7931a"/><g fill="#fff"><path d="M27 15h4v5h3v-5h4v5.3c4.6.6 7.6 2.9 7.6 7 0 2.9-1.6 4.9-3.9 5.8 3.1.8 5.1 3.1 5.1 6.6 0 4.9-3.7 7.6-9 8.1V49h-4v-5h-3v5h-4v-5h-6l.8-4.7h2.4c.9 0 1.4-.5 1.4-1.4V26.1c0-.9-.5-1.4-1.4-1.4h-3.2V20h6z"/></g><g fill="#f7931a"><path d="M30 24.5v6.8h4.4c2.6 0 4-1.3 4-3.4 0-2.2-1.5-3.4-4.3-3.4z"/><path d="M30 35.2v7.4h5.2c3 0 4.6-1.3 4.6-3.7 0-2.4-1.7-3.7-4.9-3.7z"/></g>',
  ETH: '<circle cx="32" cy="32" r="30" fill="#627eea"/><path fill="#fff" fill-opacity=".6" d="M32 10v16.3l13.8 6.2z"/><path fill="#fff" d="M32 10 18.2 32.5 32 26.3z"/><path fill="#fff" fill-opacity=".6" d="M32 42.6V54l13.8-19.1z"/><path fill="#fff" d="M32 54V42.6L18.2 34.9z"/><path fill="#fff" fill-opacity=".2" d="m32 40 13.8-7.5L32 26.3z"/><path fill="#fff" fill-opacity=".6" d="m18.2 32.5 13.8 7.5V26.3z"/>',
  XAU: '<circle cx="32" cy="32" r="30" fill="#b45309"/><path fill="#fbbf24" d="M14 44h18l-3-12H17z"/><path fill="#f59e0b" d="M32 44h18l-3-12H35z"/><path fill="#fcd34d" d="M23 30h18l-3-12H26z"/>',
  USDT: '<circle cx="32" cy="32" r="30" fill="#26a17b"/><path fill="#fff" d="M18 17h28v7H36v4.2c7.6.4 13 1.9 13 3.8s-5.4 3.4-13 3.8V49h-8V35.8c-7.6-.4-13-1.9-13-3.8s5.4-3.4 13-3.8V24H18zm10 10.7v3.1c1.3.1 2.6.1 4 .1s2.7 0 4-.1v-3.1c-1.3-.1-2.6-.1-4-.1s-2.7 0-4 .1z"/>',
  other: '<circle cx="32" cy="32" r="30" fill="#64748b"/><circle cx="32" cy="32" r="14" fill="none" stroke="#fff" stroke-width="5"/>',
};
export function curIconHtml(cur, cls) {
  const code = (currencyInfo(cur) || {}).code || '';
  let inner = CUR_PATHS[code];
  if (!inner) {
    const c = CUR_ICONS[code];
    if (c) inner = `<circle cx="32" cy="32" r="30" fill="${c[0]}"/><text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-size="${c[2]}" font-weight="700" fill="${c[3] || '#fff'}">${c[1]}</text>`;
    else inner = CUR_PATHS.other;
  }
  return `<svg class="${cls || 'cur-ic'}" viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;
}

// ── صرافی‌ها و کارگزاری‌ها ──
// لوگوی واقعی فقط برای آن‌هایی که منبع آزاد (simple-icons, CC0) دارند؛ بقیه مونوگرام با رنگ برند
// [نام فارسی, رنگ, حرف/حروف مونوگرام, فایل لوگو?]
const EXCH = {
  nobitex: ['نوبیتکس', '#5b3ea6', 'ن'], wallex: ['والکس', '#0a5cff', 'و'], tabdeal: ['تبدیل', '#00a693', 'ت'], ramzinex: ['رمزینکس', '#2c3e50', 'ر'],
  exir: ['اکسیر', '#2ca58d', 'ا'], bitpin: ['بیت‌پین', '#0e7cff', 'ب'], ok_exchange: ['اوکی‌اکسچنج', '#1f4e79', 'OK'], arzpaya: ['ارزپایا', '#ff6a00', 'ا'],
  coinex: ['کوینکس', '#17b7a6', 'CX'], binance: ['بایننس', '#f0b90b', 'B', 'binance.svg'], okx: ['اوکی‌اکس', '#000000', 'OKX', 'okx.svg'],
  kucoin: ['کوکوین', '#01bc8d', 'K', 'kucoin.svg'], coinbase: ['کوین‌بیس', '#0052ff', 'C', 'coinbase.svg'], bybit: ['بای‌بیت', '#f7a600', 'BY'],
  kraken: ['کراکن', '#5741d9', 'K'], mexc: ['مکسی', '#00b897', 'M'], gate: ['گیت', '#2354e6', 'G'], htx: ['اچ‌تی‌ایکس', '#008cd6', 'H'], bitget: ['بیت‌گت', '#00f0ff', 'BG'],
  metamask: ['متامسک', '#f6851b', 'M'], trustwallet: ['تراست والت', '#3375bb', 'T'], ledger: ['لجر', '#000000', 'L'], trezor: ['ترزور', '#141609', 'T', 'trezor.svg'],
  hardware: ['کیف پول سخت‌افزاری', '#334155', '🔐'],
  mofid: ['کارگزاری مفید', '#0e4a99', 'م'], agah: ['کارگزاری آگاه', '#e31e26', 'آ'], farabi: ['کارگزاری فارابی', '#6a1b9a', 'ف'], hafez: ['کارگزاری حافظ', '#0d9488', 'ح'],
  bourse_bime: ['کارگزاری بورس بیمه', '#1d4ed8', 'ب'], exir_broker: ['کارگزاری اکسیر', '#2ca58d', 'ا'], saham: ['سجام / بورس', '#0f766e', 'س'],
  ibkr: ['اینتراکتیو بروکرز', '#d81222', 'IB'], robinhood: ['رابین‌هود', '#ccff00', 'R', 'robinhood.svg'], etoro: ['ای‌تورو', '#13c636', 'e'], tradingview: ['تریدینگ‌ویو', '#131622', 'TV', 'tradingview.svg'],
  alpari: ['آلپاری', '#0066b3', 'A'], exness: ['اکسنس', '#ffde00', 'E'], litefinance: ['لایت‌فایننس', '#0a84ff', 'LF'], xm: ['XM', '#e4002b', 'XM'], amarkets: ['آمارکتس', '#1f8a4c', 'AM'],
  paypal: ['پی‌پال', '#003087', 'P'], wise: ['وایز', '#9fe870', 'W'], revolut: ['رولوت', '#191c1f', 'R'],
};
const norm = (x) => String(x || '').toLowerCase().replace(/[\s\u200c\-_.]+/g, '').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/^(صرافی|کارگزاری|بروکر)/, '');
const EX_ALIAS = { nobitex: ['nobitex'], wallex: ['wallex'], tabdeal: ['tabdeal'], ramzinex: ['ramzinex'], exir: ['exir'], bitpin: ['bitpin'], coinex: ['coinex'], binance: ['binance'], okx: ['okx', 'okex'], kucoin: ['kucoin'], coinbase: ['coinbase'], bybit: ['bybit'], kraken: ['kraken'], mexc: ['mexc'], gate: ['gateio', 'gate'], htx: ['htx', 'huobi', 'هوبی'], bitget: ['bitget'], metamask: ['metamask'], trustwallet: ['trustwallet', 'تراستولت'], ledger: ['ledger'], trezor: ['trezor'], mofid: ['mofid', 'مفید'], agah: ['agah', 'آگاه'], farabi: ['farabi', 'فارابی'], hafez: ['hafez', 'حافظ'], ibkr: ['ibkr', 'interactivebrokers'], robinhood: ['robinhood'], etoro: ['etoro'], tradingview: ['tradingview'], alpari: ['alpari'], exness: ['exness'], litefinance: ['litefinance', 'liteforex'], xm: ['xm'], amarkets: ['amarkets'], paypal: ['paypal'], wise: ['wise', 'transferwise'], revolut: ['revolut'] };
export function exchangeOf(name) {
  const n = norm(name);
  if (!n) return null;
  for (const id of Object.keys(EXCH)) {
    const e = EXCH[id];
    if (n === norm(e[0]) || (EX_ALIAS[id] || []).some((a) => n === norm(a))) return { id, name: e[0], color: e[1], mono: e[2], logo: e[3] ? 'icons/ex/' + e[3] : '' };
  }
  return null;
}
export function allExchanges() {
  return Object.keys(EXCH).map((id) => EXCH[id][0]);
}
export function exchangeIconHtml(e, cls) {
  if (!e) return '';
  if (e.logo) return `<img class="${cls || 'ex-ic'}" src="${e.logo}" alt="">`;
  const r = parseInt(e.color.slice(1, 3), 16), g = parseInt(e.color.slice(3, 5), 16), b = parseInt(e.color.slice(5, 7), 16);
  const fg = 0.299 * r + 0.587 * g + 0.114 * b > 170 ? '#111' : '#fff';
  const fs = e.mono.length > 2 ? 22 : e.mono.length === 2 ? 28 : 34;
  return `<svg class="${cls || 'ex-ic'}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="${e.color}"/><text x="32" y="34" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="800" fill="${fg}">${esc(e.mono)}</text></svg>`;
}
