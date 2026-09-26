// taraz-sync — Cloudflare Worker: تمدید بی‌صدای توکن گوگل‌درایو برای «تراز»
// بی‌حافظه: هیچ‌چیز ذخیره نمی‌کند. refresh token با SEAL_KEY رمز می‌شود و روی گوشی کاربر می‌ماند.
// Secrets لازم: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SEAL_KEY
// مسیرها:
//   GET  /start?app=<origin+path>&n=<nonce> → هدایت به صفحهٔ رضایت گوگل (nonce در بازگشت برمی‌گردد)
//   GET  /callback?code=…&state=…        → مبادلهٔ code، مهر کردن refresh token، برگشت به اپ با #… در URL
//   POST /refresh   {sealed}             → {access_token, expires_in}
//   POST /revoke    {sealed}             → باطل‌کردن refresh token نزد گوگل
//   GET  /health                         → ok

const SCOPE = 'https://www.googleapis.com/auth/drive.file openid email profile';
const ALLOWED_APPS = ['https://aminchat.github.io', 'http://localhost', 'http://127.0.0.1'];
// مسیرهای مجاز برای بازگشت روی دامنهٔ عمومی (روی localhost هر مسیری آزاد است)
const ALLOWED_PATH = /^\/amin(\/|$)/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!env.SEAL_KEY || env.SEAL_KEY.length < 16 || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)
      return json({ error: 'misconfigured' }, corsHeaders(req.headers.get('Origin') || ''), 500);
    const origin = req.headers.get('Origin') || '';
    const cors = corsHeaders(origin);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      if (url.pathname === '/health') return json({ ok: true }, cors);
      if (url.pathname === '/start') return start(url, env);
      if (url.pathname === '/callback') return callback(url, env);
      if (url.pathname === '/refresh' && req.method === 'POST') return refresh(req, env, cors);
      if (url.pathname === '/revoke' && req.method === 'POST') return revoke(req, env, cors);
      return new Response('taraz-sync', { status: 404, headers: cors });
    } catch (e) {
      return json({ error: 'server', detail: String(e && e.message || e) }, cors, 500);
    }
  },
};

function corsHeaders(origin) {
  const ok = ALLOWED_APPS.some((a) => origin === a || origin.startsWith(a + ':'));
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED_APPS[0],
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}
function json(obj, headers, status) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}) });
}
function appAllowed(app) {
  try {
    const u = new URL(app);
    if (u.hash || u.search) return false;
    const ok = ALLOWED_APPS.some((a) => u.origin === a || u.origin.startsWith(a + ':'));
    if (!ok) return false;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    return ALLOWED_PATH.test(u.pathname);
  } catch (e) {
    return false;
  }
}

// ── شروع: هدایت به گوگل ──
async function start(url, env) {
  const app = url.searchParams.get('app') || '';
  if (!appAllowed(app)) return new Response('bad app', { status: 400 });
  const cn = (url.searchParams.get('n') || '').slice(0, 64); // nonce کلاینت برای جلوگیری از login-CSRF
  const state = await seal(env, JSON.stringify({ app, cn, t: Date.now() }));
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: url.origin + '/callback',
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  const hint = url.searchParams.get('login_hint');
  if (hint) p.set('login_hint', hint);
  return Response.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + p.toString(), 302);
}

