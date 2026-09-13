// ─── گاوصندوق محلی: پاکت رمزنگاری‌شده و کلیدهای پیچیده ────────────────────
// ساختار پاکت (نسخه ۲):
// {
//   v: 2,
//   wraps: [ {kind:'pass'|'phrase'|'pin', salt, iter, nonce, ct} , ... ]
//   data: { nonce, ct }            ← حالت اپ، رمزشده با کلید داده (DK)
//   meta: { createdAt, updatedAt } ← برای تصمیم همگام‌سازی
// }
// پاکت محلی شامل پیچیدگی پین هم هست؛ نسخه‌ای که به درایو می‌رود پین ندارد.

import { store } from './utils.js';
import {
  generateDataKey,
  encryptData,
  decryptData,
  wrapDataKey,
  unwrapDataKey,
  normalizePhrase,
} from './crypto.js';

const ENV_KEY = 'capital_secure_v2';

// نشستِ فقط در حافظه — هیچ‌وقت ذخیره نمی‌شود
let dk = null; // کلید داده (CryptoKey غیرقابل استخراج)
let envelope = null; // پاکت فعلی
let sessionPass = null; // رمز عبور، فقط برای بازپیچیدن و ادغام دوردست

function logErr(where, e) {
  if (window.__capLog) window.__capLog(where, e);
}

export function getEnvelope() {
  if (envelope) return envelope;
  try {
    const raw = store.get(ENV_KEY);
    if (raw) envelope = JSON.parse(raw);
  } catch (e) {
    logErr('securestore:خواندن پاکت', e);
  }
  return envelope;
}

function saveEnvelope() {
  if (envelope) store.set(ENV_KEY, JSON.stringify(envelope));
}

export function isEncrypted() {
  return !!getEnvelope();
}

export function isUnlocked() {
  return !!dk;
}

export function hasWrap(kind) {
  const env = getEnvelope();
  return !!(env && env.wraps && env.wraps.some((w) => w.kind === kind));
}

export function metaUpdatedAt() {
  const env = getEnvelope();
  return (env && env.meta && env.meta.updatedAt) || 0;
}

function findWrap(kind) {
  const env = getEnvelope();
  if (!env || !env.wraps) return null;
  return env.wraps.find((w) => w.kind === kind) || null;
}

// بازکردن قفل با یکی از رازها؛ در موفقیت، دادهٔ رمزشده را هم باز می‌کند
export async function unlock(secret, kind) {
  const env = getEnvelope();
  if (!env) throw new Error('پاکتی وجود ندارد');
  const wrap = findWrap(kind);
  if (!wrap) throw new Error('wrap missing');
  const key = await unwrapDataKey(wrap, kind === 'phrase' ? normalizePhrase(secret).join(' ') : secret);
  const text = await decryptData(key, env.data);
  dk = key;
  if (kind === 'pass') sessionPass = secret;
  return JSON.parse(text);
}

export function lockSession() {
  dk = null;
  sessionPass = null;
  // پاکت روی دیسک می‌ماند؛ فقط کلیدِ حافظه حذف می‌شود
}

// بازکردن با کلید دادهٔ از پیش به‌دست‌آمده (مثلاً از اثر انگشت/PRF)
export async function unlockWithKey(key) {
  const env = getEnvelope();
  if (!env) throw new Error('پاکتی وجود ندارد');
  const text = await decryptData(key, env.data);
  dk = key;
  return JSON.parse(text);
}

export function hasSessionPass() {
  return !!sessionPass;
}

// دسترسی به کلید داده برای پیچیدن‌های محلی (مثل اثر انگشت)
export function getDataKey() {
  return dk;
}

let persistChain = Promise.resolve();

