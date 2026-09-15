import { esc, store, toast, isMoneyHidden, setMoneyHidden, APP_VERSION } from './utils.js';
import { icon, hasIcon } from './icons.js';
import { saveGeminiKey, clearGeminiKey } from './scan.js';
import { openModal, closeModal } from './modal.js';
import { render } from './view.js';
import { state, replaceState, save, allCurrencies, rateOf } from './state.js';
import * as sec from './securestore.js';
import {
  newRecoveryPhrase,
  normalizePhrase,
  phraseValid,
  phraseUnknownWords,
  PHRASE_WORDS,
  randBytes,
  b64,
  unb64,
  importKekFromRaw,
  wrapDataKeyWithKek,
  unwrapDataKeyWithKek,
} from './crypto.js';

export { saveGeminiKey, clearGeminiKey };

function geminiHelpHref() {
  return location.pathname.indexOf('/test') >= 0 ? '../help-gemini.html' : 'help-gemini.html';
}

const THEME_KEY = 'capital_theme';
const PIN_KEY = 'capital_pin_hash';
const BIO_KEY = 'capital_bio_id';
const LEGACY_DATA_KEY = 'capital_app_v1';

export const THEMES = [
  { id: 'night', name: 'شب', c1: '#0b0f17', c2: '#3d8bfd' },
  { id: 'light', name: 'روشن', c1: '#f4f6fb', c2: '#2563eb' },
  { id: 'ocean', name: 'اقیانوس', c1: '#07151c', c2: '#22d3ee' },
  { id: 'forest', name: 'جنگل', c1: '#0c1410', c2: '#34d399' },
  { id: 'sunset', name: 'غروب', c1: '#140e12', c2: '#fb7185' },
];

export function currentTheme() {
  return store.get(THEME_KEY) || 'night';
}

export function applyTheme(id) {
  const t = THEMES.find((x) => x.id === id) ? id : 'night';
  document.documentElement.setAttribute('data-theme', t);
  store.set(THEME_KEY, t);
  const meta = document.querySelector('meta[name="theme-color"]');
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  if (meta && bg) meta.setAttribute('content', bg);
}

export function togglePrivacy() {
  setMoneyHidden(!isMoneyHidden());
  syncPrivacyBtn();
  render();
}

export function syncPrivacyBtn() {
  const btn = document.getElementById('btnPrivacy');
  if (btn) btn.innerHTML = icon(isMoneyHidden() ? 'eyeOff' : 'eye');
}

// ─── پین: در حالت رمزشده «کلید» است، در حالت قدیمی فقط هش ─────────────────
export function hasPin() {
  if (sec.isEncrypted()) return false; // در حالت رمزنگاری پین وجود ندارد؛ فقط رمز عبور + اثر انگشت
  return !!store.get(PIN_KEY);
}

