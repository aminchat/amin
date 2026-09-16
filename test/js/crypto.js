// ─── رمزنگاری سرتاسری (AES-256-GCM + PBKDF2) ───────────────────────────────
// کلید داده (DK) یک کلید تصادفی غیرقابل‌استخراج است که داده‌ها را قفل می‌کند.
// خودِ DK با کلیدهای مشتق‌شده از «رمز عبور»، «عبارت بازیابی» و «پین» پیچیده می‌شود.

import { t as tr } from './i18n.js';

const ITER_PASS = 250000; // برای رمز عبور و عبارت بازیابی
const ITER_PIN = 600000; // برای پین (سنگین‌تر چون فضای حدس کوچک است)

export function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
export function unb64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
export function randBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

async function importSecret(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('capital2:' + secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );
}

// مشتق‌کردن کلید متقارن از یک راز (رمز/عبارت/پین)
async function deriveKek(secret, saltB64, iter) {
  const base = await importSecret(secret);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(saltB64), iterations: iter, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

// ساخت کلید دادهٔ تصادفی (برای پیچیده‌شدن با چند کلید باید قابل استخراج باشد؛
// فقط در حافظهٔ صفحه زندگی می‌کند و هرگز ذخیره یا ارسال نمی‌شود)
export async function generateDataKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

export async function encryptData(dk, plaintext) {
  const nonce = randBytes(12);
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    dk,
    new TextEncoder().encode(plaintext)
  );
  return { nonce: b64(nonce), ct: b64(ct) };
}

export async function decryptData(dk, blob) {
  const buf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(blob.nonce) },
    dk,
    unb64(blob.ct)
  );
  return new TextDecoder().decode(buf);
}

// پیچیدن کلید داده با یک کلید متقارن (KEK)
export async function wrapDataKeyWithKek(dk, kek) {
  const nonce = randBytes(12);
  const wrapped = await crypto.subtle.wrapKey('raw', dk, kek, {
    name: 'AES-GCM',
    iv: nonce,
  });
  return { nonce: b64(nonce), ct: b64(wrapped) };
}

export async function unwrapDataKeyWithKek(wrap, kek) {
  return crypto.subtle.unwrapKey(
    'raw',
    unb64(wrap.ct),
    kek,
    { name: 'AES-GCM', iv: unb64(wrap.nonce) },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function importKekFromRaw(rawBytes) {
  return crypto.subtle.importKey('raw', rawBytes, { name: 'AES-GCM' }, false, [
    'wrapKey',
    'unwrapKey',
  ]);
}

// پیچیدن کلید داده با یک راز (رمز/عبارت/پین)
export async function wrapDataKey(dk, secret, kind) {
  const iter = kind === 'pin' ? ITER_PIN : ITER_PASS;
  const salt = randBytes(16);
  const saltB64 = b64(salt);
  const kek = await deriveKek(secret, saltB64, iter);
  const wrap = await wrapDataKeyWithKek(dk, kek);
  return { kind, salt: saltB64, iter, ...wrap };
}

// بازکردن پیچیدگی — اگر راز اشتباه باشد خطا می‌اندازد
export async function unwrapDataKey(wrap, secret) {
  const kek = await deriveKek(secret, wrap.salt, wrap.iter);
  return unwrapDataKeyWithKek(wrap, kek);
}

// ─── عبارت بازیابی: ۱۲ کلمه از فهرست ۲۵۶تایی (۹۶ بیت آنتروپی) ─────────────
export const PHRASE_WORDS = 12;

const WORDS = [
  'apple','bread','cloud','dance','earth','flame','grape','house',
  'juice','koala','lemon','mango','night','ocean','piano','quiet',
  'river','stone','tiger','uncle','voice','water','xenon','youth',
  'zebra','amber','beach','candy','dream','eagle','frost','ghost',
  'honey','ivory','jelly','kite','lamp','moon','north','olive',
  'pearl','queen','radio','snake','table','urban','video','whale',
  'yacht','zinc','arrow','bamboo','cabin','delta','ember','fauna',
  'garden','harbor','island','jungle','kernel','lily','marble','nectar',
  'orchid','planet','quiver','rocket','saddle','tunnel','velvet','walnut',
  'anchor','bronze','cactus','donkey','engine','falcon','glacier','horizon',
  'insect','jaguar','kitten','ladder','mirror','nickel','orange','pencil',
  'rabbit','silver','throne','umbrella','vanilla','winter','yellow','zeppelin',
  'basket','carrot','dinner','eraser','farmer','garlic','hammer','igloo',
  'jacket','kitchen','lobster','monday','noodle','office','parrot','quarter',
  'rainbow','scissors','tomato','uniform','volcano','window','xylophone','yogurt',
  'button','circle','dragon','feather','guitar','helmet','jigsaw','kettle',
  'lion','monkey','number','otter','pizza','ruler','spoon','tower',
  'violin','wizard','castle','doctor','forest','giant','hotel','maple',
  'puzzle','quartz','ribbon','sunset','temple','valley','willow','crystal',
  'summit','bridge','camera','desert','electric','frozen','golden','hollow',
  'impala','jupiter','kipper','lunar','meadow','nimbus','opal','prism',
  'quest','reef','spark','tundra','umber','voyage','wonder','zenith',
  'apricot','blossom','cobalt','dune','echo','fable','grove','hazel',
  'iris','juniper','kelp','lotus','mirth','nova','onyx','plume',
  'quill','rover','saffron','trek','unity','vista','wander','zephyr',
  'aster','birch','coral','drift','eddy','fern','gale','heath',
  'indigo','jade','knot','ledge','moss','noble','oak','peak',
  'ridge','shade','thorn','upland','vine','wharf','yarrow','zone',
  'arch','bloom','cliff','dale','elm','flint','glen','haze',
  'inlet','jewel','knoll','lagoon','mist','nook','osprey','pond',
  'acorn','basil','canyon','dolphin','fjord','geyser','hippo','iguana',
  'jasmine','komodo','larch','mushroom','nutmeg','orca','papaya','quokka',
];

const WORDSET = new Set(WORDS);

export function newRecoveryPhrase() {
  const picks = [];
  const rnd = randBytes(PHRASE_WORDS);
  for (let i = 0; i < PHRASE_WORDS; i++) picks.push(WORDS[rnd[i]]);
  return picks.join(' ');
}

export function normalizePhrase(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[,.;:،؛]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function phraseUnknownWords(input) {
  return normalizePhrase(input).filter((w) => !WORDSET.has(w));
}

export function phraseValid(input) {
  const words = normalizePhrase(input);
  return (
    words.length === PHRASE_WORDS && words.every((w) => WORDSET.has(w))
  );
}

export function wordHint(w) {
  const idx = WORDS.indexOf(w);
  return idx >= 0 ? String(idx + 1) : '?';
}