// ── برگشت از گوگل ──
async function callback(url, env) {
  const err = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state') || '';
  let st;
  try {
    st = JSON.parse(await open(env, stateRaw));
  } catch (e) {
    return new Response('bad state', { status: 400 });
  }
  if (!appAllowed(st.app) || Date.now() - st.t > 15 * 60000) return new Response('state expired', { status: 400 });
  const back = (frag) => Response.redirect(st.app + '#' + frag + (st.cn ? '&n=' + encodeURIComponent(st.cn) : ''), 302);
  if (err || !code) return back('gerr=' + encodeURIComponent(err || 'no_code'));

  let tok;
  try {
    tok = await googleToken({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: url.origin + '/callback',
      grant_type: 'authorization_code',
    });
  } catch (e) {
    return back('gerr=google_down');
  }
  if (!tok.access_token) return back('gerr=' + encodeURIComponent(tok.error || 'exchange_failed'));

  let email = '';
  let name = '';
  let picture = '';
  if (tok.id_token) {
    try {
      const b64 = tok.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const p = JSON.parse(new TextDecoder().decode(bytes)); // نام‌های فارسی (UTF-8) درست خوانده شوند
      email = p.email || '';
      name = p.name || '';
      picture = p.picture || '';
    } catch (e) {}
  }
  const frag = new URLSearchParams({
    access_token: tok.access_token,
    expires_in: String(tok.expires_in || 3600),
    email,
    name,
    picture,
  });
  if (tok.refresh_token) frag.set('sealed', await seal(env, JSON.stringify({ rt: tok.refresh_token, email, t: Date.now() })));
  else frag.set('gerr', 'no_refresh_token'); // کاربر باید یک بار دسترسی قبلی را در myaccount.google.com حذف کند
  return back(frag.toString());
}

// ── تمدید ──
async function refresh(req, env, cors) {
  const body = await readBody(req);
  let data;
  try {
    data = JSON.parse(await open(env, body.sealed || ''));
  } catch (e) {
    return json({ error: 'bad_sealed' }, cors, 400);
  }
  let tok;
  try {
    tok = await googleToken({
      refresh_token: data.rt,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    });
  } catch (e) {
    return json({ error: 'google_down' }, cors, 502); // موقتی؛ کلاینت کلید را نگه می‌دارد
  }
  if (!tok.access_token) {
    // فقط invalid_grant یعنی کلید واقعاً مرده؛ بقیه موقتی‌اند
    const dead = tok.error === 'invalid_grant';
    return json({ error: tok.error || 'refresh_failed' }, cors, dead ? 401 : 502);
  }
  const out = { access_token: tok.access_token, expires_in: tok.expires_in || 3600, email: data.email || '' };
  // چرخش کلید (نادر): کلید تازه را مهر کن تا کلاینت جایگزین کند
  if (tok.refresh_token && tok.refresh_token !== data.rt) out.sealed = await seal(env, JSON.stringify({ rt: tok.refresh_token, email: data.email || '', t: Date.now() }));
  return json(out, cors);
}

// بدنه به‌صورت text/plain می‌آید (درخواست «ساده»؛ مرورگر OPTIONS نمی‌زند)
async function readBody(req) {
  try {
    return JSON.parse(await req.text());
  } catch (e) {
    return {};
  }
}

async function googleToken(params) {
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

// ── خروج: باطل‌کردن نزد گوگل ──
async function revoke(req, env, cors) {
  const body = await readBody(req);
  let data;
  try {
    data = JSON.parse(await open(env, body.sealed || ''));
  } catch (e) {
    return json({ ok: true, note: 'bad_sealed' }, cors); // کلیدی که باز نمی‌شود، برای گوگل هم بی‌معنی است
  }
  try {
    const r = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: data.rt }),
    });
    // 200 = باطل شد؛ 400 = قبلاً باطل/منقضی بوده (نتیجه یکی است)
    if (r.ok || r.status === 400) return json({ ok: true }, cors);
    return json({ ok: false, error: 'google_' + r.status }, cors, 502);
  } catch (e) {
    return json({ ok: false, error: 'google_down' }, cors, 502);
  }
}

// ── مهر و موم: AES-GCM با کلید مشتق از SEAL_KEY ──
async function sealKey(env) {
  const raw = new TextEncoder().encode(env.SEAL_KEY || '');
  const hash = await crypto.subtle.digest('SHA-256', raw);
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(env, text) {
  const key = await sealKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64url(out);
}
async function open(env, sealed) {
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
