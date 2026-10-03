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
