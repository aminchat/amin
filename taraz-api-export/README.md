# taraz-api — سرور تراز (مسیر دوم: Vercel)

تک‌منظوره و تقریباً بی‌حافظه: جریان ورود گوگل (تبادل code↔token) و تازه‌کردن توکن Drive برای وب‌اپ «تراز»
(میزبانی‌شده روی GitHub Pages). هیچ دادهٔ کاربری روی سرور ذخیره نمی‌شود؛ `refresh token` با `SEAL_KEY`
مهر (AES-GCM) می‌شود و روی دستگاه کاربر می‌ماند.

این مخزن **مسیر دوم** در کنار Cloudflare Worker (`taraz-sync`) است تا با تحریم/فیلتر `*.workers.dev`
در ایران مقابله شود و به‌عنوان افزونگی عمل کند. کد مشترک Web-standard است و روی **Vercel Edge** و
**Cloudflare Workers** یکسان اجرا می‌شود (`cloudflare-entry.js` برای مهاجرت آتی Worker؛ فعلاً deploy نمی‌شود).

## مسیرها

| مسیر | متد | کار |
|---|---|---|
| `/ping` | GET | سنجش سلامت/دسترسی از ایران → `{ok:true, host, t}` |
| `/health` | GET | نام‌مستعار `/ping` (سازگاری با Worker فعلی) |
| `/auth/start?app=<origin>&n=<nonce>` | GET | هدایت به صفحهٔ رضایت گوگل |
| `/auth/callback` | GET | مبادلهٔ code مهر refresh token و برگشت به اپ با `#…` |
| `/token/refresh` | POST | `{sealed}` → `{access_token, expires_in}` |
| `/token/revoke` | POST | `{sealed}` → باطل‌کردن refresh token نزد گوگل |

قواعد امنیتی همان Worker است: مبدأ مجاز برنامه **فقط** `https://taraz-app.github.io` (قابل‌بازنویسی با
`ALLOWED_APP`)، مقایسه فقط روی origin بدون اسلش انتهایی، CORS با echo مبدأ مجاز (نه `*`)، و بازگشت
بعد از ورود فقط به همان مبدأ.

## متغیرهای محیطی (در پنل Vercel → Settings → Environment Variables)

| نام | نوع | مقدار |
|---|---|---|
| `GOOGLE_CLIENT_ID` | حساس | همان مقدار Cloudflare Worker |
| `GOOGLE_CLIENT_SECRET` | حساس | همان مقدار Cloudflare Worker |
| `SEAL_KEY` | حساس | **دقیقاً همان** `SEAL_KEY` ورکر — وگرنه توکن‌های مهرشدهٔ یک مسیر روی مسیر دیگر باز نمی‌شوند |
| `ALLOWED_APP` | اختیاری | پیش‌فرض کد `https://taraz-app.github.io` است؛ فقط برای تغییرات آینده |

برای قابلیت «گروه‌ها» در آینده، اتصال Upstash Redis از Marketplace خود Vercel متغیرهای
`UPSTASH_REDIS_REST_URL` و `UPSTASH_REDIS_REST_TOKEN` را خودکار می‌سازد (`api/_lib/store.js` آماده است).

## Google Cloud Console

- **Authorized redirect URIs**: `https://<project>.vercel.app/auth/callback` را **اضافه** کنید
  (در کنار کال‌بک فعلی Worker — هیچ‌کدام حذف نمی‌شوند).
- **Authorized JavaScript origins**: فقط `https://taraz-app.github.io` (اپ) — هاست API نیازی به ثبت ندارد.

## راه‌اندازی

```bash
npm i -g vercel && vercel login
vercel link        # پروژه جدید: Framework = Other، بدون Build Command / Output
vercel env add GOOGLE_CLIENT_ID
vercel env add GOOGLE_CLIENT_SECRET
vercel env add SEAL_KEY
vercel --prod
```

⚠️ **Deployment Protection** پروژه باید **خاموش** باشد (پیش‌فرض ورسل خاموش است)؛ وگرنه
کال‌بک گوگل و فراخوانی‌های مرورگر با 401 SSO رد می‌شوند.

## تست پس از deploy

```bash
curl https://<project>.vercel.app/ping        # {"ok":true,...}
# مسیر کامل ورود: در مرورگر
# https://<project>.vercel.app/auth/start?app=https%3A%2F%2Ftaraz-app.github.io
```

## ساختار

```
api/_lib/core.js       ابزار مشترک: CORS، مبدأ مجاز، مهر/گشودن AES-GCM، تبادل توکن گوگل
api/_lib/handlers.js   منطق پنج مسیر، به شکل (request, env) — مستقل از پلتفرم
api/_lib/store.js      لایهٔ get/put برای ذخیرهٔ آیندهٔ گروه‌ها (Upstash REST)
api/{ping,auth-*,token-*}.js   ورودی‌های Vercel Edge (نازک؛ فقط process.env را تزریق می‌کنند)
cloudflare-entry.js    آداپتور Cloudflare برای مهاجرت آتی (فعلاً deploy نمی‌شود)
vercel.json            rewrite مسیرهای عمومی به فانکشن‌ها + پیکربندی بدون-فریم‌ورک
```

هیچ کلید/رمزی در مخزن نگه نمی‌داریم؛ secretها فقط در پنل Vercel/Cloudflare.
