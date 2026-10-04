// نقطهٔ ورود Cloudflare Workers — برای مهاجرت آتی ورکر taraz-sync به همین کد مشترک.
// در حال حاضر Deploy نمی‌شود؛ Worker فعلی در مخزن اصلی (worker/taraz-sync.js) سرو می‌دهد.
// برای استفاده: wrangler deploy cloudflare-entry.js --name taraz-sync
import { ping, authStart, authCallback, tokenRefresh, tokenRevoke } from './api/_lib/handlers.js';
import { json, corsHeaders } from './api/_lib/core.js';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = corsHeaders(req.headers.get('Origin') || '', env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    try {
      if (url.pathname === '/ping' || url.pathname === '/health') return ping(req, env);
      // سازگاری با مسیرهای Worker فعلی بدون پیشوند
      if (url.pathname === '/auth/start' || url.pathname === '/start') return authStart(req, env);
      if (url.pathname === '/auth/callback' || url.pathname === '/callback') return authCallback(req, env);
      if ((url.pathname === '/token/refresh' || url.pathname === '/refresh') && req.method === 'POST') return tokenRefresh(req, env);
      if ((url.pathname === '/token/revoke' || url.pathname === '/revoke') && req.method === 'POST') return tokenRevoke(req, env);
      return new Response('taraz-api', { status: 404, headers: cors });
    } catch (e) {
      return json({ error: 'server', detail: String((e && e.message) || e) }, cors, 500);
    }
  },
};
