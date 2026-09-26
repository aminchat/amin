// راه‌اندازی اول («خوش آمدی»): فقط برای دستگاهی که هیچ داده‌ای ندارد.
// کاربر قدیمی (داده دارد) هرگز این را نمی‌بیند؛ پرچم onboarded خودکار ست می‌شود.
import { icon } from './icons.js';
import { esc, store, toast, uid } from './utils.js';
import { t as tr, LANGS, setLang, lang } from './i18n.js';
import { state, save, hasLocalData, baseCur, curName, ACCT_TYPES } from './state.js';
import { setBookCalendar, curMonthKey } from './jalali.js';
import { setHealthPref } from './health.js';

const FLAG = 'capital_onboarded';
let step = 0;
let draft = { lang: null, cal: null, income: '', irregular: false, acctName: '', acctType: '', acctInit: '' };

export function needsOnboarding() {
  if (store.get(FLAG) === '1') return false;
  if (hasLocalData(state)) {
    store.set(FLAG, '1'); // کاربر فعلی
    return false;
  }
  return true;
}
export function markOnboarded() {
  store.set(FLAG, '1');
}

function root() {
  let el = document.getElementById('onboard');
  if (!el) {
    el = document.createElement('div');
    el.id = 'onboard';
    document.body.appendChild(el);
  }
  return el;
}
export function closeOnboarding() {
  const el = document.getElementById('onboard');
  if (el) el.remove();
  document.body.classList.remove('onboarding');
  markOnboarded();
  if (window.render) window.render();
}

export function openOnboarding() {
  step = 0;
  draft.lang = lang();
  draft.cal = state.calendar || (draft.lang === 'fa' ? 'jalali' : 'gregorian');
  document.body.classList.add('onboarding');
  paint();
}


// ── تصویرسازی خطی (SVG) برای کاروسل خوش‌آمد ──
const P = (n) => (lang() === 'fa' ? String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]) + '٪' : n + '%');
const ART = () => ({
  pockets: `<svg viewBox="0 0 240 170" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <g opacity=".95"><rect x="18" y="58" width="92" height="64" rx="8"/><path d="M18 66l46 30 46-30"/><text x="64" y="112" text-anchor="middle" font-size="14" font-weight="800" fill="currentColor" stroke="none">${P(60)}</text></g>
    <g opacity=".75"><rect x="130" y="58" width="92" height="64" rx="8"/><path d="M130 66l46 30 46-30"/><text x="176" y="112" text-anchor="middle" font-size="14" font-weight="800" fill="currentColor" stroke="none">${P(20)}</text></g>
    <g opacity=".6"><rect x="46" y="18" width="70" height="34" rx="6"/><path d="M46 24l35 20 35-20"/><text x="81" y="47" text-anchor="middle" font-size="11" font-weight="800" fill="currentColor" stroke="none">${P(15)}</text></g>
    <g opacity=".6"><rect x="126" y="18" width="70" height="34" rx="6"/><path d="M126 24l35 20 35-20"/><text x="161" y="47" text-anchor="middle" font-size="11" font-weight="800" fill="currentColor" stroke="none">${P(5)}</text></g>
    <path d="M40 150h160" opacity=".35"/><circle cx="120" cy="150" r="9" fill="var(--bg)"/><path d="M116 150h8M120 146v8"/>
  </svg>`,
  balance: `<svg viewBox="0 0 240 170" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M30 40h180" opacity=".35"/>
    <g opacity=".9"><rect x="30" y="58" width="180" height="12" rx="6" opacity=".25"/><rect x="30" y="58" width="112" height="12" rx="6" fill="currentColor" stroke="none" opacity=".9"/><path d="M150 52v24" stroke-width="3"/></g>
    <g opacity=".9"><rect x="30" y="88" width="180" height="12" rx="6" opacity=".25"/><rect x="30" y="88" width="168" height="12" rx="6" fill="#f59e0b" stroke="none"/><path d="M150 82v24" stroke-width="3"/></g>
    <g opacity=".9"><rect x="30" y="118" width="180" height="12" rx="6" opacity=".25"/><rect x="30" y="118" width="70" height="12" rx="6" fill="#22c55e" stroke="none"/><path d="M110 112v24" stroke-width="3"/></g>
    <circle cx="60" cy="150" r="5" fill="#22c55e" stroke="none"/><circle cx="120" cy="150" r="5" fill="#f59e0b" stroke="none"/><circle cx="180" cy="150" r="5" fill="#ef4444" stroke="none"/>
  </svg>`,
  lock: `<svg viewBox="0 0 240 170" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M62 128a26 26 0 0 1-4-52 40 40 0 0 1 76-10 30 30 0 0 1 32 62" opacity=".55"/>
    <rect x="86" y="86" width="68" height="56" rx="10" fill="var(--bg)"/><path d="M100 86V72a20 20 0 0 1 40 0v14"/><circle cx="120" cy="112" r="6" fill="currentColor" stroke="none"/><path d="M120 118v10"/>
    <rect x="176" y="102" width="40" height="58" rx="8" opacity=".55"/><path d="M190 152h12" opacity=".55"/>
    <path d="M28 40l8-8 8 8M36 32v22" opacity=".45"/>
  </svg>`,
});
function carousel() {
  const slides = [
    { art: 'pockets', h: 'هر تومان از قبل جای خودش را دارد', p: 'درآمد ماه به چهار پاکت تقسیم می‌شود: ۶۰٪ ضروریات، ۲۰٪ آزادی مالی، ۱۵٪ تفریح، ۵٪ نیکوکاری.' },
    { art: 'balance', h: 'هدف در برابر واقعی', p: 'هر پاکت یک خط هدف دارد. سبز یعنی روی خط، زرد احتیاط، قرمز توقف — بی‌آنکه لازم باشد چیزی حساب کنی.' },
    { art: 'lock', h: 'داده روی گوشی خودت', p: 'همه‌چیز روی همین دستگاه می‌ماند. اگر بخواهی با رمزِ خودت قفلش می‌کنی و در گوگل درایو پشتیبان می‌گیری.' },
  ];
  return `<div class="ob-car" id="obCar" onscroll="obCarScroll(this)">${slides.map((s) => `<div class="ob-slide">${ART()[s.art]}<h1 class="ob-h">${tr(s.h)}</h1><p class="ob-p">${tr(s.p)}</p></div>`).join('')}</div>
  <div class="ob-car-dots" id="obCarDots">${slides.map((_, i) => `<i class="${i === 0 ? 'on' : ''}"></i>`).join('')}</div>`;
}
function obCarScroll(el) {
  const i = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
  document.querySelectorAll('#obCarDots i').forEach((d, k) => d.classList.toggle('on', k === i));
}

