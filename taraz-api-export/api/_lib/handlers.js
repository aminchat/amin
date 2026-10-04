// منطق مسیرها — همهٔ handlerها به شکل (request, env) هستند تا در هر دو محیط قابل‌استفاده باشند.
import {
  SCOPE,
  REDIRECT_PATH,
  misconfigured,
  corsHeaders,
  json,
  appAllowed,
  readBody,
  googleToken,
  seal,
  open,
} from './core.js';

function originOf(req) {
  return req.headers.get('Origin') || '';
}

// ── GET /ping — سنجش دسترسی (مخصوص تشخیص مسیر سالم از ایران) ──
export async function ping(req, env) {
  const cors = corsHeaders(originOf(req), env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  return json({ ok: true, host: new URL(req.url).hostname, t: Date.now() }, cors);
}

// ── GET /auth/start?app=<origin>&n=<nonce> → هدایت به صفحهٔ رضایت گوگل ──
export async function authStart(req, env) {
  const url = new URL(req.url);
  if (misconfigured(env)) return json({ error: 'misconfigured' }, corsHeaders(originOf(req), env), 500);
  const app = url.searchParams.get('app') || '';
  if (!appAllowed(app, env)) return new Response('bad app', { status: 400 });
  const cn = (url.searchParams.get('n') || '').slice(0, 64); // nonce کلاینت (login-CSRF)
  const state = await seal(env, JSON.stringify({ app, cn, t: Date.now() }));
  const p = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: url.origin + REDIRECT_PATH,
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

// ── GET /auth/callback?code=…&state=… → مبادلهٔ code و برگشت به اپ با #… در URL ──
export async function authCallback(req, env) {
  const url = new URL(req.url);
  if (misconfigured(env)) return json({ error: 'misconfigured' }, corsHeaders(originOf(req), env), 500);
  const err = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  const stateRaw = url.searchParams.get('state') || '';
  let st;
  try {
    st = JSON.parse(await open(env, stateRaw));
  } catch (e) {
    return new Response('bad state', { status: 400 });
  }
  if (!appAllowed(st.app, env) || Date.now() - st.t > 15 * 60000) return new Response('state expired', { status: 400 });
  const back = (frag) => Response.redirect(st.app + '#' + frag + (st.cn ? '&n=' + encodeURIComponent(st.cn) : ''), 302);
  if (err || !code) return back('gerr=' + encodeURIComponent(err || 'no_code'));

  let tok;
  try {
    tok = await googleToken({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: url.origin + REDIRECT_PATH,
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
  else frag.set('gerr', 'no_refresh_token'); // کاربر باید دسترسی قبلی را در myaccount.google.com حذف کند
  return back(frag.toString());
}

// ── POST /token/refresh  {sealed} → {access_token, expires_in} ──
export async function tokenRefresh(req, env) {
  const cors = corsHeaders(originOf(req), env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, cors, 405);
  if (misconfigured(env)) return json({ error: 'misconfigured' }, cors, 500);
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
  if (tok.refresh_token && tok.refresh_token !== data.rt)
    out.sealed = await seal(env, JSON.stringify({ rt: tok.refresh_token, email: data.email || '', t: Date.now() }));
  return json(out, cors);
}

// ── POST /token/revoke  {sealed} → باطل‌کردن refresh token نزد گوگل ──
export async function tokenRevoke(req, env) {
  const cors = corsHeaders(originOf(req), env);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, cors, 405);
  if (misconfigured(env)) return json({ error: 'misconfigured' }, cors, 500);
  const body = await readBody(req);
  let data;
  try {
    data = JSON.parse(await open(env, body.sealed || ''));
  } catch (e) {
    return json({ ok: true, note: 'bad_sealed' }, cors); // کلیدی که باز نمی‌شود برای گوگل هم بی‌معنی است
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