// ذخیرهٔ حالت جدید: رمزکردن و به‌روزرسانی پاکت محلی (زنجیره‌ای تا ترتیب حفظ شود)
export function persist(stateObj) {
  persistChain = persistChain.then(async () => {
    if (!dk || !envelope) return;
    try {
      envelope.data = await encryptData(dk, JSON.stringify(stateObj));
      envelope.meta = envelope.meta || {};
      // زمانِ داده از خودِ حالت می‌آید (نه «الان») تا دریافت از گوگل
      // باعث نشود دو دستگاه مدام همدیگر را «جدیدتر» ببینند
      envelope.meta.updatedAt =
        Math.max(stateObj.updatedAt || 0, envelope.meta.updatedAt || 0) || Date.now();
      if (!envelope.meta.kid) envelope.meta.kid = await keyId(dk);
      saveEnvelope();
    } catch (e) {
      logErr('securestore:persist', e);
    }
  });
  return persistChain;
}

// منتظر ماندن تا آخرین ذخیرهٔ رمزشده تمام شود (برای همگام‌سازی)
export function whenPersisted() {
  return persistChain;
}

// نسخهٔ درایو: بدون پیچیدگی پین
export function remoteEnvelopeJson() {
  if (!envelope) return null;
  const copy = JSON.parse(JSON.stringify(envelope));
  copy.wraps = copy.wraps.filter((w) => w.kind !== 'pin');
  return JSON.stringify(copy);
}

// فعال‌سازی رمزنگاری برای اولین بار
export async function enableEncryption(stateObj, passphrase, phrase, pin) {
  const key = await generateDataKey();
  const wraps = [];
  wraps.push(await wrapDataKey(key, passphrase, 'pass'));
  wraps.push(await wrapDataKey(key, normalizePhrase(phrase).join(' '), 'phrase'));
  if (pin) wraps.push(await wrapDataKey(key, pin, 'pin'));
  const data = await encryptData(key, JSON.stringify(stateObj));
  const now = Date.now();
  envelope = {
    v: 2,
    wraps,
    data,
    meta: { createdAt: now, updatedAt: now, wrapsAt: now, kid: await keyId(key) },
  };
  dk = key;
  sessionPass = passphrase;
  saveEnvelope();
}

