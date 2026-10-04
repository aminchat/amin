// لایهٔ ذخیره‌سازی کوچک برای قابلیت‌های آینده (گروه‌ها/مادرخرج)
// فعلاً endpointی از آن استفاده نمی‌کند؛ بعداً روی Vercel با Upstash باز می‌شود
// و روی Cloudflare با KV. محتوا سمت کلاینت رمز می‌شود؛ سرور فقط متن رمزشده می‌بیند.
//
// Upstash متغیرهای UPSTASH_REDIS_REST_URL و UPSTASH_REDIS_REST_TOKEN را
// هنگام اتصال از Marketplace خودش در پروژهٔ Vercel ست می‌کند.

export function getStore(env) {
  if (env && env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return upstashStore(env);
  }
  return null; // ذخیره‌سازی پیکربندی نشده (ورود/همگام‌سازی بدون آن کار می‌کند)
}

// Upstash Redis از طریق REST — روی هر دو runtime (fetch API) کار می‌کند
function upstashStore(env) {
  const base = String(env.UPSTASH_REDIS_REST_URL).replace(/\/+$/, '');
  const auth = { Authorization: 'Bearer ' + env.UPSTASH_REDIS_REST_TOKEN };
  async function cmd(args) {
    const r = await fetch(base, {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, auth),
      body: JSON.stringify(args),
    });
    if (!r.ok) throw new Error('upstash ' + r.status);
    return r.json();
  }
  return {
    // get(key) → string|null
    async get(key) {
      const res = await cmd(['GET', key]);
      return res && res.result != null ? String(res.result) : null;
    },
    // put(key, value, ttlSeconds?) — با TTL پیش‌فرض ۹۰ روز برای دادهٔ گروه
    async put(key, value, ttlSeconds) {
      const ttl = ttlSeconds || 90 * 24 * 3600;
      return cmd(['SET', key, value, 'EX', String(ttl)]);
    },
    async del(key) {
      return cmd(['DEL', key]);
    },
  };
}
