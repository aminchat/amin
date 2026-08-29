#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ساخت بوکمارکلت‌ها و صفحه‌ی نصب:
  bookmarklet.txt          -> کوتاه و چندآینه‌ای (اصلی؛ فقط ASCII تا کپی‌پیست در چت/برداشت خرابش نکند)
  bookmarklet-offline.txt  -> offline-first (کد کامل داخل بوکمارکلت؛ برای کنسول F12)
  install.html             -> صفحه‌ی نصب: کشیدن دکمه به نوار بوکمارک‌ها (بدون کپی‌پیست)
نکته‌های ASCII-ایمنی (ضد اتولینک شدن d.style و ضد کامنت شدن با //):
  - هیچ کاراکتر غیر ASCII خارج از رشته‌های escape‌شده نیست (پیام‌ها به shape \\uXXXX)
  - به‌جای d.style.cssText از d.setAttribute("style",...) استفاده شده (`.style` یک TLD واقعی است و چت‌ها آن را لینک می‌کنند)
  - هیچ // خارج از رشته‌ها وجود ندارد (urlها فقط داخل رشته‌اند)
برای انتشار نسخه‌ی جدید: COMMIT را با SHA کامیت تازه عوض کن و اسکریپت را اجرا کن.
"""
import json, io, os

ROOT = os.path.dirname(os.path.abspath(__file__))
CODE = io.open(os.path.join(ROOT, "tsetmc-filters.js"), encoding="utf-8").read()

COMMIT = "af12c192f4a6862a81a8e28805564ccada8badaf"
BRANCH = "arena/01a04e69-amin"

URLS = [
    "https://raw.githubusercontent.com/aminchat/amin/" + BRANCH + "/tsetmc-filters/tsetmc-filters.js",
    "https://cdn.jsdelivr.net/gh/aminchat/amin@" + COMMIT + "/tsetmc-filters/tsetmc-filters.js",
    "https://fastly.jsdelivr.net/gh/aminchat/amin@" + COMMIT + "/tsetmc-filters/tsetmc-filters.js",
    "https://gcore.jsdelivr.net/gh/aminchat/amin@" + COMMIT + "/tsetmc-filters/tsetmc-filters.js",
    "https://cdn.statically.io/gh/aminchat/amin@" + COMMIT + "/tsetmc-filters/tsetmc-filters.js",
]


def ascii_escape(s):
    """متن فارسی -> رشته‌ی JS فقط با کاراکترهای ASCII (\\uXXXX)."""
    out = []
    for ch in s:
        o = ord(ch)
        if o > 127:
            out.append("\\u%04x" % o)
        else:
            out.append(ch)
    return "".join(out)


# پیام‌های فارسی (در خروجی به \\uXXXX تبدیل می‌شوند)
MSG_FAIL = "دانلود کد فیلترها از همه آدرس‌ها شکست خورد. می‌توانید موقتاً فایل tsetmc-filters.js را از گیت‌هاب دانلود کرده و در کنسول (F12) پیست و اجرا کنید."
MSG_RUNERR = "کد دانلود شد ولی خطا در اجرا داشت: "

# ---------- نسخه‌ی کوتاه و چندآینه‌ای (فقط ASCII؛ بدون .style و بدون // خارج از رشته) ----------
SHORT_TEMPLATE = (
    'javascript:(function(){if(window.__tfb3){return}window.__tfb3=1;'
    "var urls=%URLS%;"
    'var i=0,TO=8000;'
    'var FAIL=%FAIL%;'
    'var RUNERR=%RUNERR%;'
    'function mk(t,c){var d=document.createElement("div");'
    'd.setAttribute("style","position:fixed;bottom:10px;right:12px;z-index:99999;max-width:440px;background:"+c+";border:1px solid #999;padding:10px 14px;font-family:Tahoma,sans-serif;font-size:12px;direction:rtl;box-shadow:0 3px 10px rgba(0,0,0,.3)");'
    'd.textContent=t;d.addEventListener("click",function(){d.remove()});document.body.appendChild(d);}'
    'function fin(){window.__tfb3=0;}'
    "function fetchT(u){return new Promise(function(res,rej){var t=setTimeout(function(){rej(0)},TO);"
    'try{fetch(u).then(function(r){clearTimeout(t);if(!r.ok){throw 0}return r.text();}).then(res,function(e){clearTimeout(t);rej(e);});}'
    "catch(e){clearTimeout(t);rej(e);}});}"
    "function next(){if(i>=urls.length){mk(FAIL,"
    '"#ffdddd");fin();return;}'
    "var u=urls[i++];"
    'try{fetchT(u).then(function(t){if(t.indexOf("__tsetmcFiltersLoaded")===-1){next();return;}'
    "try{(0,eval)(t);}catch(e){mk(RUNERR+e,"
    '"#ffdddd");}'
    "fin();}).catch(function(){next();});}catch(e){next();}}"
    "next();})();"
)

def js_str(s):
    """متن فارسی -> لیترال JS با quote دابل؛ فقط ASCII (\\uXXXX). پیام‌ها quote و بک‌اسلش ندارند."""
    return '"' + ascii_escape(s) + '"'


out_short = (
    SHORT_TEMPLATE
    .replace("%URLS%", json.dumps(URLS, ensure_ascii=True))
    .replace("%FAIL%", js_str(MSG_FAIL))
    .replace("%RUNERR%", js_str(MSG_RUNERR))
)
io.open(os.path.join(ROOT, "bookmarklet.txt"), "w", encoding="utf-8").write(out_short)
assert all(ord(c) < 128 for c in out_short), "short bookmarklet must be ASCII-only"
print("bookmarklet.txt (short, multi-mirror, ascii-safe) chars:", len(out_short))

# ---------- نسخه‌ی offline-first (بلند؛ برای پیست در کنسول) ----------
inline = json.dumps(CODE, ensure_ascii=False)
OFFLINE = r"""javascript:(function(){if(window.__tfbLoading&&Date.now()-window.__tfbLoading<20000){return}window.__tfbLoading=Date.now();var inline=%s;var urls=%s;function ver(c){var m=/var VERSION = "([^"]+)"/.exec(c);return m?m[1]:"0";}function cmp(a,b){var x=a.split("."),y=b.split(".");for(var i=0;i<3;i++){var a1=parseInt(x[i],10)||0,b1=parseInt(y[i],10)||0;if(a1!==b1)return a1-b1;}return 0;}var done=false;var MSG=%MSG%;function run(code){if(done)return;done=true;try{(0,eval)(code);}catch(e){try{var d=document.createElement("div");d.textContent=MSG+e;d.setAttribute("style","position:fixed;bottom:10px;right:12px;z-index:99999;background:#ffdddd;border:1px solid #999;padding:10px;font-family:Tahoma;font-size:12px;direction:rtl;box-shadow:0 3px 10px rgba(0,0,0,.3)");document.body.appendChild(d);}catch(_){}}}function useInline(){run(inline);}function tryRemote(i){if(done)return;if(i>=urls.length){useInline();return;}try{fetch(urls[i]).then(function(r){if(!r.ok){throw new Error("http "+r.status)}return r.text();}).then(function(t){if(cmp(ver(t),ver(inline))>=0){run(t);}else{useInline();}}).catch(function(){tryRemote(i+1);});}catch(e){tryRemote(i+1);}}setTimeout(useInline,15000);tryRemote(0);})();"""

out_offline = (
    OFFLINE
    .replace("%MSG%", js_str("خطا در اجرای فیلترها: "))
    .replace("%s", json.dumps(CODE, ensure_ascii=False), 1)
)
# دومین %s = urls (اولین %s جای inline را گرفت)
out_offline = out_offline.replace("%s", json.dumps(URLS, ensure_ascii=True), 1)
io.open(os.path.join(ROOT, "bookmarklet-offline.txt"), "w", encoding="utf-8").write(out_offline)
print("bookmarklet-offline.txt (long, offline-first) chars:", len(out_offline))

# ---------- صفحه‌ی نصب install.html ----------
INSTALL = """<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>نصب فیلترهای دیده‌بان بازار</title>
<style>
body{font-family:Tahoma,Vazirmatn,sans-serif;background:#f4f6f8;color:#222;max-width:720px;margin:30px auto;padding:0 16px;direction:rtl}
h1{font-size:20px}
.card{background:#fff;border:1px solid #ddd;border-radius:10px;padding:18px 22px;margin:14px 0;box-shadow:0 2px 8px rgba(0,0,0,.06)}
.btn{display:inline-block;background:#0b7a3b;color:#fff !important;text-decoration:none;font-size:16px;font-weight:bold;padding:14px 26px;border-radius:8px;cursor:grab;border:2px dashed #0b7a3b}
.btn:hover{background:#096a33}
ol li{margin:8px 0;line-height:1.9}
textarea{width:100%;box-sizing:border-box;direction:ltr;font-family:monospace;font-size:11px;border:1px solid #bbb;border-radius:6px;padding:8px}
button{font-family:inherit;font-size:14px;padding:8px 18px;border-radius:6px;border:1px solid #0b7a3b;background:#e8f5ee;color:#0b7a3b;font-weight:bold;cursor:pointer;margin-top:8px}
.note{background:#fff8e1;border:1px solid #e6c96b;border-radius:8px;padding:10px 14px;font-size:13px;line-height:1.9}
code{direction:ltr;display:inline-block;background:#eee;padding:1px 6px;border-radius:4px;font-size:12px}
</style>
</head>
<body>
<h1>نصب بوکمارکلت فیلترهای دیده‌بان بازار</h1>
<div class="card">
<p><b>روش ۱ — کشیدن با ماوس ( پیشنهادی، بدون کپی‌پیست ):</b></p>
<ol>
<li>در مرورگر نوار بوکمارک‌ها را نشان بدهید: <code>Ctrl+Shift+B</code></li>
<li>دکمه سبز زیر را با ماوس بگیرید و روی نوار بوکمارک‌ها رها کنید:</li>
<p style="text-align:center"><a class="btn" href='__BM__'>🎯 فیلترهای دیده‌بان بازار</a></p>
<li>به صفحه‌ی <b>دیده‌بان بازار پیشرفته</b> بروید: <code>old.tsetmc.com/Loader.aspx?ParTree=15131F</code></li>
<li>روی بوکمارک تازه کلیک کنید؛ پنل «فیلترهای بوکمارکلت» باید پایین صفحه ظاهر شود.</li>
</ol>
</div>
<div class="card">
<p><b>روش ۲ — پیست در کنسول ( اگر کشیدن ممکن نبود ):</b></p>
<p>در صفحه‌ی دیده‌بان بازار <code>F12</code> را بزنید، تب Console، سپس کد را از کادر زیر کپی و پیست و Enter کنید:</p>
<textarea id="code" readonly rows="6"></textarea>
<button id="cp">📋 کپی کد بوکمارکلت</button>
</div>
<div class="note">
<b>نکته‌ها:</b>
<ul>
<li>اگر این صفحه را با آدرس <code>raw.githubusercontent.com</code> باز کرده‌اید و به‌جای صفحه، متن کد می‌بینید، از لینک <code>cdn.jsdelivr.net</code> استفاده کنید.</li>
<li>اگر بعد از کلیک روی بوکمارک، بنر قرمز «دانلود شکست خورد» آمد، یعنی هیچ‌کدام از ۵ آینه‌ی دانلود روی شبکه‌ی شما در دسترس نبودند؛ آنگاه فایل <code>tsetmc-filters.js</code> را از گیت‌هاب دانلود کرده و در کنسول پیست کنید.</li>
<li>کد فیلترها از شاخه‌ی <code>arena/01a04e69-amin</code> مخزن <code>aminchat/amin</code> بار می‌شود و با هر به‌روزرسانی همان بوکمارک، نسخه‌ی جدید را می‌گیرد (نیازی به تعویض بوکمارک نیست).</li>
</ul>
</div>
<script>
document.getElementById("code").value=document.querySelector("a.btn").getAttribute("href");
document.getElementById("cp").onclick=function(){var t=document.getElementById("code");t.select();t.setSelectionRange(0,999999);try{navigator.clipboard.writeText(t.value)}catch(e){document.execCommand("copy")}this.textContent="کپی شد ✓";};
</script>
</body>
</html>
"""
out_install = INSTALL.replace("__BM__", out_short)
io.open(os.path.join(ROOT, "install.html"), "w", encoding="utf-8").write(out_install)
print("install.html bytes:", len(out_install.encode("utf-8")))