export function bioAvailable() {
  return !!(
    window.PublicKeyCredential &&
    (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  );
}

async function hashPin(pin) {
  const data = new TextEncoder().encode('capital:' + pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function readBioRecord() {
  const raw = store.get(BIO_KEY);
  if (!raw) return null;
  if (raw.charAt(0) === '{') {
    try {
      const rec = JSON.parse(raw);
      return rec && (rec.v === 2 || rec.v === 3) && rec.id ? rec : null;
    } catch (e) {
      return null;
    }
  }
  return { v: 1, id: raw };
}

export async function setPin(pin) {
  if (sec.isEncrypted()) return false;
  if (!/^\d{4,8}$/.test(pin)) {
    toast('رمز باید ۴ تا ۸ رقم باشد');
    return false;
  }
  store.set(PIN_KEY, await hashPin(pin));
  toast('رمز ذخیره شد');
  return true;
}

export function clearPin() {
  if (sec.isEncrypted()) return;
  store.set(PIN_KEY, '');
  store.set(BIO_KEY, '');
  toast('قفل برداشته شد');
}

export async function checkPin(pin) {
  const saved = store.get(PIN_KEY);
  if (!saved) return true;
  return (await hashPin(pin)) === saved;
}

export async function enableBiometric() {
  if (!bioAvailable() || !window.PublicKeyCredential) {
    toast('اثر انگشت روی این دستگاه/آدرس در دسترس نیست');
    return false;
  }
  const encrypted = sec.isEncrypted();
  if (encrypted && !sec.isUnlocked()) {
    toast('اول با رمز عبور وارد شو، بعد اثر انگشت را فعال کن');
    return false;
  }
  try {
    if (
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable &&
      !(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    ) {
      toast('روی این دستگاه اثر انگشت/قفل صفحه برای مرورگر فعال نیست');
      return false;
    }
  } catch (e) {}
  try {
    // فقط یک اعتبارنامهٔ سادهٔ پلتفرم برای «تأیید هویت با اثر انگشت» — نه passkey.
    // (residentKey/discoverable باعث می‌شد کروم بخواهد passkey در Google Password Manager بسازد)
    const publicKey = {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'مدیریت سرمایه', id: location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: 'capital-app',
        displayName: 'مدیریت سرمایه',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'discouraged',
        requireResidentKey: false,
      },
      attestation: 'none',
      timeout: 60000,
    };
    const cred = await navigator.credentials.create({ publicKey });
    if (!cred) return false;

    if (encrypted) {
      if (!sec.isUnlocked()) return false;
      // کلید داده با یک راز محلیِ تصادفی پیچیده می‌شود؛ اثر انگشت دروازهٔ استفاده از آن است
      const ds = randBytes(32);
      const dsKek = await importKekFromRaw(ds);
      const dsWrap = await wrapDataKeyWithKek(sec.getDataKey(), dsKek);
      store.set(BIO_KEY, JSON.stringify({ v: 3, id: b64(cred.rawId), dsWrap, ds: b64(ds) }));
      toast('ورود با اثر انگشت فعال شد ✓');
      return true;
    }
    store.set(BIO_KEY, b64(cred.rawId));
    toast('ورود با اثر انگشت فعال شد');
    return true;
  } catch (e) {
    if (window.__capLog) window.__capLog('enableBiometric', e);
    const name = (e && e.name) || '';
    if (name === 'NotAllowedError') toast('اجازهٔ اثر انگشت داده نشد یا زمان تمام شد');
    else if (name === 'NotSupportedError') toast('این دستگاه این نوع اثر انگشت را پشتیبانی نمی‌کند');
    else if (name === 'SecurityError') toast('این آدرس اجازهٔ اثر انگشت ندارد (باید https باشد)');
    else if (name === 'InvalidStateError') toast('قبلاً روی این دستگاه ثبت شده؛ اول خاموشش کن و دوباره فعال کن');
    else toast('فعال‌سازی اثر انگشت انجام نشد (' + (name || (e && e.message) || '?') + ')');
    return false;
  }
}

export function disableBiometric() {
  store.set(BIO_KEY, '');
  toast('اثر انگشت خاموش شد');
}

// وقتی کلید داده عوض می‌شود (یکی‌کردن دو دستگاه) رکورد اثر انگشت بی‌اعتبار است
export function clearBioRecord() {
  store.set(BIO_KEY, '');
}

export function hasBiometric() {
  return !!readBioRecord();
}

// نتیجه: {ok} در حالت قدیمی؛ {ok, state} در حالت رمزشده
export async function tryBiometric() {
  const rec = readBioRecord();
  if (!rec || !bioAvailable()) return { ok: false };
  try {
    const publicKey = {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ type: 'public-key', id: unb64(rec.id) }],
      userVerification: 'required',
      timeout: 45000,
    };
    if (rec.v === 2 && sec.isEncrypted()) {
      publicKey.extensions = { prf: { eval: { first: unb64(rec.prf) } } };
    }
    let cred;
    try {
      cred = await navigator.credentials.get({ publicKey });
    } catch (e) {
      if (window.__capLog) window.__capLog('tryBiometric:get', e);
      return { ok: false, err: (e && e.name) || 'get' };
    }
    if (!cred) return { ok: false };
    if (sec.isEncrypted() && rec.v >= 2) {
      // ۱) اتصال قوی با PRF
      if (rec.v === 2) {
        let ext = null;
        try {
          ext = cred.getClientExtensionResults();
        } catch (e) {}
        const first = ext && ext.prf && ext.prf.results && ext.prf.results.first;
        if (first) {
          try {
            const kek = await importKekFromRaw(new Uint8Array(first));
            const key = await unwrapDataKeyWithKek(rec.wrap, kek);
            return { ok: true, state: await sec.unlockWithKey(key) };
          } catch (e) {
            if (window.__capLog) window.__capLog('tryBiometric:prf', e);
          }
        }
      }
      // ۲) کلید پشتیبان محلی — ورود تک‌لمسی مثل بقیهٔ اپ‌ها
      if (rec.dsWrap && rec.ds) {
        try {
          const kek = await importKekFromRaw(unb64(rec.ds));
          const key = await unwrapDataKeyWithKek(rec.dsWrap, kek);
          return { ok: true, state: await sec.unlockWithKey(key) };
        } catch (e) {
          if (window.__capLog) window.__capLog('tryBiometric:ds', e);
          // رکورد با کلید قدیمی (بعد از بازیابی/ادغام) — دیگر باز نمی‌کند؛ پاکش می‌کنیم
          store.set(BIO_KEY, '');
          return { ok: true, stale: true };
        }
      }
      return { ok: true, gateOnly: true };
    }
    if (sec.isEncrypted()) {
      // رکورد قدیمی: اولین فرصت که نشست باز بود ارتقا می‌دهیم
      if (sec.isUnlocked()) upgradeBioRecord();
      return { ok: true, gateOnly: true };
    }
    return { ok: !!cred };
  } catch (e) {
    if (window.__capLog) window.__capLog('tryBiometric', e);
    return { ok: false, err: (e && e.name) || 'unknown' };
  }
}

// ارتقای رکوردهای قدیمی اثر انگشت به حالت تک‌لمسی (بدون نیاز به ثبت دوباره)
export async function upgradeBioRecord() {
  try {
    const rec = readBioRecord();
    if (!rec || !sec.isEncrypted() || !sec.isUnlocked()) return;
    if (rec.v === 1 || (rec.v === 2 && !rec.dsWrap)) {
      const ds = randBytes(32);
      const kek = await importKekFromRaw(ds);
      const dsWrap = await wrapDataKeyWithKek(sec.getDataKey(), kek);
      const next =
        rec.v === 2
          ? Object.assign({}, rec, { dsWrap, ds: b64(ds) })
          : { v: 3, id: rec.id, dsWrap, ds: b64(ds) };
      store.set(BIO_KEY, JSON.stringify(next));
    }
  } catch (e) {
    if (window.__capLog) window.__capLog('upgradeBioRecord', e);
  }
}

let bioBusy = false;
export async function bioUnlock(auto) {
  if (bioBusy) return;
  bioBusy = true;
  let res;
  try {
    res = await tryBiometric();
  } finally {
    bioBusy = false;
  }
  if (!res || !res.ok) {
    if (auto && res && res.err === 'NotAllowedError') {
      // کاربر لغو کرد؛ بی‌صدا به رمز عبور برمی‌گردیم
      const inp = document.getElementById('lockPin');
      if (inp) inp.focus();
      return;
    }
    if (res && res.sensorOk) {
      toast('اثر انگشت تأیید شد ولی بازکردن داده ناموفق بود');
    } else if (res && res.err === 'NotAllowedError') {
      toast('اثر انگشت تأیید نشد');
    } else {
      toast('اثر انگشت تأیید نشد' + (res && res.err ? ' (' + res.err + ')' : ''));
    }
    return;
  }
  if (res.state) {
    finalizeUnlock(res.state);
    return;
  }
  if (res.stale) {
    setLockMode('pass');
    toast('اثر انگشت با کلید قدیمی ثبت شده بود؛ با رمز عبور وارد شو و دوباره فعالش کن');
    return;
  }
  if (res.gateOnly && sec.isEncrypted()) {
    if (sec.isUnlocked()) {
      // نشست هنوز کلید را در حافظه دارد؛ فقط صفحه باز می‌شود
      unlockApp();
      return;
    }
    openModal(`
      <button class="x" onclick="closeModal()" aria-label="بستن">${icon('x')}</button>
      <div style="text-align:center;padding:6px 2px">
        <div style="font-size:34px;margin-bottom:8px">👆</div>
        <p style="margin:0 0 14px">اثر انگشت تأیید شد، ولی این مرورگر نمی‌تواند داده‌ها را مستقیم با آن باز کند.<br>پین یا رمز عبور را وارد کن.</p>
        <button class="btn primary block" onclick="closeModal();document.getElementById('lockPin').focus()">باشه</button>
      </div>`);
    return;
  }
  unlockApp();
}

// ─── صفحهٔ قفل: دو حالت پین / رمز عبور ─────────────────────────────────────
let lockMode = 'pin';
let pinFailCount = 0;

export function getLockMode() {
  return lockMode;
}

export function setLockMode(mode, sub) {
  lockMode = mode;
  const title = document.getElementById('lockTitle');
  const lbl = document.getElementById('lockSub');
  const inp = document.getElementById('lockPin');
  const bio = document.getElementById('lockBio');
  if (title) title.textContent = mode === 'pass' ? 'بازکردن داده‌ها' : 'ورود به برنامه';
  if (lbl)
    lbl.textContent =
      sub ||
      (mode === 'pass'
        ? 'رمز عبور را وارد کن (در همهٔ دستگاه‌هایت یکسان است)'
        : 'رمز را وارد کن');
  if (inp) {
    inp.value = '';
    inp.placeholder = mode === 'pass' ? 'رمز عبور' : 'پین';
    inp.maxLength = mode === 'pass' ? 64 : 8;
    inp.setAttribute('inputmode', mode === 'pass' ? 'text' : 'numeric');
    inp.setAttribute('pattern', mode === 'pass' ? '.*' : '[0-9]*');
  }
  if (bio) bio.style.display = hasBiometric() && (sec.isEncrypted() || hasPin()) ? '' : 'none';
  const forgot = document.getElementById('lockForgot');
  if (forgot) forgot.style.display = sec.isEncrypted() ? '' : 'none';
  const sw = document.getElementById('lockSwitch');
  if (sw) {
    sw.style.display = 'none';
  }
}

export function toggleLockMode() {
  pinFailCount = 0;
  if (lockMode === 'pin') setLockMode('pass');
  else if (hasPin()) setLockMode('pin');
  const inp = document.getElementById('lockPin');
  if (inp) inp.focus();
}

export function unlockApp() {
  const lock = document.getElementById('lockScreen');
  if (lock) lock.classList.remove('show');
  document.documentElement.classList.remove('needs-lock');
  document.body.classList.remove('locked');
  const pin = document.getElementById('lockPin');
  if (pin) pin.value = '';
}

export function lockApp() {
  if (sec.isEncrypted()) {
    // همیشه می‌توان قفل کرد؛ حالت از قبل تعیین شده
    // اگر به گوگل وصلیم، همان ابتدا کلیدهای احتمالاً جدید را می‌گیریم تا رمز جدید از اول قبول شود
    import('./sync.js')
      .then((sync) => {
        if (!sync.isGoogleLinked()) return;
        const dbg = document.getElementById('lockDebug');
        if (dbg) {
          dbg.style.color = 'var(--muted)';
          dbg.textContent = 'در حال همگام‌سازی با گوگل…';
        }
        sync.pullRemoteWrapsNow((changed) => {
          if (dbg && dbg.textContent === 'در حال همگام‌سازی با گوگل…') dbg.textContent = '';
          if (changed) toast('رمز عبور جدید از دستگاه دیگر دریافت شد ✓');
        });
      })
      .catch(() => {});
  } else if (!hasPin()) {
    return;
  }
  const lock = document.getElementById('lockScreen');
  const pin = document.getElementById('lockPin');
  if (pin) pin.value = '';
  document.documentElement.classList.add('needs-lock');
  document.body.classList.add('locked');
  if (lock) lock.classList.add('show');
  const bioBtn = document.getElementById('lockBio');
  const bioOn = hasBiometric() && (sec.isEncrypted() || hasPin());
  if (bioBtn) bioBtn.style.display = bioOn ? '' : 'none';
  if (bioOn && document.visibilityState === 'visible') {
    // مثل بقیهٔ اپ‌ها: خودکار اثر انگشت را می‌پرسد؛ اگر کاربر لغو کند، رمز عبور می‌ماند
    autoBioPrompt();
  } else {
    setTimeout(() => {
      if (pin) pin.focus();
    }, 80);
  }
}

let autoBioAt = 0;
function autoBioPrompt() {
  if (Date.now() - autoBioAt < 1500) return;
  autoBioAt = Date.now();
  setTimeout(() => {
    if (!document.body.classList.contains('locked')) return;
    bioUnlock(true);
  }, 250);
}

export function showLockForRemote() {
  setLockMode('pass', 'رمز عبور را وارد کن تا داده‌ها از گوگل باز شود (در همهٔ دستگاه‌ها یکسان است)');
  lockApp();
}

function finalizeUnlock(st) {
  replaceState(st);
  pinFailCount = 0;
  render();
  unlockApp();
  upgradeBioRecord();
  document.dispatchEvent(new CustomEvent('cap:unlocked'));
}

export async function submitLockPin() {
  const inp = document.getElementById('lockPin');
  const val = String((inp && inp.value) || '').trim();
  if (!val) {
    toast(lockMode === 'pass' ? 'اول رمز عبور را بنویس' : 'اول رمز را بنویس');
    return;
  }
  if (sec.isEncrypted()) {
    const btn = document.querySelector('#lockScreen .btn.primary');
    const setBusy = (b, txt) => {
      if (btn) {
        btn.disabled = b;
        btn.textContent = txt || 'ورود';
      }
    };
    try {
      const st = await sec.unlock(val, 'pass');
      finalizeUnlock(st);
      return;
    } catch (e) {}
    // رمز به پاکت محلی نخورد. شاید رمز روی دستگاه دیگر عوض شده و این دستگاه هنوز
    // کلیدهای جدید را از گوگل نگرفته؛ همین حالا می‌گیریم و دوباره امتحان می‌کنیم
    let retried = false;
    try {
      const sync = await import('./sync.js');
      if (sync.isGoogleLinked()) {
        setBusy(true, 'بررسی رمز جدید از گوگل…');
        const changed = await new Promise((res) => sync.pullRemoteWrapsNow(res));
        if (changed) {
          retried = true;
          const st = await sec.unlock(val, 'pass');
          setBusy(false);
          finalizeUnlock(st);
          toast('رمز جدید از دستگاه دیگر دریافت شد ✓');
          return;
        }
      }
    } catch (e) {
      if (window.__capLog) window.__capLog('lock:remoteRetry', e);
    }
    setBusy(false);
    pinFailCount++;
    toast(retried ? 'رمز عبور اشتباه است' : 'رمز عبور اشتباه است' + (pinFailCount >= 2 ? ' — اگر تازه روی دستگاه دیگر عوضش کرده‌ای، چند ثانیه صبر کن و دوباره بزن' : ''));
    if (inp) {
      inp.value = '';
      inp.focus();
    }
    return;
  }
  if (await checkPin(val)) unlockApp();
  else toast('رمز اشتباه است');
}

// ─── فراموشی رمز عبور: بازیابی با عبارت بازیابی ───────────────────────────
let recPhraseValue = '';

export function startPhraseRecovery() {
  recPhraseValue = '';
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="بستن">${icon('x')}</button>
    <h2>بازیابی با عبارت بازیابی</h2>
    <p class="small muted">آن ${PHRASE_WORDS} کلمه را که روی کاغذ نوشتی به ترتیب وارد کن.</p>
    <div class="field"><label>عبارت بازیابی</label>
      <input class="input" id="recPhrase" dir="ltr" autocomplete="off" placeholder="word word word …" style="text-align:left">
    </div>
    <div id="recErr" class="hint" style="display:none;color:#fb7185"></div>
    <button class="btn primary block" style="margin-top:12px" onclick="recoveryStep2()">ادامه</button>
  `);
}

export async function recoveryStep2() {
  const inp = document.getElementById('recPhrase');
  const val = (inp && inp.value) || '';
  const unknown = phraseUnknownWords(val);
  const err = document.getElementById('recErr');
  if (!phraseValid(val)) {
    if (err) {
      err.style.display = '';
      err.textContent = unknown.length
        ? 'این کلمه‌ها در فهرست نیستند: ' + unknown.join('، ')
        : 'باید دقیقاً ' + PHRASE_WORDS + ' کلمهٔ درست وارد کنی.';
    }
    return;
  }
  // عبارت واقعاً با کلید داده امتحان می‌شود، نه فقط از نظر املایی
  try {
    await sec.verifyPhrase(val);
  } catch (e) {
    if (window.__capLog) window.__capLog('recoveryStep2', e);
    if (err) {
      err.style.display = '';
      err.textContent = 'این عبارت به داده‌های این دستگاه نمی‌خورد؛ ترتیب و املای کلمه‌ها را دوباره چک کن.';
    }
    return;
  }
  // عبارت برای مرحلهٔ بعد نگه داشته می‌شود چون اینپوت از صفحه می‌رود
  recPhraseValue = normalizePhrase(val).join(' ');
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="بستن">${icon('x')}</button>
    <h2>رمز عبور جدید</h2>
    <p class="small muted">عبارت درست است ✓ حالا یک رمز عبور جدید انتخاب کن (حداقل ۸ نویسه).</p>
    <div class="field"><label>رمز عبور جدید</label>
      <input class="input" id="recPass" type="password" autocomplete="new-password" dir="ltr"></div>
    <div class="field"><label>تکرار رمز عبور</label>
      <input class="input" id="recPass2" type="password" autocomplete="new-password" dir="ltr"></div>
    <div id="recPassErr" class="hint" style="display:none;color:#fb7185"></div>
    <button class="btn primary block" id="recFinishBtn" style="margin-top:12px" onclick="recoveryFinish()">بازکردن داده‌ها</button>
  `);
  setTimeout(() => {
    const p1 = document.getElementById('recPass');
    if (p1) p1.focus();
  }, 60);
}

