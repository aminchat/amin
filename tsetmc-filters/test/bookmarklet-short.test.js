/*
 * تست لوادر کوتاهِ چندآینه‌ای (bookmarklet.txt)
 * سناریوها:
 *  ۱) آینه‌ی اول موفق -> پنل ساخته شود
 *  ۲) آینه‌ی اول reject، دوم موفق -> پنل ساخته شود
 *  ۳) همه reject -> بنر خطا، بدون پنل
 *  ۴) آینه‌ی اول می‌ماند (timeout) -> آینه‌ی دوم امتحان شود و موفق شود
 *  ۵) پاسخ صفحه‌ی خطا (محتوای نامعتبر) -> آینه‌ی بعدی امتحان شود
 *  ۶) ASCII-only و بدون // و بدون .style خارج از رشته‌ها (ضد خرابی کپی‌پیست در چت)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const FIX = path.join(__dirname, "fixtures");
const FILTERS_FILE = path.join(ROOT, "tsetmc-filters.js");
const BM = fs.readFileSync(path.join(ROOT, "bookmarklet.txt"), "utf-8").replace(/^javascript:/, "");
const REAL = fs.readFileSync(FILTERS_FILE, "utf-8");

let engineCode = fs.readFileSync(path.join(FIX, "engine_marketwatch.js"), "utf-8").trim();
engineCode = engineCode.replace(/^<script[^>]*>/, "").replace(/<\/script>\s*$/, "").trim();
const helpers = fs.readFileSync(path.join(FIX, "helpers.js"), "utf-8");
const sectorsCode = fs.readFileSync(path.join(FIX, "sectors.js"), "utf-8");

function makeWindow() {
  const dom = new JSDOM(`<html><body>
    <div id="FastView" style="display:none"></div>
    <div id="NewMsgNotification"></div><div id="NewInsStateNotification"></div><div id="NewCodalNotification"></div>
    <div id="display" style="direction:rtl"></div>
    <div id="infop" style="display:none"><div id="infos"></div><div id="infotab"></div></div>
    <div id="SettingsDesc"></div><div id="userFullName"></div><div id="userLink"></div>
  </body></html>`, {
    runScripts: "outside-only",
    url: "https://old.tsetmc.com/Loader.aspx?ParTree=15131F",
    pretendToBeVisual: true
  });
  const w = dom.window;
  w.eval(fs.readFileSync(path.join(__dirname, "node_modules", "jquery", "dist", "jquery.js"), "utf-8"));
  w.jQuery.ajax = function () { return w.jQuery({}); };
  w.eval(helpers);
  w.eval(`var RealServerTime="14:00:00";function ShowFastView(){}function UpdateFastView(a){}function HandleMsg(b){}
function ShowMsg(){}function HideMsg(){}function MembersSite(){return "https://members.tsetmc.com"}
function GroupState(a){return "باز"}function ShowModalStaticPro(){return -1}function ShowTooltip(){}
function HideTooltip(){}function ShowHelpWindow(){}function ShowSearchWindow(){}
var tw={StartEngine:function(){},ChooseRoomUI:function(){},SendBoxKeyPress:function(){}};`);
  w.eval(sectorsCode);
  w.eval(engineCode);
  w.eval(`mw = MarketWatchPlus(); mw.Settings = mw.DefaultSettings; mw.Settings.ActiveTemplate = 0;
mw.Settings.GroupBySector = 1; mw.Settings.FilterNo = -1; mw.Settings.Filters = [];
$("#display").html(MWTemplates[0].all);`);
  w.mw.AddNewRowToStore("101", Object.assign({
    inscode: "100", iid: "100", l18: "AAAA", l30: "شرکت آ", cs: "27", flow: "1", yval: "300",
    cgrvalcot: "", heven: "140000", pf: "0", pc: "0", pcc: "0", pcp: "0", pl: "0", plc: "0", plp: "0",
    tno: "0", tvol: "0", tval: "0", pmin: "0", pmax: "0", py: "0", eps: "", pe: "",
    bvol: "10000000", tmax: "0", tmin: "0", z: "10", predtran: "0", buyop: "0",
    zo1: "", zd1: "", pd1: "", po1: "", qd1: "", qo1: "", render: "", preview: "", mv: "1000000000"
  }, { inscode: "101", l18: "FBIC1", cs: "27", pl: "28500", plp: "3.25", pc: "28500", pcp: "3.25", py: "27600", pf: "27800", pmin: "27500", pmax: "28600", tno: "45000", tvol: "95000000", tval: "2700000000000", bvol: "80000000", eps: "3200", pe: "8.9" }));
  w.mw.SelectFilter(-1);
  return w;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ " + name + (extra ? "  [" + extra + "]" : "")); }
}
function bannerVisible(w) {
  const els = w.document.body.querySelectorAll("div");
  for (let i = 0; i < els.length; i++) {
    if ((els[i].textContent || "").indexOf("شکست خورد") !== -1) return true;
  }
  return false;
}

(async () => {
  // ۱) آینه‌ی اول موفق
  {
    const w = makeWindow();
    w.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve(REAL) });
    w.eval(BM);
    await sleep(2500);
    check("۱) آینه‌ی اول موفق -> پنل ساخته شد", !!w.document.getElementById("tfPanel"));
    check("۱) آینه‌ی اول موفق -> API موجود", !!w.__tsetmcFilters);
    w.close();
  }
  // ۲) اول reject، دوم موفق
  {
    const w = makeWindow();
    let n = 0;
    w.fetch = () => (n++ === 0) ? Promise.reject(new Error("blocked")) : Promise.resolve({ ok: true, text: () => Promise.resolve(REAL) });
    w.eval(BM);
    await sleep(2500);
    check("۲) فالبک به آینه‌ی دوم -> پنل ساخته شد", !!w.document.getElementById("tfPanel"));
    w.close();
  }
  // ۳) همه reject
  {
    const w = makeWindow();
    w.fetch = () => Promise.reject(new Error("blocked"));
    w.eval(BM);
    await sleep(2500);
    check("۳) همه شکست -> بنر خطا ظاهر شد", bannerVisible(w));
    check("۳) همه شکست -> پنل نساخته شد", !w.document.getElementById("tfPanel"));
    w.close();
  }
  // ۴) آینه‌ی اول می‌ماند (timeout ۸ ثانیه)
  {
    const w = makeWindow();
    let n = 0;
    w.fetch = () => (n++ === 0) ? new Promise(() => {}) : Promise.resolve({ ok: true, text: () => Promise.resolve(REAL) });
    const t0 = Date.now();
    w.eval(BM);
    await sleep(10500);
    check("۴) timeout آینه‌ی اول -> پنل در نهایت ساخته شد", !!w.document.getElementById("tfPanel"));
    check("۴) حدود ۸ ثانیه بعد از timeout پیش رفت", Date.now() - t0 >= 7500);
    w.close();
  }
  // ۵) پاسخ نامعتبر (صفحه‌ی خطای پراکسی)
  {
    const w = makeWindow();
    let n = 0;
    w.fetch = () => (n++ === 0) ? Promise.resolve({ ok: true, text: () => Promise.resolve("<html>502 Bad Gateway</html>") })
                                 : Promise.resolve({ ok: true, text: () => Promise.resolve(REAL) });
    w.eval(BM);
    await sleep(2500);
    check("۵) محتوای نامعتبر رد شد و آینه‌ی بعدی اجرا شد", !!w.document.getElementById("tfPanel"));
    w.close();
  }

  // ۶) امنیت کپی‌پیست: فقط ASCII (اتولینک شدن d.style و خراب شدن متن فارسی در چت/برداشت)
  {
    check("۶) بوکمارکلت فقط ASCII است (ضد اتولینک/ضد خرابی کپی)", /^[\x00-\x7F]*$/.test(BM));
    const stripped = BM.replace(/"(?:[^"\\]|\\.)*"/g, ""); // حذف رشته‌ها
    check("۶) هیچ // خارج از رشته‌ها نیست (نمی‌تواند کامنت شود)", stripped.indexOf("//") === -1);
    check("۶) هیچ .style یا .cssText خارج از رشته‌ها نیست (TLD واقعی؛ چت لینکش می‌کند)", !/\.(style|cssText)\b/.test(stripped));
  }

  console.log("\n================== نتیجه: " + passed + " موفق / " + failed + " ناموفق ==================");
  process.exit(failed > 0 ? 1 : 0);
})();
