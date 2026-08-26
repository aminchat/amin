import { store, toast, isMoneyHidden, setMoneyHidden } from './utils.js';
import { openModal, closeModal } from './modal.js';
import { render } from './view.js';

const THEME_KEY = 'capital_theme';
const PIN_KEY = 'capital_pin_hash';
const BIO_KEY = 'capital_bio_id';

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

export function hasPin() {
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

function b64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function unb64(s) {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

export async function setPin(pin) {
  if (!/^\d{4,8}$/.test(pin)) {
    toast('رمز باید ۴ تا ۸ رقم باشد');
    return false;
  }
  store.set(PIN_KEY, await hashPin(pin));
  toast('رمز ذخیره شد');
  return true;
}

export function clearPin() {
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
  try {
    const cred = await navigator.credentials.create({
      publicKey: {
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
        },
        timeout: 60000,
      },
    });
    if (!cred) return false;
    store.set(BIO_KEY, b64(cred.rawId));
    toast('ورود با اثر انگشت فعال شد');
    return true;
  } catch (e) {
    toast('فعال‌سازی اثر انگشت انجام نشد');
    return false;
  }
}

export function disableBiometric() {
  store.set(BIO_KEY, '');
  toast('اثر انگشت خاموش شد');
}

export function hasBiometric() {
  return !!store.get(BIO_KEY);
}

export async function tryBiometric() {
  const id = store.get(BIO_KEY);
  if (!id || !bioAvailable()) return false;
  try {
    const cred = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: unb64(id) }],
        userVerification: 'required',
        timeout: 45000,
      },
    });
    return !!cred;
  } catch (e) {
    return false;
  }
}

export function unlockApp() {
  const lock = document.getElementById('lockScreen');
  if (lock) lock.classList.remove('show');
}

export function lockApp() {
  if (!hasPin()) return;
  const lock = document.getElementById('lockScreen');
  const pin = document.getElementById('lockPin');
  if (pin) pin.value = '';
  if (lock) lock.classList.add('show');
  const bioBtn = document.getElementById('lockBio');
  if (bioBtn) bioBtn.style.display = hasBiometric() ? '' : 'none';
}

export async function submitLockPin() {
  const pin = (document.getElementById('lockPin') || {}).value || '';
  if (await checkPin(pin)) unlockApp();
  else toast('رمز اشتباه است');
}

export function openSettings() {
  const theme = currentTheme();
  const pinOn = hasPin();
  const bioOn = hasBiometric();
  const bioOk = bioAvailable();
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
    <h3 style="margin:8px 0 10px">قفل ورود</h3>
    <p class="small muted">با رمز وارد برنامه می‌شوی. اثر انگشت اختیاری است و روی کرومِ گوشی معمولاً کار می‌کند.</p>
    ${
      pinOn
        ? `<button class="btn block" onclick="changePinPrompt()">تغییر رمز</button>
           <button class="btn danger block" style="margin-top:8px" onclick="clearPin();openSettings()">حذف قفل</button>`
        : `<button class="btn primary block" onclick="changePinPrompt()">فعال‌کردن رمز</button>`
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
  `);
}

export async function changePinPrompt() {
  const a = prompt('رمز جدید (۴ تا ۸ رقم):');
  if (a == null) return;
  const b = prompt('تکرار رمز:');
  if (a !== b) {
    toast('رمزها یکی نیستند');
    return;
  }
  if (await setPin(a)) openSettings();
}

export function initPrefs() {
  applyTheme(currentTheme());
  syncPrivacyBtn();
  const priv = document.getElementById('btnPrivacy');
  const set = document.getElementById('btnSettings');
  if (priv) priv.onclick = togglePrivacy;
  if (set) set.onclick = openSettings;
  const pinInp = document.getElementById('lockPin');
  if (pinInp) pinInp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitLockPin();
  });
  if (hasPin()) {
    lockApp();
    if (hasBiometric()) tryBiometric().then((ok) => { if (ok) unlockApp(); });
  }
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hasPin() && hiddenAt && Date.now() - hiddenAt > 45000) lockApp();
  });
}