function recPassError(msg) {
  const err = document.getElementById('recPassErr');
  if (err) {
    err.style.display = '';
    err.textContent = msg;
  }
  toast(msg);
}

export async function recoveryFinish() {
  const phrase = recPhraseValue;
  const a = (document.getElementById('recPass') || {}).value || '';
  const b = (document.getElementById('recPass2') || {}).value || '';
  if (!phrase) {
    startPhraseRecovery();
    return;
  }
  if (a.length < 8) {
    recPassError('رمز عبور حداقل ۸ نویسه باشد');
    return;
  }
  if (a !== b) {
    recPassError('رمزها یکی نیستند');
    return;
  }
  const btn = document.getElementById('recFinishBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'در حال بازکردن…';
  }
  try {
    const st = await sec.recoverWithPhrase(phrase, a);
    recPhraseValue = '';
    closeModal();
    finalizeUnlock(st);
    toast('رمز عبور جدید ذخیره شد ✓');
  } catch (e) {
    if (window.__capLog) window.__capLog('recoveryFinish', e);
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'بازکردن داده‌ها';
    }
    recPassError('بازیابی انجام نشد: ' + ((e && e.message) || e));
  }
}

// ─── جادوگر فعال‌کردن رمزنگاری ─────────────────────────────────────────────
let wizPass = '';
let wizPhrase = '';
let wizCheckA = 0;
let wizCheckB = 0;

