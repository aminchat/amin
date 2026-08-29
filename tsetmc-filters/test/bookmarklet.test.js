/*
 * تست لوادر بوکمارکلت (offline-first)
 * سناریوها:
 *  1) آفلاین کامل -> کد inline اجرا شود
 *  2) آنلاین نسخه‌ی یکسان -> کد remote اجرا شود
 *  3) remote نسخه‌ی جدیدتر -> کد remote اجرا شود
 *  4) raw شکست، jsDelivr موفق -> remote اجرا شود
 *  5) هر دو شکست -> inline اجرا شود
 *  6) دابل‌کلیک در ۲۰ ثانیه -> بار دوم بی‌اثر باشد
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const FIX = path.join(__dirname, "fixtures");
const FILTERS_FILE = path.join(ROOT, "tsetmc-filters.js");
const BM = fs.readFileSync(path.join(ROOT, "bookmarklet-offline.txt"), "utf-8").replace(/^javascript:/, "");

let engineCode = fs.readFileSync(path.join(FIX, "engine_marketwatch.js"), "utf-8").trim();
engineCode = engineCode.replace(/^<script[^>]*>/, "").replace(/<\/script>\s*$/, "").trim();
const helpers = fs.readFileSync(path.join(FIX, "helpers.js"), "utf-8");
const sectorsCode = fs.readFileSync(path.join(FIX, "sectors.js"), "utf-8");
const filtersCode = fs.readFileSync(FILTERS_FILE, "utf-8");

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
  function row(o) {
    return Object.assign({
      inscode: "100", iid: "100", l18: "AAAA", l30: "شرکت آ", cs: "27", flow: "1", yval: "300",
      cgrvalcot: "", heven: "140000", pf: "0", pc: "0", pcc: "0", pcp: "0", pl: "0", plc: "0", plp: "0",
      tno: "0", tvol: "0", tval: "0", pmin: "0", pmax: "0", py: "0", eps: "", pe: "",
      bvol: "10000000", tmax: "0", tmin: "0", z: "10", predtran: "0", buyop: "0",
      zo1: "", zd1: "", pd1: "", po1: "", qd1: "", qo1: "", render: "", preview: "", mv: "1000000000"
    }, o);
  }
  w.mw.AddNewRowToStore("101", row({ inscode: "101", l18: "FBIC1", cs: "27", pl: "28500", plp: "3.25", pc: "28500", pcp: "3.25", py: "27600", pf: "27800", pmin: "27500", pmax: "28600", tno: "45000", tvol: "95000000", tval: "2700000000000", bvol: "80000000", eps: "3200", pe: "8.9" }));
  w.mw.SelectFilter(-1);
  return w;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ " + name + (extra ? "  [" + extra + "]" : "")); }
}

function stubFetch(w, results) {
  // results: آرایه‌ای از "reject" یا متن (کد remote) برای هر صدا زدن متوالی
  let i = 0;
  w.fetch = function (url) {
    const r = results[Math.min(i, results.length - 1)];
    i++;
    if (r === "reject") return Promise.reject(new Error("blocked: " + url));
    return Promise.resolve({ ok: true, text: () => Promise.resolve(r) });
  };
}

async function scenario(name, fetchResults, expect) {
  const w = makeWindow();
  stubFetch(w, fetchResults);
  w.eval(BM);
  await sleep(3500); // صبر برای boot() فیلترها + Promiseهای لوادر
  check(name + " -> پنل ساخته شد", !!w.document.getElementById("tfPanel"));
  check(name + " -> API موجود است", !!w.__tsetmcFilters);
  if (expect === "remote") check(name + " -> کد remote اجرا شد", w.__tfbTestMarker === "remote");
  if (expect === "inline") check(name + " -> کد inline اجرا شد", w.__tfbTestMarker === undefined);
  w.eval("window.onbeforeunload = null;");
  try { w.close(); } catch (e) {}
}

(async () => {
  const newer = filtersCode.replace('var VERSION = "1.0.0"', 'var VERSION = "9.9.9"') + "\nwindow.__tfbTestMarker='remote';";
  const same = filtersCode + "\nwindow.__tfbTestMarker='remote';";

  await scenario("۱) آفلاین کامل", ["reject"], "inline");
  await scenario("۲) آنلاین نسخه‌ی یکسان", [same], "remote");
  await scenario("۳) remote نسخه‌ی جدیدتر", [newer], "remote");
  await scenario("۴) raw شکست / jsDelivr موفق", ["reject", same], "remote");
  await scenario("۵) هر دو شکست", ["reject"], "inline");

  // ۶) دابل‌کلیک
  {
    const w = makeWindow();
    stubFetch(w, ["reject"]);
    w.eval(BM);
    w.eval(BM); // کلیک دوم بلافاصله
    await sleep(3500);
    check("۶) دابل‌کلیک -> پنل فقط یک‌بار ساخته شد", w.document.querySelectorAll("#tfPanel").length === 1);
    check("۶) دابل‌کلیک -> API یک‌بار ساخته شد", w.__tsetmcFilters && typeof w.__tsetmcFilters.enable === "function");
    try { w.close(); } catch (e) {}
  }

  console.log("\n================== نتیجه: " + passed + " موفق / " + failed + " ناموفق ==================");
  process.exit(failed > 0 ? 1 : 0);
})();
