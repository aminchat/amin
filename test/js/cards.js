// کارت بانکی گرافیکی: تشخیص بانک از ۶ رقم اول (BIN)، بررسی لون، و پیش‌نمایش کارت با رنگ همان بانک.
// شمارهٔ کامل هیچ‌جا ذخیره نمی‌شود؛ فقط ۴ رقم آخر + شناسهٔ بانک.
import { esc, toFa } from './utils.js';
import { t as tr } from './i18n.js';

// [id, نام, رنگ تیره, رنگ روشن]
const BANKS = {
  melli: ['بانک ملی', '#0b3d91', '#f2b705'],
  sepah: ['بانک سپه', '#0f766e', '#c9a227'],
  tejarat: ['بانک تجارت', '#1e3a8a', '#2563eb'],
  saderat: ['بانک صادرات', '#0f3b7a', '#60a5fa'],
  mellat: ['بانک ملت', '#9d174d', '#f43f5e'],
  refah: ['بانک رفاه', '#1d4ed8', '#38bdf8'],
  keshavarzi: ['بانک کشاورزی', '#166534', '#4ade80'],
  maskan: ['بانک مسکن', '#b45309', '#fbbf24'],
  postbank: ['پست بانک', '#064e3b', '#34d399'],
  tosee_taavon: ['بانک توسعه تعاون', '#065f46', '#6ee7b7'],
  tosee_saderat: ['بانک توسعه صادرات', '#0e7490', '#67e8f9'],
  sanat_madan: ['بانک صنعت و معدن', '#374151', '#9ca3af'],
  eghtesad_novin: ['بانک اقتصاد نوین', '#4c1d95', '#a78bfa'],
  parsian: ['بانک پارسیان', '#7f1d1d', '#ef4444'],
  pasargad: ['بانک پاسارگاد', '#1f2937', '#d4af37'],
  karafarin: ['بانک کارآفرین', '#065f46', '#10b981'],
  saman: ['بانک سامان', '#1e40af', '#93c5fd'],
  sina: ['بانک سینا', '#1e3a8a', '#f59e0b'],
  sarmayeh: ['بانک سرمایه', '#312e81', '#818cf8'],
  ayandeh: ['بانک آینده', '#4a1942', '#c084fc'],
  shahr: ['بانک شهر', '#b91c1c', '#fb923c'],
  day: ['بانک دی', '#0c4a6e', '#38bdf8'],
  mehr_iran: ['بانک قرض‌الحسنه مهر ایران', '#14532d', '#86efac'],
  resalat: ['بانک قرض‌الحسنه رسالت', '#1e3a5f', '#7dd3fc'],
  gardeshgari: ['بانک گردشگری', '#7c2d12', '#fdba74'],
  iranzamin: ['بانک ایران‌زمین', '#5b21b6', '#c4b5fd'],
  khavarmianeh: ['بانک خاورمیانه', '#111827', '#f3f4f6'],
  melal: ['مؤسسه ملل', '#7c3aed', '#ddd6fe'],
  noor: ['مؤسسه نور', '#334155', '#cbd5e1'],
  ansar: ['بانک انصار', '#92400e', '#fcd34d'],
  mehr_eghtesad: ['بانک مهر اقتصاد', '#064e3b', '#a7f3d0'],
  ghavamin: ['بانک قوامین', '#1e293b', '#94a3b8'],
  hekmat: ['بانک حکمت ایرانیان', '#3f6212', '#bef264'],
  kosar: ['مؤسسه کوثر', '#9a3412', '#fed7aa'],
  blu: ['بلوبانک', '#0369a1', '#22d3ee'],
};
const BIN = {
  603799: 'melli', 589210: 'sepah', 627353: 'tejarat', 585983: 'tejarat', 603769: 'saderat', 610433: 'mellat', 991975: 'mellat',
  589463: 'refah', 603770: 'keshavarzi', 639217: 'keshavarzi', 628023: 'maskan', 627760: 'postbank', 502908: 'tosee_taavon',
  627648: 'tosee_saderat', 207177: 'tosee_saderat', 627961: 'sanat_madan', 627412: 'eghtesad_novin', 622106: 'parsian', 639194: 'parsian', 627884: 'parsian',
  502229: 'pasargad', 639347: 'pasargad', 627488: 'karafarin', 502910: 'karafarin', 621986: 'saman', 639346: 'sina', 639607: 'sarmayeh',
  636214: 'ayandeh', 502806: 'shahr', 504706: 'shahr', 502938: 'day', 606373: 'mehr_iran', 504172: 'resalat', 505416: 'gardeshgari', 505785: 'iranzamin',
  585947: 'khavarmianeh', 606256: 'melal', 507677: 'noor', 627381: 'ansar', 639370: 'mehr_eghtesad', 639599: 'ghavamin', 636949: 'hekmat', 505801: 'kosar',
  // بلوبانک روی زیرساخت سامان است؛ از BIN قابل تفکیک نیست و فقط با نام بانک تشخیص داده می‌شود
};

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
  const id = BIN[d.slice(0, 6)];
  return id ? bankById(id) : null;
}
export function bankById(id) {
  const b = BANKS[id];
  return b ? { id, name: b[0], dark: b[1], light: b[2] } : null;
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
    <div class="bc-top"><span class="bc-bank">${esc(bankName)}</span><span class="bc-chip"></span></div>
    <div class="bc-num" dir="ltr">${num}</div>
    <div class="bc-bot"><span class="bc-name">${esc(o.name || '')}</span>${o.amount !== undefined ? `<span class="bc-amt">${o.amount}</span>` : ''}</div>
  </div>`;
}