export function openEncryptSetup() {
  const legacyPin = !sec.isEncrypted() && !!store.get(PIN_KEY);
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="بستن">${icon('x')}</button>
    <h2>🔐 فعال‌کردن رمزنگاری</h2>
    <p class="small muted">از این پس داده‌ها چه روی گوشی چه در گوگل‌درایو فقط با کلید تو خوانده می‌شوند.
    یک <b>رمز عبور</b> انتخاب کن؛ کلید اصلی داده‌های توست.</p>
    <div class="field"><label>رمز عبور (حداقل ۸ نویسه)</label>
      <input class="input" id="encPass" type="password" autocomplete="new-password" dir="ltr"></div>
    <div class="field"><label>تکرار رمز عبور</label>
      <input class="input" id="encPass2" type="password" autocomplete="new-password" dir="ltr"></div>
    ${
      legacyPin
        ? '<div class="field"><label>پین فعلی‌ات (برای انتقال به سیستم جدید)</label><input class="input" id="encOldPin" inputmode="numeric" dir="ltr"></div>'
        : ''
    }
    <div class="hint">⚠️ اگر این رمز فراموش شود و عبارت بازیابی هم نباشد، داده‌ها قابل بازگشت نیستند.</div>
    <button class="btn primary block" style="margin-top:12px" onclick="encryptStep2()">ادامه</button>
  `);
}

export async function encryptStep2() {
  const a = (document.getElementById('encPass') || {}).value || '';
  const b = (document.getElementById('encPass2') || {}).value || '';
  if (a.length < 8) {
    toast('رمز عبور حداقل ۸ نویسه باشد');
    return;
  }
  if (a !== b) {
    toast('رمزها یکی نیستند');
    return;
  }
  wizPass = a;
  wizPhrase = newRecoveryPhrase();
  const words = wizPhrase.split(' ');
  const idxs = [...Array(words.length).keys()];
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  wizCheckA = idxs[0];
  wizCheckB = idxs[1];
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="بستن">${icon('x')}</button>
    <h2>📜 عبارت بازیابی</h2>
    <p class="small muted">این ${PHRASE_WORDS} کلمه را <b>روی کاغذ یادداشت کن</b> و جای امن بگذار.
    اگر رمز عبور را فراموش کنی، فقط با این عبارت می‌توانی داده‌ها را پس بگیری.</p>
    <div class="phrase-grid" dir="ltr">
      ${words.map((w, i) => `<span class="phrase-w"><b>${i + 1}</b> ${esc(w)}</span>`).join('')}
    </div>
    <div class="field" style="margin-top:14px"><label>برای اطمینان: کلمهٔ شمارهٔ ${wizCheckA + 1}؟</label>
      <input class="input" id="wizChkA" dir="ltr" autocomplete="off" style="text-align:left"></div>
    <div class="field"><label>کلمهٔ شمارهٔ ${wizCheckB + 1}؟</label>
      <input class="input" id="wizChkB" dir="ltr" autocomplete="off" style="text-align:left"></div>
    <div class="hint">اسکرین‌شات نگیر؛ فقط کاغذ.</div>
    <button class="btn primary block" style="margin-top:12px" onclick="encryptStep3()">فعال کن</button>
  `);
}