// شناسهٔ عمومی کلید داده — برای تشخیص اینکه دو پاکت از دو کلید متفاوتند
async function keyId(key) {
  try {
    const raw = await crypto.subtle.exportKey('raw', key);
    const h = await crypto.subtle.digest('SHA-256', raw);
    return Array.from(new Uint8Array(h).slice(0, 8))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch (e) {
    return '';
  }
}

export function metaKid() {
  const env = getEnvelope();
  return (env && env.meta && env.meta.kid) || '';
}

// زمان آخرین تغییر کلیدها (رمز عبور / عبارت بازیابی) — جدا از زمان داده
export function wrapsAtOf(env) {
  if (!env || !env.meta) return 0;
  return env.meta.wrapsAt || env.meta.createdAt || 0;
}
export function metaWrapsAt() {
  return wrapsAtOf(getEnvelope());
}
function touchWraps() {
  envelope.meta = envelope.meta || {};
  // همیشه از مقدار قبلی بزرگ‌تر باشد — حتی اگر ساعت این دستگاه از دستگاه دیگر عقب‌تر باشد،
  // تغییری که بعد از دریافتِ کلیدهای آن دستگاه انجام شده، «جدیدتر» شمرده می‌شود
  envelope.meta.wrapsAt = Math.max(Date.now(), wrapsAtOf(envelope) + 1);
}
function notifyWrapsChanged() {
  try {
    document.dispatchEvent(new CustomEvent('cap:wraps-changed'));
  } catch (e) {}
}

export function setSessionKey(key, pass) {
  dk = key;
  if (pass != null) sessionPass = pass;
}

// افزودن/تغییر پیچیدگی پین (فقط وقتی باز است)
export async function setPinWrap(pin) {
  if (!dk || !envelope) return false;
  envelope.wraps = envelope.wraps.filter((w) => w.kind !== 'pin');
  envelope.wraps.push(await wrapDataKey(dk, pin, 'pin'));
  saveEnvelope();
  return true;
}

export function removePinWrap() {
  if (!envelope) return;
  envelope.wraps = envelope.wraps.filter((w) => w.kind !== 'pin');
  saveEnvelope();
}

// عبارت بازیابی جدید: جایگزینی پیچیدگی فعلی (نیاز به نشست باز دارد)
export async function replacePhraseWrap(phrase) {
  if (!dk || !envelope) return false;
  envelope.wraps = envelope.wraps.filter((w) => w.kind !== 'phrase');
  envelope.wraps.push(await wrapDataKey(dk, normalizePhrase(phrase).join(' '), 'phrase'));
  touchWraps();
  saveEnvelope();
  notifyWrapsChanged();
  return true;
}

// تغییر رمز عبور: بازکردن با قدیمی، پیچیدن دوباره با جدید
export async function changePassphrase(oldPass, newPass) {
  const wrap = findWrap('pass');
  if (!wrap) throw new Error('wrap missing');
  // اعتبارسنجی رمز قدیمی
  const key = dk || (await unwrapDataKey(wrap, oldPass));
  if (dk) await unwrapDataKey(wrap, oldPass); // اعتبارسنجی رمز قدیمی
  envelope.wraps = envelope.wraps.filter((w) => w.kind !== 'pass');
  envelope.wraps.push(await wrapDataKey(key, newPass, 'pass'));
  dk = key;
  sessionPass = newPass;
  touchWraps();
  saveEnvelope();
  notifyWrapsChanged();
}

async function unlockInternalWith(secret, kind) {
  const wrap = findWrap(kind);
  if (!wrap) throw new Error('wrap missing');
  return unwrapDataKey(wrap, secret);
}

// فقط بررسی درستی عبارت بازیابی (بدون تغییر چیزی)
export async function verifyPhrase(phraseText) {
  const wrap = findWrap('phrase');
  if (!wrap) throw new Error('phrase wrap missing');
  await unwrapDataKey(wrap, normalizePhrase(phraseText).join(' '));
  return true;
}

// بازیابی با عبارت بازیابی: رمز عبور جدید جایگزین می‌شود
export async function recoverWithPhrase(phraseText, newPass) {
  const phrase = normalizePhrase(phraseText).join(' ');
  const wrap = findWrap('phrase');
  if (!wrap) throw new Error('phrase wrap missing');
  // عبارت همیشه اعتبارسنجی می‌شود، حتی اگر نشست باز باشد
  const key = await unwrapDataKey(wrap, phrase);
  envelope.wraps = envelope.wraps.filter((w) => w.kind !== 'pass');
  envelope.wraps.push(await wrapDataKey(key, newPass, 'pass'));
  dk = key;
  sessionPass = newPass;
  touchWraps();
  saveEnvelope();
  const st = JSON.parse(await decryptData(key, envelope.data));
  notifyWrapsChanged();
  return st;
}

// رمزگشایی پاکت دوردست با رمز عبور مشخص (برای یکی‌کردن دو دستگاه)
export async function decryptRemoteWith(remoteEnv, pass) {
  const passWrap =
    (remoteEnv.wraps || []).find((w) => w.kind === 'pass') ||
    (remoteEnv.wraps || []).find((w) => w.kind === 'phrase');
  if (!passWrap) throw new Error('no usable wrap');
  let key;
  try {
    key = await unwrapDataKey(passWrap, pass);
  } catch (e) {
    throw new Error('wrong-pass');
  }
  const text = await decryptData(key, remoteEnv.data);
  sessionPass = pass;
  return { state: JSON.parse(text), dk: key };
}

// آیا پاکت دوردست با همان کلید دادهٔ این دستگاه ساخته شده؟
export function sameKeyAs(remoteEnv) {
  const rk = remoteEnv && remoteEnv.meta && remoteEnv.meta.kid;
  const lk = metaKid();
  return !!(rk && lk && rk === lk);
}

// رمزگشایی پاکت دوردست (از درایو):
// اول با کلید دادهٔ بازشدهٔ همین نشست (اگر کلید یکی باشد نیازی به رمز نیست)،
// بعد با رمز عبورِ نشست
export async function decryptRemote(remoteEnv) {
  if (dk) {
    try {
      const text = await decryptData(dk, remoteEnv.data);
      return { state: JSON.parse(text), dk };
    } catch (e) {
      // کلید متفاوت است؛ ادامه با رمز عبور
    }
  }
  if (!sessionPass) throw new Error('need-pass');
  const passWrap =
    (remoteEnv.wraps || []).find((w) => w.kind === 'pass') ||
    (remoteEnv.wraps || []).find((w) => w.kind === 'phrase');
  if (!passWrap) throw new Error('no usable wrap');
  let key;
  try {
    key = await unwrapDataKey(passWrap, sessionPass);
  } catch (e) {
    throw new Error('wrong-pass');
  }
  const text = await decryptData(key, remoteEnv.data);
  return { state: JSON.parse(text), dk: key };
}

// فقط کلیدهای (رمز/عبارت) دوردست را می‌گیرد اگر جدیدتر باشند — دادهٔ محلی و پین دست نمی‌خورد.
// برای وقتی که دستگاه دیگر رمز عبور را عوض کرده ولی دادهٔ این دستگاه جدیدتر است (یا قفل است).
export function adoptRemoteWraps(remoteEnv) {
  const env = getEnvelope();
  if (!env || !remoteEnv || !remoteEnv.wraps) return false;
  if (!sameKeyAs(remoteEnv)) return false;
  const rAt = wrapsAtOf(remoteEnv);
  const lAt = wrapsAtOf(env);
  if (rAt <= lAt) return false;
  const pin = env.wraps.find((w) => w.kind === 'pin');
  env.wraps = remoteEnv.wraps.filter((w) => w.kind !== 'pin');
  if (pin) env.wraps.push(pin);
  env.meta = env.meta || {};
  env.meta.wrapsAt = rAt;
  envelope = env;
  saveEnvelope();
  // رمز عبور حافظه ممکن است دیگر معتبر نباشد (روی دستگاه دیگر عوض شده)
  sessionPass = null;
  return true;
}

// پذیرش پاکت دوردست به‌جای محلی (وقتی دوردست جدیدتر است)
// - پین محلی حفظ می‌شود مگر کلید داده عوض شده باشد (dropPin)
// - اگر کلیدهای محلی (رمز/عبارت) جدیدتر از دوردست باشند، همان‌ها می‌مانند
export function adoptRemoteEnvelope(remoteEnv, opts) {
  const dropPin = !!(opts && opts.dropPin);
  const local = getEnvelope();
  const sameKey = !dropPin && local && sameKeyAs(remoteEnv);
  const localPinWrap =
    !dropPin && local && local.wraps ? local.wraps.find((w) => w.kind === 'pin') : null;
  const localWrapsAt = sameKey ? wrapsAtOf(local) : 0;
  const remoteWrapsAt = wrapsAtOf(remoteEnv);
  const keepLocalWraps = sameKey && localWrapsAt > remoteWrapsAt;

  envelope = JSON.parse(JSON.stringify(remoteEnv));
  envelope.meta = envelope.meta || {};
  if (keepLocalWraps) {
    envelope.wraps = local.wraps.filter((w) => w.kind !== 'pin');
    envelope.meta.wrapsAt = localWrapsAt;
  } else {
    envelope.wraps = envelope.wraps.filter((w) => w.kind !== 'pin');
    if (!envelope.meta.wrapsAt) envelope.meta.wrapsAt = remoteWrapsAt;
    // کلیدهای دوردست جایگزین شد؛ رمزِ حافظه ممکن است قدیمی باشد
    if (sameKey && remoteWrapsAt > localWrapsAt) sessionPass = null;
  }
  if (localPinWrap) envelope.wraps.push(localPinWrap);
  saveEnvelope();
  return keepLocalWraps;
}

// جایگزینی دادهٔ داخل پاکت فعلی و نگهداشت پیچیدگی‌ها (بعد از ادغام)
export async function reencrypt(stateObj) {
  return persist(stateObj);
}

// برای تست/اشکال‌زدایی
export function __debug() {
  return {
    unlocked: !!dk,
    hasEnv: !!envelope,
    wraps: envelope ? envelope.wraps.map((w) => w.kind) : [],
    hasSessionPass: !!sessionPass,
    kid: metaKid(),
    wrapsAt: metaWrapsAt(),
    updatedAt: metaUpdatedAt(),
  };
}
