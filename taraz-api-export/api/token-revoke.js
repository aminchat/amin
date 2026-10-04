import { tokenRevoke } from './_lib/handlers.js';

export const config = { runtime: 'edge' };

// POST /token/revoke {sealed} → باطل‌کردن refresh token نزد گوگل
export default function handler(req) {
  return tokenRevoke(req, process.env);
}