export function encryptStep3() {
  const words = wizPhrase.split(' ');
  const ca = String((document.getElementById('wizChkA') || {}).value || '').trim().toLowerCase();
  const cb = String((document.getElementById('wizChkB') || {}).value || '').trim().toLowerCase();
  if (ca !== words[wizCheckA] || cb !== words[wizCheckB]) {
    toast('کلمه‌ها را درست یادداشت نکردی؛ دوباره نگاه کن');
    return;
  }
  return encryptFinish(true);
}

export async function encryptFinish() {
  const pin = null;
  try {
    await sec.enableEncryption(state, wizPass, wizPhrase, pin);
    store.set(LEGACY_DATA_KEY, '');
    store.set(PIN_KEY, '');
    wizPass = '';
    wizPhrase = '';
    closeModal();
    setLockMode('pass');
    render();
    toast('رمزنگاری فعال شد 🔐');
    document.dispatchEvent(new CustomEvent('cap:encrypt-on'));
  } catch (e) {
    if (window.__capLog) window.__capLog('فعال‌سازی رمزنگاری', e);
    toast('مشکلی پیش آمد؛ دوباره تلاش کن');
  }
}

// پین در حالت رمزنگاری حذف شده؛ این دو تابع برای سازگاری با app.js می‌مانند
export function openPinRestoreModal() {}
export async function savePinRestore() {}

