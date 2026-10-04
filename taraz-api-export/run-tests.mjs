// اجرا: node run-tests.mjs  (نیاز به Node ۱۸+)
import { ping, authStart, authCallback, tokenRefresh } from './api/_lib/handlers.js';
import { seal, open } from './api/_lib/core.js';

const env = { GOOGLE_CLIENT_ID: 'test-client-id', GOOGLE_CLIENT_SECRET: 'test-secret', SEAL_KEY: 'x'.repeat(32) };
let pass = 0, fail = 0;
const t = (name, ok) => { ok ? pass++ : (fail++, console.log('FAIL:', name)); };

let r = await ping(new Request('https://api.example/ping'), env);
let j = await r.json();
t('ping ok', j.ok === true);
t('ping cors', r.headers.get('Access-Control-Allow-Origin') === 'https://taraz-app.github.io');

const sealed = await seal(env, 'سلام 123');
t('seal/open fa', (await open(env, sealed)) === 'سلام 123');

r = await authStart(new Request('https://api.example/auth/start?app=' + encodeURIComponent('https://taraz-app.github.io') + '&n=abc123'), env);
t('start 302', r.status === 302);
const loc = r.headers.get('Location');
t('start→google', loc.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'));
const qp = new URL(loc).searchParams;
t('redirect_uri', qp.get('redirect_uri') === 'https://api.example/auth/callback');
t('client_id', qp.get('client_id') === 'test-client-id');
t('state present', !!qp.get('state'));

const st = JSON.parse(await open(env, qp.get('state')));
t('state app', st.app === 'https://taraz-app.github.io');
t('state nonce', st.cn === 'abc123');

r = await authStart(new Request('https://api.example/auth/start?app=' + encodeURIComponent('https://aminchat.github.io/amin/')), env);
t('old origin rejected', r.status === 400 && (await r.text()) === 'bad app');
r = await authStart(new Request('https://api.example/auth/start?app=' + encodeURIComponent('https://taraz-app.github.io/')), env);
t('trailing slash ok', r.status === 302);
r = await authStart(new Request('https://api.example/auth/start?app=' + encodeURIComponent('https://taraz-app.github.io/?x=1')), env);
t('query app rejected', r.status === 400);

r = await authCallback(new Request('https://api.example/auth/callback?code=x&state=tampered'), env);
t('bad state', r.status === 400);

r = await authStart(new Request('https://api.example/auth/start?app=' + encodeURIComponent('https://taraz-app.github.io')), {});
t('misconfigured', r.status === 500 && (await r.json()).error === 'misconfigured');

r = await tokenRefresh(new Request('https://api.example/token/refresh', { method: 'POST', body: JSON.stringify({ sealed: 'garbage' }) }), env);
t('refresh bad_sealed', r.status === 400 && (await r.json()).error === 'bad_sealed');
r = await tokenRefresh(new Request('https://api.example/token/refresh', { method: 'OPTIONS', headers: { Origin: 'https://taraz-app.github.io' } }), env);
t('OPTIONS 204', r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === 'https://taraz-app.github.io');
r = await tokenRefresh(new Request('https://api.example/token/refresh', { method: 'GET' }), env);
t('GET 405', r.status === 405);

r = await ping(new Request('https://api.example/ping', { headers: { Origin: 'https://evil.com' } }), env);
t('cors no echo evil', r.headers.get('Access-Control-Allow-Origin') === 'https://taraz-app.github.io');
r = await ping(new Request('https://api.example/ping', { headers: { Origin: 'https://taraz-app.github.io' } }), env);
t('cors echo good', r.headers.get('Access-Control-Allow-Origin') === 'https://taraz-app.github.io');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
