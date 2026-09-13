import { esc, store, toast, isMoneyHidden, setMoneyHidden, APP_VERSION } from './utils.js';
import { saveGeminiKey, clearGeminiKey } from './scan.js';
import { openModal, closeModal } from './modal.js';
import { render } from './view.js';
import { state, replaceState } from './state.js';
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
  if (btn) btn.textContent = isMoneyHidden() ? '🙈' : '👁';
}

// ─── پین: در حالت رمزشده «کلید» است، در حالت قدیمی فقط هش ─────────────────
export function hasPin() {
  if (sec.isEncrypted()) return sec.hasWrap('pin');
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
      return rec && rec.v === 2 ? rec : null;
    } catch (e) {
      return null;
    }
  }
  return { v: 1, id: raw };
}

export async function setPin(pin) {
  if (sec.isEncrypted()) {
    if (!/^\d{6,8}$/.test(pin)) {
      toast('رمز باید ۶ تا ۸ رقم باشد');
      return false;
    }
    const ok = await sec.setPinWrap(pin);
    if (ok) toast('رمز ورود ذخیره شد');
    return ok;
  }
  if (!/^\d{4,8}$/.test(pin)) {
    toast('رمز باید ۴ تا ۸ رقم باشد');
    return false;
  }
  store.set(PIN_KEY, await hashPin(pin));
  toast('رمز ذخیره شد');
  return true;
}

export function clearPin() {
  if (sec.isEncrypted()) {
    sec.removePinWrap();
    setLockMode('pass');
    toast('پین حذف شد؛ از این پس با رمز عبور باز می‌شود');
    return;
  }
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
  const prfInput = crypto.getRandomValues(new Uint8Array(32));
  try {
    const publicKey = {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'مدیریت سرمایه', id: location.hostname },
      user: {
        id: crypto.getRandomValues(new Uint8Array(16)),
        name: 'owner',
        displayName: 'صاحب برنامه',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        // برای PRF روی اندروید لازم است اعتبارنامه مقیم باشد
        residentKey: encrypted ? 'required' : undefined,
        requireResidentKey: encrypted ? true : undefined,
      },
      timeout: 60000,
    };
    if (encrypted) publicKey.extensions = { prf: { eval: { first: prfInput } } };
    let cred;
    try {
      cred = await navigator.credentials.create({ publicKey });
    } catch (e) {
      if (encrypted && (e.name === 'NotSupportedError' || e.name === 'InvalidStateError')) {
        // دستگاه اعتبارنامهٔ مقیم را قبول نکرد؛ بدون آن تلاش می‌کنیم
        delete publicKey.authenticatorSelection.residentKey;
        delete publicKey.authenticatorSelection.requireResidentKey;
        cred = await navigator.credentials.create({ publicKey });
      } else {
        throw e;
      }
    }
    if (!cred) return false;

    if (encrypted) {
      let ext = null;
      try {
        ext = cred.getClientExtensionResults && cred.getClientExtensionResults();
      } catch (e) {}
      const first = ext && ext.prf && ext.prf.results && ext.prf.results.first;
      if (!sec.isUnlocked()) return false;
      // کلید پشتیبان محلی: ورود تک‌لمسی حتی اگر مرورگر PRF ندهد
      const ds = randBytes(32);
      const dsKek = await importKekFromRaw(ds);
      const dsWrap = await wrapDataKeyWithKek(sec.getDataKey(), dsKek);
      if (first) {
        const kek = await importKekFromRaw(new Uint8Array(first));
        const wrap = await wrapDataKeyWithKek(sec.getDataKey(), kek);
        store.set(
          BIO_KEY,
          JSON.stringify({ v: 2, id: b64(cred.rawId), prf: b64(prfInput), wrap, dsWrap, ds: b64(ds) })
        );
      } else {
        store.set(
          BIO_KEY,
          JSON.stringify({ v: 3, id: b64(cred.rawId), dsWrap, ds: b64(ds) })
        );
      }
      toast('ورود با اثر انگشت فعال شد ✓');
      return true;
    }
    store.set(BIO_KEY, b64(cred.rawId));
    toast('ورود با اثر انگشت فعال شد');
    return true;
  } catch (e) {
    if (window.__capLog) window.__capLog('enableBiometric', e);
    const name = (e && e.name) || '';
    if (name === 'NotAllowedError') toast('اجازهٔ اثر انگشت داده نشد');
    else if (name === 'NotSupportedError') toast('این دستگاه این نوع اثر انگشت را پشتیبانی نمی‌کند');
    else toast('فعال‌سازی اثر انگشت انجام نشد (' + name + ')');
    return false;
  }
}