// ─── تغییر رمز عبور / عبارت بازیابی جدید ───────────────────────────────────
export function changePassPrompt() {
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="بستن">${icon('x')}</button>
    <h2>تغییر رمز عبور</h2>
    <div class="field"><label>رمز عبور فعلی</label>
      <input class="input" id="cpOld" type="password" autocomplete="off" dir="ltr"></div>
    <div class="field"><label>رمز عبور جدید (حداقل ۸ نویسه)</label>
      <input class="input" id="cpNew" type="password" autocomplete="new-password" dir="ltr"></div>
    <div class="field"><label>تکرار رمز عبور جدید</label>
      <input class="input" id="cpNew2" type="password" autocomplete="new-password" dir="ltr"></div>
    <button class="btn primary block" style="margin-top:12px" onclick="changePassDo()">ذخیره</button>
  `);
}

export async function changePassDo() {
  const old = String((document.getElementById('cpOld') || {}).value || '');
  const a = String((document.getElementById('cpNew') || {}).value || '');
  const b = String((document.getElementById('cpNew2') || {}).value || '');
  if (a.length < 8) {
    toast('رمز عبور حداقل ۸ نویسه باشد');
    return;
  }
  if (a !== b) {
    toast('رمزها یکی نیستند');
    return;
  }
  try {
    await sec.changePassphrase(old, a);
    closeModal();
    openSettings();
    toast('رمز عبور عوض شد ✓');
  } catch (e) {
    toast('رمز عبور فعلی اشتباه است');
  }
}

export async function rotatePhrasePrompt() {
  const phrase = newRecoveryPhrase();
  const ok = await sec.replacePhraseWrap(phrase);
  if (!ok) return;
  const words = phrase.split(' ');
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="بستن">${icon('x')}</button>
    <h2>📜 عبارت بازیابی جدید</h2>
    <p class="small muted">عبارت قبلی باطل شد. این یکی را روی کاغذ بنویس و جای قبلی جایگزین کن.</p>
    <div class="phrase-grid" dir="ltr">
      ${words.map((w, i) => `<span class="phrase-w"><b>${i + 1}</b> ${esc(w)}</span>`).join('')}
    </div>
    <button class="btn primary block" style="margin-top:14px" onclick="closeModal()">نوشتم ✓</button>
  `);
}

// ─── تنظیمات ───────────────────────────────────────────────────────────────
// ─── تنظیمات: منوی اصلی + زیرصفحه‌ها (سبک تلگرام) ──────────────────────────
function settingsRow(ic, color, title, sub, onclick, extra) {
  const glyph = hasIcon(ic) ? icon(ic) : ic;
  return `<button type="button" class="srow" onclick="${onclick}">
    <span class="sic" style="background:${color}">${glyph}</span>
    <span class="smid"><span class="st1">${title}</span>${sub ? `<span class="st2">${sub}</span>` : ''}</span>
    ${extra ? `<span class="sval">${extra}</span>` : ''}
    <span class="schev">${icon('chevL')}</span>
  </button>`;
}

function settingsHeader(title, back) {
  return back
    ? `<button class="x" onclick="closeModal()" aria-label="بستن">${icon('x')}</button>
       <button type="button" class="sback" onclick="${back}">${icon('chevR')} بازگشت</button>
       <h2 style="margin-top:6px">${title}</h2>`
    : `<button class="x" onclick="closeModal()" aria-label="بستن">${icon('x')}</button><h2>${title}</h2>`;
}

export function openSettings() {
  const enc = sec.isEncrypted();
  const bioOn = hasBiometric();
  const u = googleUserFromStore();
  const theme = THEMES.find((t) => t.id === currentTheme()) || THEMES[0];
  const gemini = !!store.get('capital_gemini_key');
  openModal(`
    ${settingsHeader('تنظیمات')}
    <div class="sgroup">
      ${settingsRow('palette', '#8b5cf6', 'ظاهر', 'تم و رنگ برنامه', 'openSettingsAppearance()', theme.name)}
    </div>
    <div class="sgroup">
      ${settingsRow(
        'shield',
        enc ? '#22c55e' : '#f59e0b',
        'امنیت و حریم خصوصی',
        enc ? 'رمزنگاری فعال · ' + (bioOn ? 'اثر انگشت روشن' : 'اثر انگشت خاموش') : 'رمزنگاری غیرفعال',
        'openSettingsSecurity()'
      )}
      ${settingsRow(
        'cloud',
        '#3d8bfd',
        'گوگل درایو',
        u ? esc(u.email || u.name || 'متصل') : 'همگام‌سازی بین دستگاه‌ها',
        'openSettingsGoogle()',
        u ? '' : 'خاموش'
      )}
    </div>
    <div class="sgroup">
      ${settingsRow('coin', '#0ea5e9', 'نرخ ارز', ratesSummary(), 'openSettingsRates()')}
      ${settingsRow('receipt', '#f97316', 'خواندن فاکتور از عکس', 'کلید هوش مصنوعی گوگل', 'openSettingsScan()', gemini ? 'فعال' : 'خاموش')}
      ${settingsRow('info', '#64748b', 'دربارهٔ برنامه', 'نسخه ' + APP_VERSION, 'openSettingsAbout()')}
    </div>
  `);
}

export function openSettingsAppearance() {
  const theme = currentTheme();
  openModal(`
    ${settingsHeader('🎨 ظاهر', 'openSettings()')}
    <h3 style="margin:8px 0 10px">تم</h3>
    <div class="theme-grid">
      ${THEMES.map(
        (t) => `<button type="button" class="theme-swatch ${theme === t.id ? 'on' : ''}" onclick="applyTheme('${t.id}');openSettingsAppearance()">
        <span class="theme-dot" style="background:linear-gradient(135deg,${t.c1},${t.c2})"></span>
        ${t.name}
      </button>`
      ).join('')}
    </div>
  `);
}

