# 📡 راهنما: بفهمید سیستم از کجا دانلود میکند و دیتا چطور مصرف میشود (ویندوز)

این راهنما دو بخش دارد:
1. **ابزارهای داخلی ویندوز** — بدون نصب هیچ چیز، همین حالا میتوانید ببینید چه برنامهای به کجا وصل است.
2. **اسکریپت آماده `Network-Monitor.ps1`** — ابزاری که در همین پوشه نوشته شده و همه را یکجا نشان میدهد.

---

## ۱) ابزارهای داخلی ویندوز (بدون نصب)

### الف) Task Manager (مدیر وظایف)
- `Ctrl + Shift + Esc` → تب **Performance** → زیر نمودار شبکه، سرعت لحظهای دانلود/آپلود را میبینید.
- تب **Processes** → ستون **Network** → میبینید کدام برنامه الان بیشترین دیتا مصرف میکند.
- در پایین تب Performance دکمه **Open Resource Monitor** وجود دارد که ابزار بعدی را باز میکند.

### ب) Resource Monitor (بهترین ابزار داخلی) ⭐
- `Win + R` → تایپ کنید `resmon` → Enter
- تب **Network** سه بخش کلیدی دارد:
  - **Processes with Network Activity**: هر برنامه چند بایت در ثانیه میفرستد/دریافت میکند.
  - **TCP Connections**: آدرس دقیق مقصد (Remote Address) هر اتصال + وضعیت (Established = فعال).
  - **Listen Ports**: پورتهایی که برنامهها برای دریافت باز کردهاند.
- این دقیقاً همان پاسخی است که میخواهید: «کدام برنامه، از کدام سرور، با چه سرعتی دارد دیتا میگیرد».

### ج) دستور netstat (Command Prompt با Run as administrator)
```bat
netstat -bno
```
- `-b` = نام برنامه، `-n` = آدرس عددی، `-o` = شماره پروسه (PID)
- فیلتر کردن برای پیدا کردن اتصالات پرحجم:
```bat
netstat -bno | findstr ESTABLISHED
```
- هر ردیف: `پروتکل  آدرس محلی  آدرس مقصد  وضعیت  PID`
- اگر خواستید بدانید PID یعنی کدام برنامه: در Task Manager → تب Details ستون PID را فعال کنید.

### د) PowerShell
```powershell
# همه اتصالات فعال + پروسه مالک هر کدام
Get-NetTCPConnection -State Established | Sort-Object RemoteAddress | Format-Table LocalAddress,RemoteAddress,RemotePort,OwningProcess

# حجم کل فرستاده/گرفته شده هر کارت شبکه
Get-NetAdapterStatistics | Format-Table Name,ReceivedBytes,SentBytes

# اتصالات یک برنامه خاص (مثلاً مرورگر)
Get-NetTCPConnection -OwningProcess (Get-Process chrome).Id
```

---

## ۲) ابزارهای جانبی (اگر میخواهید دقیقتر و راحتتر)

| ابزار | چه کاری میکند | قیمت |
|---|---|---|
| **GlassWire** | نمودار مصرف هر برنامه + هشدار وقتی برنامه جدید به اینترنت وصل میشود + نمایش سرورهای مقصد | رایگان/پولی |
| **NetLimiter** | دقیقترین ابزار: سرعت لحظهای هر پروسه + امکان **محدود کردن سرعت** هر برنامه | پولی (ترایال دارد) |
| **TrafficMonitor** | گجت کوچک روی نوار وظیفه که سرعت کل دانلود/آپلود را نشان میدهد | رایگان |
| **Wireshark** | تحلیل عمیق پکتهای شبکه (برای کاربر حرفهای) | رایگان |

> نکته: ابزارهایی مثل NetLimiter و GlassWire از ETW هسته ویندوز استفاده میکنند؛ به همین دلیل تنها راه دقیق اندازهگیری «سرعت واقعی هر برنامه» هستند. PowerShell و Resource Monitor هم اطلاعات خوبی میدهند ولی دقیقاً به دقت اینها نیستند.

---

## ۳) اسکریپت آماده: Network-Monitor.ps1

همین پوشه حاوی فایل **`Network-Monitor.ps1`** است.

