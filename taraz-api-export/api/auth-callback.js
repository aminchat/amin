import { authCallback } from './_lib/handlers.js';

export const config = { runtime: 'edge' };

// GET /auth/callback?code=…&state=… → مبادلهٔ code و برگشت به اپ با #…
// این مسیر همان redirect URI است که در Google Console ثبت می‌شود.
export default function handler(req) {
  return authCallback(req, process.env);
}