export function openSettingsSecurity() {
  const enc = sec.isEncrypted();
  const pinOn = hasPin();
  const bioOn = hasBiometric();
  const bioOk = bioAvailable();
  let body = '';
  if (enc) {
    body += `
    <div class="sgroup">
      <div class="hint">✅ رمزنگاری فعال است — داده‌ها روی گوشی و گوگل‌درایو رمزشده‌اند و فقط با رمز عبور تو باز می‌شوند.</div>
      ${settingsRow('key', '#3d8bfd', 'تغییر رمز عبور', 'روی همهٔ دستگاه‌ها اعمال می‌شود', 'changePassPrompt()')}
      ${settingsRow('scroll', '#a78bfa', 'عبارت بازیابی جدید', 'اگر کاغذ قبلی گم شده', 'rotatePhrasePrompt()')}
    </div>
    <div class="sgroup">
      ${
        bioOk
          ? settingsRow(
              'finger',
              bioOn ? '#22c55e' : '#64748b',
              'ورود با اثر انگشت',
              bioOn ? 'روشن · فقط روی همین دستگاه' : 'خاموش · ورود سریع بدون رمز',
              bioOn ? 'disableBiometric();openSettingsSecurity()' : 'enableBiometric().then(()=>openSettingsSecurity())',
              bioOn ? 'روشن' : 'خاموش'
            )
          : '<div class="hint">اثر انگشت روی این آدرس در دسترس نیست (https لازم است).</div>'
      }
      ${settingsRow('lock', '#ef4444', 'قفل کردن همین حالا', 'برای بازکردن رمز یا اثر انگشت لازم است', 'closeModal();lockApp()')}
    </div>`;
  } else {
    body += `
    <div class="sgroup">
      <div class="hint">⚠️ داده‌هایت هنوز به‌صورت ساده ذخیره می‌شوند. با فعال‌کردن رمزنگاری، حتی در گوگل‌درایو هم خواندنی نخواهند بود.</div>
      ${settingsRow('shield', '#22c55e', 'فعال‌کردن رمزنگاری', 'رمز عبور + عبارت بازیابی', 'openEncryptSetup()')}
    </div>
    <div class="sgroup">
      ${
        pinOn
          ? settingsRow('key', '#3d8bfd', 'تغییر رمز ورود', '', 'changePinPrompt()') +
            settingsRow('trash', '#ef4444', 'حذف قفل', '', 'clearPin();openSettingsSecurity()')
          : settingsRow('key', '#3d8bfd', 'فعال‌کردن رمز ورود', 'قفل ساده برای ورود', 'changePinPrompt()')
      }
      ${
        pinOn && bioOk
          ? settingsRow(
              'finger',
              bioOn ? '#22c55e' : '#64748b',
              'ورود با اثر انگشت',
              '',
              bioOn ? 'disableBiometric();openSettingsSecurity()' : 'enableBiometric().then(()=>openSettingsSecurity())',
              bioOn ? 'روشن' : 'خاموش'
            )
          : ''
      }
    </div>`;
  }
  openModal(`${settingsHeader('🔐 امنیت و حریم خصوصی', 'openSettings()')}${body}`);
}

export function openSettingsGoogle() {
  const u = googleUserFromStore();
  let body;
  if (!u) {
    body = `
    <div class="hint" style="margin:0 0 12px">با حساب گوگل وارد شو تا داده‌هایت خودکار در Google Drive ذخیره شود و از هر دستگاهی در دسترس باشد.${
      sec.isEncrypted() ? ' داده‌ها رمزشده می‌روند؛ گوگل نمی‌تواند بخواندشان.' : ''
    }</div>
    <button class="btn primary block" onclick="closeModal();googleSignIn()">ورود با گوگل</button>`;
  } else {
    body = `
    <div class="sgroup">
      <div class="srow" style="cursor:default">
        <span class="sic" style="background:#3d8bfd">${icon('cloud')}</span>
        <span class="smid"><span class="st1">${esc(u.name || 'حساب گوگل')}</span>${u.email ? `<span class="st2">${esc(u.email)}</span>` : ''}</span>
      </div>
    </div>
    <div class="sgroup">
      ${settingsRow('cloudUp', '#22c55e', 'الان در گوگل ذخیره کن', 'ارسال نسخهٔ این دستگاه', 'closeModal();pushToDrive(true)')}
      ${settingsRow('cloudDown', '#3d8bfd', 'دریافت از گوگل', 'گرفتن آخرین نسخه', "closeModal();loadFromDrive(function(){render();toast('دریافت از گوگل انجام شد ✓');},true)")}
    </div>
    <div class="sgroup">
      ${settingsRow('logout', '#ef4444', 'خروج از حساب گوگل', 'همگام‌سازی متوقف می‌شود', 'closeModal();googleSignOut()')}
    </div>`;
  }
  openModal(`${settingsHeader('☁️ گوگل درایو', 'openSettings()')}${body}`);
}

