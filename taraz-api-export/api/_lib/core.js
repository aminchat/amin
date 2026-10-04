// taraz-api — هستهٔ مشترک (Web-standard؛ روی Vercel Edge و Cloudflare Workers یکسان اجرا می‌شود)
// پورت ۱:۱ از worker/taraz-sync.js در مخزن اصلی — ورود گوگل + تمدید توکن Drive. بی‌حافظه.
// Secrets لازم: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SEAL_KEY
// متغیر اختیاری: ALLOWED_APP — مبدأ مجاز برنامه (پیش‌فرض: https://taraz-app.github.io)

export const SCOPE = 'https://www.googleapis.com/auth/drive.file openid email profile';
// مسیر عمومی کال‌بک گوگل — redirect_uri همیشه origin + همین مسیر است
// (در Google Console دقیقاً همین ثبت می‌شود: https://<project>.vercel.app/auth/callback)
export const REDIRECT_PATH = '/auth/callback';

// مبدأ مجاز برنامه — بدون اسلش انتهایی؛ مقایسه فقط روی مبدأ (بی‌توجه به مسیر)
const DEFAULT_APP = 'https://taraz-app.github.io';
export function allowedApp(env) {
  return String((env && env.ALLOWED_APP) || DEFAULT_APP).replace(/\/+$/, '');
}

export function misconfigured(env) {
  return !env || !env.SEAL_KEY || env.SEAL_KEY.length < 16 || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET;
}

export function corsHeaders(origin, env) {
  const allow = allowedApp(env);
  const o = String(origin || '').replace(/\/+$/, '');
  return {
    'Access-Control-Allow-Origin': o === allow ? o : allow, // echo مبدأ مجاز — هرگز '*'
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

export function options204(origin, env) {
  return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
}

export function json(obj, headers, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
  });
}

export function appAllowed(app, env) {
  try {
    const u = new URL(app);
    if (u.hash || u.search) return false;
    return u.origin === allowedApp(env); // مسیر مهم نیست؛ فقط مبدأ
  } catch (e) {
    return false;
  }
}

// بدنه به‌صورت text/plain می‌آید (درخواست «ساده»؛ مرورگر OPTIONS نمی‌زند)
export async function readBody(req) {
  try {
    return JSON.parse(await req.text());
  } catch (e) {
    return {};
  }
}

export async function googleToken(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const txt = await r.text();
  try {
    return JSON.parse(txt);
  } catch (e) {
    if (r.status >= 500) throw new Error('google ' + r.status);
    return { error: 'bad_response' };
  }
}

// ── مهر و موم: AES-GCM با کلید مشتق از SEAL_KEY ──
// توجه: SEAL_KEY باید روی هر دو میزبان (Cloudflare و Vercel) یکسان باشد،
// وگرنه توکن‌های مهرشدهٔ یک میزبان روی میزبان دیگر باز نمی‌شوند.
async function sealKey(env) {
  const raw = new TextEncoder().encode(env.SEAL_KEY || '');
  const hash = await crypto.subtle.digest('SHA-256', raw);
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(env, text) {
  const key = await sealKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64url(out);
}
export async function open(env, sealed) {
  const key = await sealKey(env);
  const buf = unb64url(sealed);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12) }, key, buf.slice(12));
  return new TextDecoder().decode(pt);
}
function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  s += '==='.slice((s.length + 3) % 4);
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