// ── صفحات ──
function dots(n) {
  return `<div class="ob-dots">${[1, 2, 3, 4].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`;
}
function shell(inner, opts) {
  opts = opts || {};
  return `<div class="ob-wrap">
    <div class="ob-top">${opts.back ? `<button type="button" class="hdr-btn" onclick="obBack()" aria-label="${tr('بازگشت')}">${icon('chevR')}</button>` : '<span></span>'}
      ${opts.skip ? `<button type="button" class="link-btn" onclick="obSkip()">${tr('بعداً')}</button>` : ''}</div>
    <div class="ob-body">${inner}</div>
  </div>`;
}

function pageWelcome() {
  return shell(`
    <div class="logo ob-logo">${icon('wallet')}</div>
    <div class="small muted" style="font-weight:800;margin-bottom:var(--sp-3)">${tr('به تراز خوش آمدی')}</div>
    ${carousel()}
    <div class="ob-actions">
      <button type="button" class="btn primary block lg" onclick="obNext()">${tr('شروع تازه')}</button>
      <button type="button" class="btn block lg" onclick="obRestore()">${icon('cloud')} ${tr('قبلاً حساب داشته‌ام')}</button>
    </div>
    <p class="small muted" style="margin-top:14px">${tr('بازیابی از گوگل درایو یا فایل پشتیبان')}</p>
  `);
}

function pageRestore() {
  return shell(`
    <span class="ib lg">${icon('cloud')}</span>
    <h1 class="ob-h">${tr('بازیابی حساب')}</h1>
    <p class="ob-p">${tr('اگر قبلاً همگام‌سازی روشن بوده، با همان حساب گوگل وارد شو؛ همه‌چیز خودش برمی‌گردد.')}</p>
    <div class="ob-actions">
      <button type="button" class="btn primary block lg" onclick="obGoogle()">${tr('ورود با گوگل')}</button>
      <button type="button" class="btn block lg" onclick="document.getElementById('obFile').click()">${icon('cloudDown')} ${tr('از فایل پشتیبان')}</button>
      <input type="file" id="obFile" accept="application/json,.json" style="display:none" onchange="obImport(this.files[0])">
    </div>
    <p class="small muted" style="margin-top:14px">${tr('اگر داده‌ها رمز داشته باشند، رمز یا عبارت بازیابی را می‌پرسیم.')}</p>
  `, { back: true });
}