// ─── نرخ ارز ───
function usedCurrencies() {
  const used = new Set();
  for (const a of state.accounts) if (a.currency && a.currency !== 'تومان') used.add(a.currency);
  for (const i of state.investments || []) if (i.currency && i.currency !== 'تومان') used.add(i.currency);
  for (const c of Object.keys(state.rates || {})) used.add(c);
  return [...used];
}
function ratesSummary() {
  const used = usedCurrencies();
  if (!used.length) return 'برای حساب‌ها و دارایی‌های ارزی';
  const missing = used.filter((c) => !rateOf(c));
  return missing.length ? 'نرخ ' + missing.join('، ') + ' ثبت نشده' : used.map((c) => c + ' ' + toFaNum(rateOf(c))).join(' · ');
}
function toFaNum(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
}
export function openSettingsRates() {
  const used = usedCurrencies();
  const others = allCurrencies().filter((c) => c !== 'تومان' && !used.includes(c));
  const row = (c) => `<div class="srow" style="cursor:default">
      <span class="sic" style="background:${rateOf(c) ? '#0ea5e9' : '#f59e0b'}">${icon('coin')}</span>
      <span class="smid"><span class="st1">${esc(c)}</span><span class="st2">${rateOf(c) ? 'هر واحد ' + toFaNum(rateOf(c)) + ' تومان' : 'ثبت نشده'}</span></span>
      <input class="input" style="width:130px;min-height:38px;text-align:left;direction:ltr" id="rate_${esc(c)}" type="number" step="any" inputmode="decimal" value="${state.rates[c] || ''}" placeholder="تومان" onchange="saveRateFrom('${esc(c)}')">
    </div>`;
  openModal(`
    ${settingsHeader('نرخ ارز', 'openSettings()')}
    <p class="small muted">تومان به ازای هر واحد. فقط برای محاسبهٔ ارزش تومانیِ حساب‌ها، دارایی‌ها و طلب/بدهی‌های ارزی استفاده می‌شود؛ نرخ هر انتقال را موقع همان انتقال جدا وارد می‌کنی.</p>
    ${used.length ? `<div class="sgroup">${used.map(row).join('')}</div>` : '<div class="hint">هنوز حساب یا دارایی ارزی نداری.</div>'}
    ${others.length ? `<h3 class="muted" style="margin:14px 0 6px">سایر واحدها</h3><div class="sgroup">${others.map(row).join('')}</div>` : ''}
  `);
}

export function openSettingsScan() {
  const has = !!store.get('capital_gemini_key');
  openModal(`
    ${settingsHeader('🧾 خواندن فاکتور از عکس', 'openSettings()')}
    <p class="small muted">کلید Google AI Studio را این‌جا بگذار. به کسی نشان نده. عکس برای خواندن به گوگل فرستاده می‌شود.</p>
    <p><a class="btn block" href="${geminiHelpHref()}" target="_blank" rel="noopener">چطور کلید بگیرم؟</a></p>
    ${
      has
        ? `<div class="hint" style="margin:10px 0">✅ کلید ذخیره شده است.</div>
           <button class="btn danger block" onclick="clearGeminiKey()">حذف کلید</button>`
        : `<div class="field" style="margin-top:12px"><label>کلید API</label>
           <input class="input" id="geminiKey" type="password" autocomplete="off" placeholder="AIza...">
           </div>
           <button class="btn primary block" onclick="saveGeminiKey()">ذخیره کلید</button>`
    }
  `);
}

export function openSettingsAbout() {
  openModal(`
    ${settingsHeader('ℹ️ دربارهٔ برنامه', 'openSettings()')}
    <div style="text-align:center;padding:10px 0 4px">
      <div class="logo" style="margin:0 auto 10px">${icon('wallet')}</div>
      <div style="font-weight:800;font-size:16px">مدیریت سرمایه</div>
      <div class="small muted" style="margin-top:4px">نسخه ${APP_VERSION}</div>
    </div>
    <div class="sgroup" style="margin-top:14px">
      <div class="hint">روش پاکت‌ها: ضروریات ۶۰٪ · سرمایه‌گذاری ۲۰٪ · تفریح ۱۵٪ · نیکوکاری ۵٪ — به‌علاوهٔ «هدررفت» برای صداقت با خودت و «قرض / امانت» که خارج از بودجه است.</div>
    </div>
  `);
}

function googleUserFromStore() {
  try {
    const raw = store.get('g_user');
    if (!raw) return null;
    const u = JSON.parse(raw);
    return u && (u.name || u.email) ? u : null;
  } catch (e) {
    return null;
  }
}

export function changePinPrompt() {
  const digits = sec.isEncrypted() ? '۶ تا ۸ رقم' : '۴ تا ۸ رقم';
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="بستن">${icon('x')}</button>
    <h2>${sec.isEncrypted() ? 'پین' : 'رمز'} جدید</h2>
    <div class="field"><label>پین جدید (${digits})</label>
      <input class="input" id="pinNew" inputmode="numeric" maxlength="8" dir="ltr" style="text-align:center"></div>
    <div class="field"><label>تکرار پین</label>
      <input class="input" id="pinNew2" inputmode="numeric" maxlength="8" dir="ltr" style="text-align:center"></div>
    <button class="btn primary block" style="margin-top:12px" onclick="changePinDo()">ذخیره</button>
  `);
}

export async function changePinDo() {
  const a = String((document.getElementById('pinNew') || {}).value || '').trim();
  const b = String((document.getElementById('pinNew2') || {}).value || '').trim();
  if (a !== b) {
    toast('پین‌ها یکی نیستند');
    return;
  }
  if (await setPin(a)) {
    closeModal();
    openSettings();
  }
}

export function initPrefs() {
  applyTheme(currentTheme());
  syncPrivacyBtn();
  const priv = document.getElementById('btnPrivacy');
  const set = document.getElementById('btnSettings');
  if (priv) priv.onclick = togglePrivacy;
  if (set) set.onclick = openSettings;
  const pinInp = document.getElementById('lockPin');
  if (pinInp)
    pinInp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitLockPin();
    });
  const forgot = document.getElementById('lockForgot');
  if (forgot) forgot.onclick = () => startPhraseRecovery();
  const sw = document.getElementById('lockSwitch');
  if (sw) sw.onclick = () => toggleLockMode();
  if (sec.isEncrypted()) {
    sec.removePinWrap(); // پاک‌سازی پین‌های قدیمی
    setLockMode('pass');
    lockApp();
  } else if (hasPin()) {
    setLockMode('pin');
    lockApp();
  } else {
    unlockApp();
  }
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if ((sec.isEncrypted() || hasPin()) && hiddenAt && Date.now() - hiddenAt > 45000)
      lockApp();
  });
}
