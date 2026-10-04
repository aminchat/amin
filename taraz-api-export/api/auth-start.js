import { authStart } from './_lib/handlers.js';

export const config = { runtime: 'edge' };

// GET /auth/start?app=<origin>&n=<nonce> → ریدایرکت به صفحهٔ رضایت گوگل
export default function handler(req) {
  return authStart(req, process.env);
}
