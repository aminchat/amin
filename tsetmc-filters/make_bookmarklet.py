#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""ساخت بوکمارکلت offline-first: کد کامل داخل خود بوکمارکلت + آپدیت خودکار از گیت‌هاب/CDN"""
import json, io, os

ROOT = os.path.dirname(os.path.abspath(__file__))
CODE = io.open(os.path.join(ROOT, "tsetmc-filters.js"), encoding="utf-8").read()

COMMIT = "af12c192f4a6862a81a8e28805564ccada8badaf"
URLS = [
    "https://raw.githubusercontent.com/aminchat/amin/arena/01a04e69-amin/tsetmc-filters/tsetmc-filters.js",
    "https://cdn.jsdelivr.net/gh/aminchat/amin@" + COMMIT + "/tsetmc-filters/tsetmc-filters.js",
]

inline = json.dumps(CODE, ensure_ascii=False)
urls = json.dumps(URLS, ensure_ascii=False)

LOADER = r"""javascript:(function(){if(window.__tfbLoading&&Date.now()-window.__tfbLoading<20000){return}window.__tfbLoading=Date.now();var inline=%s;var urls=%s;function ver(c){var m=/var VERSION = "([^"]+)"/.exec(c);return m?m[1]:"0";}function cmp(a,b){var x=a.split("."),y=b.split(".");for(var i=0;i<3;i++){var a1=parseInt(x[i],10)||0,b1=parseInt(y[i],10)||0;if(a1!==b1)return a1-b1;}return 0;}var done=false;function run(code){if(done)return;done=true;try{(0,eval)(code);}catch(e){try{var d=document.createElement("div");d.textContent="خطا در اجرای فیلترها: "+e;d.style.cssText="position:fixed;bottom:10px;right:12px;z-index:99999;background:#ffdddd;border:1px solid #999;padding:10px;font-family:Tahoma;font-size:12px;direction:rtl;box-shadow:0 3px 10px rgba(0,0,0,.3)";document.body.appendChild(d);}catch(_){}}}function useInline(){run(inline);}function tryRemote(i){if(done)return;if(i>=urls.length){useInline();return;}try{fetch(urls[i]).then(function(r){if(!r.ok){throw new Error("http "+r.status)}return r.text();}).then(function(t){if(cmp(ver(t),ver(inline))>=0){run(t);}else{useInline();}}).catch(function(){tryRemote(i+1);});}catch(e){tryRemote(i+1);}}setTimeout(useInline,15000);tryRemote(0);})();"""

out = LOADER % (inline, urls)
outpath = os.path.join(ROOT, "bookmarklet.txt")
io.open(outpath, "w", encoding="utf-8").write(out)
print("bookmarklet chars:", len(out))
print("written to", outpath)
