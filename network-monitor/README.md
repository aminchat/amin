# 📡 راهنما: بفهمید سیستم از کجا دانلود میکند و دیتا چطور مصرف میشود (ویندوز)

> ## ⚠️ اول این را بخوانید: فایلها را تایپ نکنید!
>
> **`Network-Monitor.ps1` یک فایل برنامه است، نه متن کوتاه.** اگر متن آن را در پنجره پاورشل تایپ کنید (یا کپی کنید و Enter بزنید)، به ناچار خطا میگیرید — مخصوصاً چون فارسی و چندخطی است.
>
> **روش درست:** فایل را دانلود کنید و بعد اجرایش کنید (دستورالعمل پایین). سه راه دارید:
>
> ### راه ۱ — دانلود مستقیم از لینک زنده (سادهترین) 🌟
> لینکی که در مرورگرتان باز شده را باز کنید (پیشنمایش زنده «دانلود فایلهای مانیتور شبکه»)، روی **`Network-Monitor.ps1`** کلیک کنید و فایل را در **دسکتاپ** ذخیره کنید. همین!
>
> ### راه ۲ — دانلود با خودِ پاورشل (اگر اینترنت GitHub وصل شد)
> در PowerShell بنویسید:
> ```powershell
> Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/aminchat/amin/arena/01a0292a-amin/network-monitor/Network-Monitor.ps1" -OutFile "$env:USERPROFILE\Desktop\Network-Monitor.ps1"
> ```
> (اگر خواستید راهنمای README هم دانلود شود، همان را با نام `README.md` در انتهای دستور تکرار کنید.)
>
> ### راه ۳ — از گیتهاب در مرورگر
> https://github.com/aminchat/amin → شاخه `arena/01a0292a-amin` → پوشه `network-monitor` → فایل `Network-Monitor.ps1` → دکمه **Download raw file** (یا روی «Raw» کلیک و ذخیره کنید).
>
> بعد از دانلود، راهنمای اجرا در بخش ۳ را ببینید.

### 🚀 اجرای مستقیم از خودِ گیتهاب (بدون دانلود دستی)

ریپو **عمومی (public)** است، پس نیازی به لاگین نیست. کافی است یکی از این دستورها را در PowerShell کپی کنید (هر کدام یک خط کامل است):

**دستور ۱ — دانلود خودکار + اجرا (پیشنهادی):**
```powershell
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $f="$env:TEMP\netmon-en.ps1"; Invoke-WebRequest -UseBasicParsing -Uri "https://raw.githubusercontent.com/aminchat/amin/arena/01a0292a-amin/network-monitor/Network-Monitor.ps1" -OutFile $f; powershell -ExecutionPolicy Bypass -File $f -Geo
```

**دستور ۱ب — نسخه با curl.exe (کاملاً بایتبهبایت، مطمئنترین برای رمزگذاری):**
```powershell
curl.exe -L -o "%TEMP%\netmon-en.ps1" "https://raw.githubusercontent.com/aminchat/amin/arena/01a0292a-amin/network-monitor/Network-Monitor.ps1" ; powershell -ExecutionPolicy Bypass -File "%TEMP%\netmon-en.ps1" -Geo
```
> `curl.exe` در ویندوز ۱۰/۱۱ از قبل موجود است و فایل را دقیقاً همانطور که هست ذخیره میکند (برخلاف Invoke-WebRequest که گاهی رمزگذاری را تغییر میدهد).

**دستور ۲ — نسخه بدون ذخیره فایل (نمای پیش‌فرض):**
```powershell
irm https://raw.githubusercontent.com/aminchat/amin/arena/01a0292a-amin/network-monitor/Network-Monitor.ps1 | iex
```

**اگر دستور ۱ و ۲ خطای اتصال دادند** (در ایران `raw.githubusercontent.com` گاهی فیلتر است) از یکی از اینها استفاده کنید:

**دستور ۳ — دانلود از لینک زنده همین صفحه (پیشنمایش «دانلود فایلهای مانیتور شبکه»):**
```powershell
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $f="$env:TEMP\netmon-en.ps1"; Invoke-WebRequest -UseBasicParsing -Uri "https://8123-ivqnmdrmdkxszbd5igoo8.e2b.app/Network-Monitor.ps1" -OutFile $f; powershell -ExecutionPolicy Bypass -File $f -Geo
```

