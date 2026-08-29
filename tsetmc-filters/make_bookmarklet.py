#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ساخت دو نسخه‌ی بوکمارکلت:
  bookmarklet.txt          -> کوتاه و چندآینه‌ای (اصلی؛ در همه مرورگرها جا می‌شود)
  bookmarklet-offline.txt  -> offline-first (کد کامل داخل بوکمارکلت؛ برای مرورگرهای با سقف بلند)
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

# ---------- نسخه‌ی کوتاه و چندآینه‌ای ----------
SHORT = r"""javascript:(function(){if(window.__tfb3){return}window.__tfb3=1;var urls=%s;var i=0,TO=8000;function banner(t){var d=document.createElement("div");d.style.cssText="position:fixed;bottom:10px;right:12px;z-index:99999;max-width:440px;background:#ffdddd;border:1px solid #999;padding:10px 14px;font-family:Tahoma,sans-serif;font-size:12px;direction:rtl;box-shadow:0 3px 10px rgba(0,0,0,.3)";d.textContent=t;d.addEventListener("click",function(){d.remove()});document.body.appendChild(d);}function fin(){window.__tfb3=0;}function fetchT(u){return new Promise(function(res,rej){var t=setTimeout(function(){rej(0)},TO);try{fetch(u).then(function(r){clearTimeout(t);if(!r.ok){throw 0}return r.text();}).then(res,function(e){clearTimeout(t);rej(e)});}catch(e){clearTimeout(t);rej(e);}});}function next(){if(i>=urls.length){banner("دانلود کد فیلترها از همه آدرس‌ها شکست خورد. می‌توانید موقتاً فایل tsetmc-filters.js را از گیت‌هاب دانلود کرده و در کنسول (F12) پیست و اجرا کنید.");fin();return;}var u=urls[i++];try{fetchT(u).then(function(t){if(t.indexOf("__tsetmcFiltersLoaded")===-1){next();return;}try{(0,eval)(t);}catch(e){banner("کد دانلود شد ولی خطا در اجرا داشت: "+e);}fin();}).catch(function(){next();});}catch(e){next();}}next();})();"""

out_short = SHORT % json.dumps(URLS, ensure_ascii=False)
io.open(os.path.join(ROOT, "bookmarklet.txt"), "w", encoding="utf-8").write(out_short)
print("bookmarklet.txt (short, multi-mirror) chars:", len(out_short))

# ---------- نسخه‌ی offline-first (بلند) ----------
inline = json.dumps(CODE, ensure_ascii=False)
OFFLINE = r"""javascript:(function(){if(window.__tfbLoading&&Date.now()-window.__tfbLoading<20000){return}window.__tfbLoading=Date.now();var inline=%s;var urls=%s;function ver(c){var m=/var VERSION = "([^"]+)"/.exec(c);return m?m[1]:"0";}function cmp(a,b){var x=a.split("."),y=b.split(".");for(var i=0;i<3;i++){var a1=parseInt(x[i],10)||0,b1=parseInt(y[i],10)||0;if(a1!==b1)return a1-b1;}return 0;}var done=false;function run(code){if(done)return;done=true;try{(0,eval)(code);}catch(e){try{var d=document.createElement("div");d.textContent="خطا در اجرای فیلترها: "+e;d.style.cssText="position:fixed;bottom:10px;right:12px;z-index:99999;background:#ffdddd;border:1px solid #999;padding:10px;font-family:Tahoma;font-size:12px;direction:rtl;box-shadow:0 3px 10px rgba(0,0,0,.3)";document.body.appendChild(d);}catch(_){}}}function useInline(){run(inline);}function tryRemote(i){if(done)return;if(i>=urls.length){useInline();return;}try{fetch(urls[i]).then(function(r){if(!r.ok){throw new Error("http "+r.status)}return r.text();}).then(function(t){if(cmp(ver(t),ver(inline))>=0){run(t);}else{useInline();}}).catch(function(){tryRemote(i+1);});}catch(e){tryRemote(i+1);}}setTimeout(useInline,15000);tryRemote(0);})();"""

out_offline = OFFLINE % (inline, json.dumps(URLS, ensure_ascii=False))
io.open(os.path.join(ROOT, "bookmarklet-offline.txt"), "w", encoding="utf-8").write(out_offline)
print("bookmarklet-offline.txt (long, offline-first) chars:", len(out_offline))