export function disableBiometric() {
  store.set(BIO_KEY, '');
  toast('اثر انگشت خاموش شد');
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

export async function bioUnlock() {
  const res = await tryBiometric();
  if (!res || !res.ok) {
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
  if (res.gateOnly && sec.isEncrypted()) {
    if (sec.isUnlocked()) {
      // نشست هنوز کلید را در حافظه دارد؛ فقط صفحه باز می‌شود
      unlockApp();
      return;
    }
    openModal(`
      <button class="x" onclick="closeModal()">✕</button>
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
        : 'پینِ این گوشی را وارد کن');
  if (inp) {
    inp.value = '';
    inp.placeholder = mode === 'pass' ? 'رمز عبور' : 'پین';
    inp.maxLength = mode === 'pass' ? 64 : 8;
    inp.setAttribute('inputmode', mode === 'pass' ? 'text' : 'numeric');
    inp.setAttribute('pattern', mode === 'pass' ? '.*' : '[0-9]*');
  }
  if (bio) bio.style.display = mode === 'pin' && hasBiometric() && hasPin() ? '' : 'none';
  const forgot = document.getElementById('lockForgot');
  if (forgot) forgot.style.display = sec.isEncrypted() ? '' : 'none';
  const sw = document.getElementById('lockSwitch');
  if (sw) {
    if (!sec.isEncrypted()) sw.style.display = 'none';
    else if (mode === 'pin') {
      sw.style.display = '';
      sw.textContent = 'ورود با رمز عبورِ مشترک';
    } else if (hasPin()) {
      sw.style.display = '';
      sw.textContent = 'بازگشت به پین این گوشی';
    } else {
      sw.style.display = 'none';
    }
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
  if (bioBtn)
    bioBtn.style.display = lockMode === 'pin' && hasBiometric() && hasPin() ? '' : 'none';
  setTimeout(() => {
    if (pin) pin.focus();
  }, 80);
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
    try {
      const st = await sec.unlock(val, lockMode);
      finalizeUnlock(st);
    } catch (e) {
      pinFailCount++;
      if (lockMode === 'pin' && pinFailCount >= 5 && sec.hasWrap('pass')) {
        setLockMode('pass');
        toast('با رمز عبور ادامه بده');
      } else {
        toast(lockMode === 'pass' ? 'رمز عبور اشتباه است' : 'رمز اشتباه است');
      }
      if (inp) {
        inp.value = '';
        inp.focus();
      }
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
    <button class="x" onclick="closeModal()">✕</button>
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
  // عبارت برای مرحلهٔ بعد نگه داشته می‌شود چون اینپوت از صفحه می‌رود
  recPhraseValue = normalizePhrase(val).join(' ');
  openModal(`
    <button class="x" onclick="closeModal()">✕</button>
    <h2>رمز عبور جدید</h2>
    <p class="small muted">عبارت درست است ✓ حالا یک رمز عبور جدید انتخاب کن (حداقل ۸ نویسه).</p>
    <div class="field"><label>رمز عبور جدید</label>
      <input class="input" id="recPass" type="password" autocomplete="new-password" dir="ltr"></div>
    <div class="field"><label>تکرار رمز عبور</label>
      <input class="input" id="recPass2" type="password" autocomplete="new-password" dir="ltr"></div>
    <button class="btn primary block" style="margin-top:12px" onclick="recoveryFinish()">بازکردن داده‌ها</button>
  `);
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
    toast('رمز عبور حداقل ۸ نویسه باشد');
    return;
  }
  if (a !== b) {
    toast('رمزها یکی نیستند');
    return;
  }
  try {
    const st = await sec.recoverWithPhrase(phrase, a);
    recPhraseValue = '';
    closeModal();
    finalizeUnlock(st);
    toast('رمز عبور جدید ذخیره شد ✓');
  } catch (e) {
    if (window.__capLog) window.__capLog('recoveryFinish', e);
    toast('بازیابی انجام نشد؛ دوباره تلاش کن');
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
    <button class="x" onclick="closeModal()">✕</button>
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
    <button class="x" onclick="closeModal()">✕</button>
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
    <button class="btn primary block" style="margin-top:12px" onclick="encryptStep3()">ادامه</button>
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
  openModal(`
    <button class="x" onclick="closeModal()">✕</button>
    <h2>🔢 ورود سریع با پین</h2>
    <p class="small muted">برای بازکردن سریع برنامه روی این گوشی، یک پین ۶ تا ۸ رقمی بگذار.
    این پین فقط روی همین دستگاه کار می‌کند.</p>
    <div class="field"><label>پین جدید</label>
      <input class="input" id="encPinNew" inputmode="numeric" maxlength="8" dir="ltr" style="text-align:center"></div>
    <div class="field"><label>تکرار پین</label>
      <input class="input" id="encPinNew2" inputmode="numeric" maxlength="8" dir="ltr" style="text-align:center"></div>
    <button class="btn primary block" style="margin-top:12px" onclick="encryptFinish()">فعال کن</button>
    <button class="btn block" style="margin-top:8px" onclick="encryptFinish(true)">بی‌خیال پین، فقط رمز عبور</button>
  `);
}

export async function encryptFinish(skipPin) {
  let pin = null;
  if (!skipPin) {
    const p1 = String((document.getElementById('encPinNew') || {}).value || '').trim();
    const p2 = String((document.getElementById('encPinNew2') || {}).value || '').trim();
    if (p1 || p2) {
      if (!/^\d{6,8}$/.test(p1)) {
        toast('پین باید ۶ تا ۸ رقم باشد');
        return;
      }
      if (p1 !== p2) {
        toast('پین‌ها یکی نیستند');
        return;
      }
      pin = p1;
    }
  }
  // پین قدیمی اگر داده شد و درست بود، همان منتقل می‌شود
  const oldPinEl = document.getElementById('encOldPin');
  if (!pin && oldPinEl && oldPinEl.value) {
    const op = String(oldPinEl.value).trim();
    if (await checkPin(op)) pin = op;
    else toast('پین قدیمی درست نبود؛ بدون پین ادامه می‌دهم');
  }
  try {
    await sec.enableEncryption(state, wizPass, wizPhrase, pin);
    store.set(LEGACY_DATA_KEY, '');
    store.set(PIN_KEY, '');
    wizPass = '';
    wizPhrase = '';
    closeModal();
    setLockMode(pin ? 'pin' : 'pass');
    render();
    toast('رمزنگاری فعال شد 🔐');
    document.dispatchEvent(new CustomEvent('cap:encrypt-on'));
  } catch (e) {
    if (window.__capLog) window.__capLog('فعال‌سازی رمزنگاری', e);
    toast('مشکلی پیش آمد؛ دوباره تلاش کن');
  }
}

// ─── پیشنهاد پین بعد از ورود با رمز عبور (مودال، چون prompt در PWA نیست) ──
export function openPinRestoreModal() {
  openModal(`
    <button class="x" onclick="closeModal()">✕</button>
    <h2>🔢 ورود سریع روی این گوشی</h2>
    <p class="small muted">رمز عبور روی همهٔ دستگاه‌ها یکی است، اما پین فقط برای همین گوشی است.
    برای ورود سریع می‌توانی یک پین ۶ تا ۸ رقمی بگذاری.</p>
    <div class="field"><label>پین جدید</label>
      <input class="input" id="pinRestore" inputmode="numeric" maxlength="8" dir="ltr" style="text-align:center"></div>
    <button class="btn primary block" style="margin-top:12px" onclick="savePinRestore()">ذخیره پین</button>
    <button class="btn block" style="margin-top:8px" onclick="closeModal()">فعلاً نه، با رمز عبور ادامه می‌دهم</button>
  `);
}

export async function savePinRestore() {
  const v = String((document.getElementById('pinRestore') || {}).value || '').trim();
  if (!/^\d{6,8}$/.test(v)) {
    toast('پین باید ۶ تا ۸ رقم باشد');
    return;
  }
  const ok = await sec.setPinWrap(v);
  if (ok) {
    closeModal();
    setLockMode('pin');
    toast('پین ذخیره شد ✓');
  }
}

// ─── تغییر رمز عبور / عبارت بازیابی جدید ───────────────────────────────────
export function changePassPrompt() {
  openModal(`
    <button class="x" onclick="closeModal()">✕</button>
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
    <button class="x" onclick="closeModal()">✕</button>
    <h2>📜 عبارت بازیابی جدید</h2>
    <p class="small muted">عبارت قبلی باطل شد. این یکی را روی کاغذ بنویس و جای قبلی جایگزین کن.</p>
    <div class="phrase-grid" dir="ltr">
      ${words.map((w, i) => `<span class="phrase-w"><b>${i + 1}</b> ${esc(w)}</span>`).join('')}
    </div>
    <button class="btn primary block" style="margin-top:14px" onclick="closeModal()">نوشتم ✓</button>
  `);
}

// ─── تنظیمات ───────────────────────────────────────────────────────────────
export function openSettings() {
  const theme = currentTheme();
  const pinOn = hasPin();
  const bioOn = hasBiometric();
  const bioOk = bioAvailable();
  const enc = sec.isEncrypted();
  openModal(`
    <button class="x" onclick="closeModal()">✕</button>
    <h2>تنظیمات</h2>
    <h3 style="margin:8px 0 10px">تم</h3>
    <div class="theme-grid">
      ${THEMES.map(
        (t) => `<button type="button" class="theme-swatch ${theme === t.id ? 'on' : ''}" onclick="applyTheme('${t.id}');openSettings()">
        <span class="theme-dot" style="background:linear-gradient(135deg,${t.c1},${t.c2})"></span>
        ${t.name}
      </button>`
      ).join('')}
    </div>
    <div class="divider"></div>
    <h3 style="margin:8px 0 10px">🔐 امنیت داده‌ها</h3>
    ${
      enc
        ? `<div class="hint" style="margin-bottom:10px">رمزنگاری فعال است — داده‌ها روی گوشی و درایو رمزشده‌اند.</div>
           <button class="btn block" onclick="changePassPrompt()">تغییر رمز عبور</button>
           <button class="btn block" style="margin-top:8px" onclick="rotatePhrasePrompt()">عبارت بازیابی جدید (اگر کاغذ گم شده)</button>`
        : `<p class="small muted">داده‌هایت هنوز به‌صورت ساده ذخیره می‌شوند. با فعال‌کردن رمزنگاری، حتی در گوگل‌درایو هم خواندنی نخواهند بود.</p>
           <button class="btn primary block" onclick="openEncryptSetup()">فعال‌کردن رمزنگاری</button>`
    }
    <div class="divider"></div>
    <h3 style="margin:8px 0 10px">قفل ورود</h3>
    <p class="small muted">${
      enc
        ? 'پین و اثر انگشت برای ورود سریع روی همین گوشی هستند (مثل بقیهٔ اپ‌ها، با یک لمس)؛ کلید اصلی همان رمز عبور است.'
        : 'با رمز وارد برنامه می‌شوی. اثر انگشت اختیاری است و روی کرومِ گوشی معمولاً کار می‌کند.'
    }</p>
    ${
      pinOn
        ? `<button class="btn block" onclick="changePinPrompt()">تغییر ${enc ? 'پین' : 'رمز'}</button>
           <button class="btn danger block" style="margin-top:8px" onclick="clearPin();openSettings()">حذف ${enc ? 'پین' : 'قفل'}</button>`
        : `<button class="btn primary block" onclick="changePinPrompt()">فعال‌کردن ${enc ? 'پین' : 'رمز'}</button>`
    }
    ${
      pinOn && bioOk
        ? bioOn
          ? `<button class="btn block" style="margin-top:8px" onclick="disableBiometric();openSettings()">خاموش کردن اثر انگشت</button>`
          : `<button class="btn block" style="margin-top:8px" onclick="enableBiometric().then(()=>openSettings())">فعال‌کردن اثر انگشت</button>`
        : pinOn && !bioOk
          ? `<div class="hint">اثر انگشت روی این آدرس در دسترس نیست (https لازم است).</div>`
          : ''
    }
    ${googleSettingsHtml()}
    <div class="divider"></div>
    <h3 style="margin:8px 0 10px">خواندن فاکتور از عکس</h3>
    <p class="small muted">کلید Google AI Studio را این‌جا بگذار. به کسی نشان نده. عکس برای خواندن به گوگل فرستاده می‌شود.</p>
    <p><a class="btn block" href="${geminiHelpHref()}" target="_blank" rel="noopener">چطور کلید بگیرم؟</a></p>
    ${
      store.get('capital_gemini_key')
        ? `<div class="hint" style="margin:10px 0">کلید ذخیره شده است.</div>
           <button class="btn block" onclick="clearGeminiKey()">حذف کلید</button>`
        : `<div class="field" style="margin-top:12px"><label>کلید API</label>
           <input class="input" id="geminiKey" type="password" autocomplete="off" placeholder="AIza...">
           </div>
           <button class="btn primary block" onclick="saveGeminiKey()">ذخیره کلید</button>`
    }
    <div class="divider"></div>
    <p class="small muted" style="text-align:center;margin:4px 0 0">نسخه ${APP_VERSION}</p>
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

function googleSettingsHtml() {
  const u = googleUserFromStore();
  if (!u) return '';
  return `
    <div class="divider"></div>
    <h3 style="margin:8px 0 10px">گوگل درایو</h3>
    <p class="small muted">${esc(u.name || 'حساب گوگل')}${u.email ? '<br>' + esc(u.email) : ''}</p>
    <button class="btn primary block" onclick="closeModal();pushToDrive(true)">الان در گوگل ذخیره کن</button>
    <button class="btn block" style="margin-top:8px" onclick="closeModal();loadFromDrive(function(){render();toast('دریافت از گوگل انجام شد ✓');},true)">دریافت از گوگل</button>
    <button class="btn danger block" style="margin-top:8px" onclick="closeModal();googleSignOut()">خروج از حساب گوگل</button>`;
}

export function changePinPrompt() {
  const digits = sec.isEncrypted() ? '۶ تا ۸ رقم' : '۴ تا ۸ رقم';
  openModal(`
    <button class="x" onclick="closeModal()">✕</button>
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
    setLockMode(sec.hasWrap('pin') ? 'pin' : 'pass');
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