function pageLang() {
  const seg = (items, cur, fn) => `<div class="seg ob-seg">${items.map((x) => `<button type="button" class="${x.id === cur ? 'on' : ''}" onclick="${fn}('${x.id}')">${x.name}</button>`).join('')}</div>`;
  return shell(`
    ${dots(1)}
    <h1 class="ob-h">${tr('زبان و تقویم')}</h1>
    <p class="ob-p">${tr('هر وقت خواستی از تنظیمات عوضشان کن.')}</p>
    <label class="ob-lbl">${tr('زبان')}</label>
    ${seg(LANGS, draft.lang, 'obSetLang')}
    <label class="ob-lbl" style="margin-top:18px">${tr('تقویم دفتر')}</label>
    ${seg([{ id: 'jalali', name: tr('شمسی') }, { id: 'gregorian', name: tr('میلادی') }], draft.cal, 'obSetCal')}
    <div class="ob-actions"><button type="button" class="btn primary block lg" onclick="obNext()">${tr('ادامه')}</button></div>
  `, { back: true });
}

function pageIncome() {
  return shell(`
    ${dots(2)}
    <h1 class="ob-h">${tr('درآمد ماهانه')}</h1>
    <p class="ob-p">${tr('بودجهٔ پاکت‌ها از روی همین عدد ساخته می‌شود (۶۰٪ ضروریات، ۲۰٪ آزادی مالی، ۱۵٪ تفریح، ۵٪ نیکوکاری).')}</p>
    <div class="field"><label>${tr('درآمد ماهانه')} (${esc(curName(baseCur()))})</label>
      <input class="input" id="obIncome" type="number" step="any" inputmode="decimal" min="0" placeholder="${tr('مثلاً 30000000')}" value="${esc(draft.income)}" ${draft.irregular ? 'disabled' : ''}>
    </div>
    <label class="ob-check"><input type="checkbox" id="obIrregular" ${draft.irregular ? 'checked' : ''} onchange="obIrregular(this.checked)"><span>${tr('درآمدم ثابت نیست')}<small>${tr('پروژه‌ای / پیمانکاری؛ مبنا میانگین سه ماه اخیر می‌شود')}</small></span></label>
    <div class="ob-actions"><button type="button" class="btn primary block lg" onclick="obNext()">${tr('ادامه')}</button></div>
  `, { back: true, skip: true });
}

function pageAccount() {
  const types = ACCT_TYPES;
  return shell(`
    ${dots(3)}
    <h1 class="ob-h">${tr('اولین حساب')}</h1>
    <p class="ob-p">${tr('پولت الان کجاست؟ بعداً هر چند حساب خواستی اضافه کن.')}</p>
    <div class="field"><label>${tr('نام حساب')}</label>
      <input class="input" id="obAcctName" placeholder="${tr('مثلاً کارت ملت، کیف پول')}" value="${esc(draft.acctName)}"></div>
    <div class="field"><label>${tr('نوع')}</label>
      <select class="input" id="obAcctType">${types.map((x) => `<option value="${esc(x)}" ${x === (draft.acctType || types[0]) ? 'selected' : ''}>${tr(x)}</option>`).join('')}</select></div>
    <div class="field"><label>${tr('موجودی فعلی')} (${esc(curName(baseCur()))})</label>
      <input class="input" id="obAcctInit" type="number" step="any" inputmode="decimal" placeholder="0" value="${esc(draft.acctInit)}"></div>
    <div class="ob-actions"><button type="button" class="btn primary block lg" onclick="obNext()">${tr('ادامه')}</button></div>
  `, { back: true, skip: true });
}

function pageDone() {
  return shell(`
    ${dots(4)}
    <span class="ib lg green">${icon('check')}</span>
    <h1 class="ob-h">${tr('آماده‌ای')}</h1>
    <p class="ob-p">${tr('دو گزینهٔ اختیاری که بعداً هم در تنظیمات هستند:')}</p>
    <div class="sgroup">
      <button type="button" class="srow" onclick="obFinish('google')"><span class="sic" style="background:#3d8bfd">${icon('cloud')}</span><span class="smid"><span class="st1">${tr('همگام‌سازی با گوگل درایو')}</span><span class="st2">${tr('پشتیبان خودکار و دسترسی از چند دستگاه')}</span></span>${icon('chevL')}</button>
      <button type="button" class="srow" onclick="obFinish('encrypt')"><span class="sic" style="background:#22c55e">${icon('shield')}</span><span class="smid"><span class="st1">${tr('رمزگذاری داده‌ها')}</span><span class="st2">${tr('قفل برنامه با رمز عبور؛ حتی گوگل هم نمی‌تواند بخواند')}</span></span>${icon('chevL')}</button>
    </div>
    <div class="ob-actions"><button type="button" class="btn primary block lg" onclick="obFinish()">${tr('برو به برنامه')}</button></div>
  `, { back: true });
}

