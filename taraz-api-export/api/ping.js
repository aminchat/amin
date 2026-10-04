import { ping } from './_lib/handlers.js';

export const config = { runtime: 'edge' };

// GET /ping — سنجش دسترسی (ورودی: /ping ← از vercel.json به این فایل rewrite می‌شود)
export default function handler(req) {
  return ping(req, process.env);
}