### اجرا
```powershell
# روش ۱ (بدون تغییر تنظیمات):
powershell -ExecutionPolicy Bypass -File .\Network-Monitor.ps1

# روش ۲ (یکبار اجازه دادن به اسکریپتها):
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
.\Network-Monitor.ps1
```

### دستورات پرکاربرد

| دستور | چه چیزی نشان میدهد |
|---|---|
| `.\Network-Monitor.ps1` | لیست همه اتصالها: برنامه، PID، IP مقصد، پورت، سرویس، وضعیت |
| `.\Network-Monitor.ps1 -Top` | پرترافیکترین برنامهها (بر اساس تعداد اتصال) |
| `.\Network-Monitor.ps1 -Watch` | داشبورد زنده که هر ۳ ثانیه رفرش میشود (خروج: Ctrl+C) |
| `.\Network-Monitor.ps1 -Watch -Refresh 5` | همان داشبورد با رفرش ۵ ثانیهای |
| `.\Network-Monitor.ps1 -Interfaces` | سرعت لحظهای + حجم کل دانلود/آپلود هر کارت شبکه |
| `.\Network-Monitor.ps1 -ResolveHosts` | تبدیل IP مقصد به دامنه (مثلاً `cdn.telegram.org`) |
| `.\Network-Monitor.ps1 -Geo` | کشور مقصد هر اتصال (مثلاً `Frankfurt, Germany`) — نیاز به اینترنت |
| `.\Network-Monitor.ps1 -Process chrome` | فقط اتصالهای کروم |
| `.\Network-Monitor.ps1 -Geo -ResolveHosts` | ترکیب: دامنه + کشور مقصد |

> ⚠️ **حتماً با «Run as administrator» اجرا کنید**، وگرنه اتصالهای سرویسهای ویندوز و برنامههای دیگر کاربران را نمیبینید.

---

## ۴) چطور خروجی را بخوانیم (تشخیص سریع)

- ستون **Service**: `443 = HTTPS` (وبسایتها، CDNها، تلگرام و...) — `80 = HTTP` — `53 = DNS` — `1935 = RTMP` (استریم) — `5222 = XMPP` و غیره.
- **دامنههایی که با `cdn` یا `cloud` شروع میشوند** یعنی دانلود از سرورهای توزیع محتوا (مثلاً آپدیت بازی/ویندوز).
- برنامهای که **تعداد اتصال بالا + پورت 443** دارد، به احتمال زیاد در حال دانلود آپدیت، استریم یا سینک کردن فایل است.
- برای اثبات: `-Interfaces` را اجرا کنید، برنامه مشکوک را ببندید و دوباره اجرا کنید؛ سرعت دانلود باید افت کند.
- **DNS را چک کنید**: اگر یک IP خواستید بدانید متعلق به کیست:
```powershell
Resolve-DnsName 8.8.8.8          # نام معکوس
```
- اگر فقط «میزان مصرف» مهم است نه مقصد: **Settings → Network & Internet → Data usage** حجم مصرفی هر برنامه را نشان میدهد.

---

## ۵) چرا ویندوز بدون اینکه کاری کنم دیتا مصرف میکند؟

مصرفهای پنهان رایج:

| مصرفکننده | راه کنترل |
|---|---|
| **Windows Update** | Settings → Update → Advanced → گزینهها را محدود کنید |
| **OneDrive** | اتصال را «Metered connection» بگیرید یا سینک را ببندید |
| **Telemetry / DiagTrack** | در Services سرویس `Connected User Experiences and Telemetry` را غیرفعال کنید |
| **Microsoft Store** | آپدیت خودکار اپها را خاموش کنید |
| **برنامههای پسزمینه** | Settings → Privacy → Background apps را محدود کنید |

> سریعترین راه شناسایی: `resmon` را باز کنید و زیر تب Network ببینید کدام پروسه مدام فعال است، بعد همان را در گوگل جستجو کنید تا مطمئن شوید از کجاست.

---

### خلاصه سریع
1. **`resmon`** → تب Network = کدام برنامه، به کجا، با چه سرعتی. (فوری، بدون نصب)
2. **`netstat -bno`** با Admin = همان اطلاعات به صورت متنی.
3. برای دقیقترین سرعت هر برنامه: **NetLimiter** یا **GlassWire**.
4. اسکریپت `Network-Monitor.ps1` همین پوشه = همه اینها در یک ابزار ساده، با امکان نمایش **کشور مقصد** و **دامنه سرور**.