const PAGES = [pageWelcome, pageLang, pageIncome, pageAccount, pageDone];
function paint() {
  const el = root();
  el.innerHTML = step === -1 ? pageRestore() : PAGES[step]();
  const first = el.querySelector('input:not([type=checkbox]):not([type=file])');
  if (first && step > 0) setTimeout(() => first.focus(), 80);
}

// ── رفتار ──
function readStep() {
  if (step === 2) {
    const i = document.getElementById('obIncome');
    if (i) draft.income = i.value;
  }
  if (step === 3) {
    const n = document.getElementById('obAcctName');
    const ty = document.getElementById('obAcctType');
    const b = document.getElementById('obAcctInit');
    if (n) draft.acctName = n.value.trim();
    if (ty) draft.acctType = ty.value;
    if (b) draft.acctInit = b.value;
  }
}
function obNext() {
  readStep();
  if (step === 3 && !draft.acctName) {
    toast(tr('نام حساب را بنویس یا «بعداً» را بزن'));
    return;
  }
  applyStep();
  step = Math.min(PAGES.length - 1, step + 1);
  paint();
}
function obSkip() {
  if (step === 2) draft.income = '';
  if (step === 3) draft.acctName = '';
  step = Math.min(PAGES.length - 1, step + 1);
  paint();
}
function obBack() {
  readStep();
  step = step === -1 ? 0 : Math.max(0, step - 1);
  paint();
}
function obRestore() {
  step = -1;
  paint();
}
async function obSetLang(id) {
  draft.lang = id;
  if (!draft.calTouched) draft.cal = id === 'fa' ? 'jalali' : 'gregorian';
  await setLang(id);
  paint();
}
function obSetCal(id) {
  draft.cal = id;
  draft.calTouched = true;
  paint();
}
function obIrregular(on) {
  draft.irregular = !!on;
  const i = document.getElementById('obIncome');
  if (i) i.disabled = on;
}
function applyStep() {
  if (step === 1) {
    state.calendar = draft.cal;
    setBookCalendar(draft.cal);
  }
  if (step === 2) {
    const inc = parseFloat(draft.income) || 0;
    if (draft.irregular) setHealthPref('incomeMode', 'avg3');
    else if (inc > 0) {
      const mk = curMonthKey();
      state.budgets[mk] = { amount: inc, updatedAt: Date.now() };
      setHealthPref('incomeMode', 'month');
    }
  }
  if (step === 3 && draft.acctName) {
    state.accounts.push({ id: uid(), name: draft.acctName, bank: '', type: draft.acctType || ACCT_TYPES[0], currency: baseCur(), last4: '', initial: parseFloat(draft.acctInit) || 0, updatedAt: Date.now() });
  }
}
function obFinish(extra) {
  save();
  closeOnboarding();
  if (extra === 'google' && window.googleSignIn) window.googleSignIn();
  if (extra === 'encrypt' && window.openEncryptSetup) window.openEncryptSetup();
  if (!extra) toast(tr('خوش آمدی') + ' 👋');
}
function obGoogle() {
  // ورود؛ بعد از بازگشت، داده از درایو می‌آید و چون داده داریم، راه‌اندازی دیگر نشان داده نمی‌شود
  markOnboarded();
  if (window.googleSignIn) window.googleSignIn();
}
function obImport(file) {
  if (!file) return;
  markOnboarded();
  closeOnboarding();
  if (window.importBackup) window.importBackup(file);
}

// اگر همگام‌سازی داده آورد، راه‌اندازی بسته شود
document.addEventListener('cap:stateReplaced', () => {
  if (document.getElementById('onboard') && hasLocalData(state)) closeOnboarding();
});

if (typeof window !== 'undefined') {
  Object.assign(window, { obCarScroll, obNext, obSkip, obBack, obRestore, obSetLang, obSetCal, obIrregular, obFinish, obGoogle, obImport, openOnboarding });
}
