import { tokenRefresh } from './_lib/handlers.js';

export const config = { runtime: 'edge' };

// POST /token/refresh {sealed} → {access_token, expires_in}
export default function handler(req) {
  return tokenRefresh(req, process.env);
}