**دستور ۴ — دانلود کل شاخه بهصورت فشرده از codeload گیتهاب:**
```powershell
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $f="$env:TEMP\amin.tar.gz"; Invoke-WebRequest -UseBasicParsing -Uri "https://codeload.github.com/aminchat/amin/tar.gz/refs/heads/arena/01a0292a-amin" -OutFile $f; tar -xf $f -C "$env:TEMP"; powershell -ExecutionPolicy Bypass -File "$env:TEMP\amin-arena-01a0292a-amin\network-monitor\Network-Monitor.ps1" -Geo
```

> تغییر `-Geo` در انتهای دستورها اختیاری است: حذفش کنید = بدون نمایش کشور مقصد؛ بهجایش `-Watch` بگذارید = داشبورد زنده.
> اگر از داخل PowerShell ویندوز اجرا میکنید و خطای `running scripts is disabled` دیدید، اول `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` را بزنید و `Y` را تایپ کنید.

---

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

> 💡 **خروجی اسکریپت به زبان انگلیسی است** — چون کنسول PowerShell ویندوز فارسی را درست نمایش نمیدهد، تمام متنها و ستونها را انگلیسی کردم. ستونها: `Process` (برنامه)، `RemoteIP` (سرور مقصد)، `Port` (پورت)، `Service` (سرویس)، `State` (وضعیت)، `Country` (کشور).

```powershell
# روش ۱ (بدون تغییر تنظیمات):
powershell -ExecutionPolicy Bypass -File .\Network-Monitor.ps1

# روش ۲ (یکبار اجازه دادن به اسکریپتها):
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
.\Network-Monitor.ps1
```

### اگر خطا گرفتید — رایجترین خطاها و راه حلشان

| خطا یا نشانه | علت | راه حل |
|---|---|---|
| `running scripts is disabled on this system` | ویندوز بهطور پیشفرض اجرای اسکریپت را ممنوع کرده | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` و بعد `Y` |
| `The term '...' is not recognized as the name of a cmdlet` | متن را تایپ/کپی کردهاید نه اجرای فایل | فایل را دانلود کنید (بخش بالای صفحه) و با `.\Network-Monitor.ps1` اجرا کنید |
| متن فارسی به شکل `????` یا بههمریخته دیده میشود | کنسول ویندوز فارسی را درست نمایش نمیدهد | **حل شد:** خروجی اسکریپت کاملاً انگلیسی است؛ دوباره دستور را اجرا کنید تا نسخه جدید دانلود شود |
| `Cannot bind parameter 'OwningProcess'` و خطاهای مشابه | اسکریپت را خطبهخط در کنسول تایپ کردهاید | همانطور که بالاتر گفتم: دانلود کنید، تایپ نکنید |
| هیچ اتصالی نشان داده نمیشود | بدون Administrator اجرا شده یا اینترنت قطع است | با «Run as administrator» اجرا کنید |
| `Invoke-RestMethod` در `-Geo` خطا داد | دسترسی به ip-api.com نیست | `-Geo` را حذف کنید؛ بقیه امکانات کار میکند |
| `Missing expression after unary operator '-'` یا `Unexpected token` موقع اجرای فایل دانلودشده | نسخه قدیمی فایل دارای BOM دوتایی بود (مشکل خود فایل، نه سیستم شما) | دوباره همان دستور را اجرا کنید تا **نسخه اصلاحشده** دانلود شود؛ اگر باز هم خطا داد از دستور ۱ب (curl.exe) استفاده کنید |

> اگر خطای دیگری گرفتید، **عین متن خطا** را برای من بفرستید تا دقیق بگویم مشکل چیست.

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

## Changelog

- v3 (2026-08-22): Fixed process names showing as "PID 1234" (int/uint type bug - real names now shown). Added HTTPS fallback (ipwho.is) when ip-api.com is blocked, so the Country column works on more networks. Output 100% English/ASCII.
- اگر هنوز خروجی فارسی دیدید یعنی نسخه قدیمی از TEMP اجرا شده — دستور بالا را دوباره اجرا کنید (اسم فایل جدید: netmon-en.ps1).
