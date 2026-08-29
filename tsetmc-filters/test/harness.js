/*
 * تست یکپارچه‌ی فیلترهای دیده‌بان بازار
 * ---------------------------------------
 * موتور واقعی سایت (MarketWatchPlus از تsetmc.html ذخیره‌شده) را در jsdom بارگذاری می‌کند،
 * داده‌ی نمونه می‌زند و اسکریپت بوکمارکلت را روی همان موتور واقعی اجرا می‌کند؛
 * یعنی دقیقاً همان مسیر eval(mw.FilterCode) و RenderData که در مرورگر کاربر اجرا می‌شود.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const FIX = path.join(__dirname, "fixtures");
const FILTERS_FILE = path.join(__dirname, "..", "tsetmc-filters.js");

let engineCode = fs.readFileSync(path.join(FIX, "engine_marketwatch.js"), "utf-8").trim();
engineCode = engineCode.replace(/^<script[^>]*>/, "").replace(/<\/script>\s*$/, "").trim();
const helpers = fs.readFileSync(path.join(FIX, "helpers.js"), "utf-8");
const sectorsCode = fs.readFileSync(path.join(FIX, "sectors.js"), "utf-8");
const filtersCode = fs.readFileSync(FILTERS_FILE, "utf-8");

const dom = new JSDOM(`<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body>
  <div id="FastView" style="display:none"></div>
  <div id="NewMsgNotification"></div>
  <div id="NewInsStateNotification"></div>
  <div id="NewCodalNotification"></div>
  <!-- #header و #main و #footer توسط قالب سایت داخل #display تزریق می‌شوند -->
  <div id="display" style="direction:rtl"></div>
  <div id="infop" style="display:none"><div id="infos"></div><div id="infotab"></div></div>
  <div id="SettingsDesc"></div>
  <div id="userFullName"></div>
  <div id="userLink"></div>
</body></html>`, {
  runScripts: "outside-only",
  url: "https://old.tsetmc.com/Loader.aspx?ParTree=15131F",
  pretendToBeVisual: true
});

const w = dom.window;
const doc = w.document;

// --- jQuery واقعی (همانند صفحه‌ی سایت) ---
w.eval(fs.readFileSync(path.join(__dirname, "node_modules", "jquery", "dist", "jquery.js"), "utf-8"));
const jq = w.jQuery;
jq.ajax = function () { return jq({}); }; // حلقه‌ی داده را خاموش می‌کنیم

// --- توکن‌های کمکی واقعی سایت ---
w.eval(helpers);

// --- توکن‌های هم‌لایه‌ای که موتور به آن‌ها نیاز دارد (stub ساده) ---
w.eval(`
  var RealServerTime = "14:00:00";
  function ShowFastView(){}
  function UpdateFastView(a){}
  function HandleMsg(b){}
  function ShowMsg(){} function HideMsg(){}
  function MembersSite(){return "https://members.tsetmc.com"}
  function GroupState(a){return "باز"}
  function ShowModalStaticPro(){return -1}
  function ShowTooltip(){} function HideTooltip(){}
  function ShowHelpWindow(){}
  function ShowSearchWindow(){}
  var tw = { StartEngine:function(){}, ChooseRoomUI:function(){}, SendBoxKeyPress:function(){} };
`);

// --- Sectors واقعی + موتور واقعی (ColDefault, MWTemplates, MarketWatchPlus) ---
w.eval(sectorsCode);
w.eval(engineCode);

// --- راه‌اندازی موتور مثل StartMarketWatch (بدون AJAX) ---
w.eval(`
  mw = MarketWatchPlus();
  mw.Settings = mw.DefaultSettings;
  mw.Settings.ActiveTemplate = 0;   // جدول کلاسیک
  mw.Settings.GroupBySector = 1;
  mw.Settings.FilterNo = -1;
  mw.Settings.Filters = [];
  $("#display").html(MWTemplates[0].all);
`);
w.mw = w.mw; // global

// --- داده‌ی نمونه (ساختار واقعی فید MarketWatchInit) ---
function row(o) {
  const base = {
    inscode: "100", iid: "100", l18: "AAAA", l30: "شرکت آ", cs: "27", flow: "1", yval: "300",
    cgrvalcot: "", heven: "140000", pf: "0", pc: "0", pcc: "0", pcp: "0", pl: "0", plc: "0", plp: "0",
    tno: "0", tvol: "0", tval: "0", pmin: "0", pmax: "0", py: "0", eps: "", pe: "",
    bvol: "10000000", tmax: "0", tmin: "0", z: "10", predtran: "0", buyop: "0",
    zo1: "", zd1: "", pd1: "", po1: "", qd1: "", qo1: "",
    render: "", preview: "", mv: "1000000000"
  };
  return Object.assign(base, o);
}
const rows = [
  row({ inscode: "101", l18: "FBIC1", l30: "فولاد مبارکه اصفهان", cs: "27", pl: "28500", plp: "3.25", pc: "28500", pcp: "3.25", py: "27600", pf: "27800", pmin: "27500", pmax: "28600", tno: "45000", tvol: "95000000", tval: "2700000000000", bvol: "80000000", eps: "3200", pe: "8.9" }),
  row({ inscode: "102", l18: "SHAB", l30: "شهره", cs: "57", pl: "145000", plp: "-1.20", pc: "145000", pcp: "-1.20", py: "146750", pf: "146000", pmin: "144800", pmax: "147000", tno: "800", tvol: "1200000", tval: "174000000000", bvol: "1000000", eps: "12000", pe: "12" }),
  row({ inscode: "103", l18: "XIRAN", l30: "بانک ملی (فرابورس)", cs: "57", flow: "3", pl: "62000", plp: "5.50", pc: "62000", pcp: "5.50", py: "58770", pf: "59000", pmin: "58800", pmax: "62200", tno: "30000", tvol: "30000000", tval: "1850000000000", bvol: "9000000", eps: "1500", pe: "41.3" }),
  row({ inscode: "104", l18: "تسه01", l30: "تسهیلات مسکن 1", cs: "59", yval: "214", pl: "15000", plp: "0.66", pc: "15000", pcp: "0.66", py: "14900", pf: "14900", pmin: "14900", pmax: "15100", tno: "5000", tvol: "50000000", tval: "750000000000", bvol: "20000000" }),
  row({ inscode: "105", l18: "IRFUND", l30: "صندوق سرمایه‌گذاری", cs: "68", yval: "305", pl: "42000", plp: "0.20", pc: "42000", pcp: "0.20", py: "41900", pf: "41900", pmin: "41900", pmax: "42100", tno: "900", tvol: "900000", tval: "37800000000", bvol: "800000" }),
  row({ inscode: "106", l18: "ATIRF2609", l30: "آتی فلزات", cs: "64", yval: "263", pl: "250000", plp: "8.10", pc: "250000", pcp: "8.10", py: "231250", pf: "232000", pmin: "231000", pmax: "251000", tno: "12000", tvol: "12000000", tval: "3000000000000", bvol: "4000000" }),
  row({ inscode: "107", l18: "HATQ1", l30: "حق تقدم", cs: "27", yval: "400", pl: "3200", plp: "2.10", pc: "3200", pcp: "2.10", py: "3134", pf: "3130", pmin: "3100", pmax: "3250", tno: "700", tvol: "700000", tval: "2240000000", bvol: "600000" }),
  row({ inscode: "108", l18: "ZAJEO", l30: "انرژی خورشیدی", cs: "40", flow: "6", pl: "8900", plp: "0.00", pc: "8900", pcp: "0.00", py: "8900", pf: "8900", pmin: "8900", pmax: "8900", tno: "300", tvol: "300000", tval: "2670000000", bvol: "250000" }),
  row({ inscode: "109", l18: "NOTRA", l30: "نماده بدون معامله", cs: "27", pl: "12000", plp: "0", pc: "12000", pcp: "0", py: "12000", pf: "0", pmin: "0", pmax: "0", tno: "0", tvol: "0", tval: "0", bvol: "5000000" }),
  row({ inscode: "110", l18: "CHEAP", l30: "نماد ارزانی", cs: "42", pl: "500", plp: "0.80", pc: "500", pcp: "0.80", py: "496", pf: "495", pmin: "490", pmax: "510", tno: "20000", tvol: "200000000", tval: "100000000000", bvol: "100000000", eps: "120", pe: "4.2" }),
  row({ inscode: "111", l18: "HIGPE", l30: "نماد پی‌ای بالا", cs: "72", pl: "55000", plp: "0.30", pc: "55000", pcp: "0.30", py: "54800", pf: "54700", pmin: "54500", pmax: "55200", tno: "150", tvol: "150000", tval: "8250000000", bvol: "120000", eps: "1000", pe: "55" }),
  row({ inscode: "112", l18: "FABRD", l30: "پتروشیمی فارابی", cs: "23", pl: "41000", plp: "-3.10", pc: "41000", pcp: "-3.10", py: "42316", pf: "42000", pmin: "40900", pmax: "42200", tno: "60000", tvol: "150000000", tval: "6150000000000", bvol: "60000000", eps: "4500", pe: "9.1" })
];
for (const [id, r] of Object.entries({})) {} // noop
w.eval(`mw.RemoveForTest = null;`);
for (const r of rows) {
  w.mw.AddNewRowToStore(r.inscode, r);
}

// رندر اولیه بدون فیلتر
w.mw.SelectFilter(-1);

// ===================== ابزار تست =====================
let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.log("  ✗ " + name + (extra ? "  [" + extra + "]" : "")); }
}
function visibleL18() {
  const main = doc.getElementById("main");
  const out = [];
  for (let i = 0; i < main.children.length; i++) {
    const id = main.children[i].id;
    if (id && id.charAt(0) !== "S") out.push(w.mw.AllRows[id].l18);
  }
  return out;
}
function tick() { w.mw.RenderData(); } // همان تیک رندری که UpdateMarketWatch صدا می‌زند

console.log("\n=== ۱) رندر اولیه بدون فیلتر ===");
check("تمام ۱۲ نماد نمایش داده شده", visibleL18().length === 12, "actual=" + visibleL18().length);

console.log("\n=== ۲) بارگذاری اسکریپت بوکمارکلت ===");
w.eval(filtersCode);
check("اوبژه‌ی window.__tsetmcFilters ساخته شد", !!w.__tsetmcFilters);
check("پنل در DOM ساخته شد", !!doc.getElementById("tfPanel"));
check("عنوان پنل درست است", (doc.getElementById("tfTitle") || {}).textContent.indexOf("فیلتر") !== -1);

// صبر تا boot() (polling 300ms)
setTimeout(function () {
  console.log("\n=== ۳) فیلتر حداقل درصد تغییر >= ۵ ===");
  w.__tsetmcFilters.enable("minPct", { x: 5 });
  const v1 = visibleL18();
  check("فقط XIRAN(۵.۵٪) و ATIRF2609(۸.۱٪) می‌مانند",
    JSON.stringify(v1.sort()) === JSON.stringify(["ATIRF2609", "XIRAN"]), "actual=" + v1);
  check("mw.FilterCode روی موتور سایت تنظیم شد", /row\.plp/.test(w.mw.FilterCode || ""), w.mw.FilterCode);
  check("فیلتر در سیستم فیلتر سایت ثبت شد", w.mw.Settings.Filters.some(f => f.FilterName === "فیلترهای بوکمارکلت"));
  check("FilterNo به فیلتر بوکمارکلت اشاره دارد", w.mw.Settings.FilterNo === w.mw.Settings.Filters.findIndex(f => f.FilterName === "فیلترهای بوکمارکلت"));
  check("شمارنده‌ی پنل به‌روز شده", (doc.getElementById("tfCount") || {}).textContent.length > 0, doc.getElementById("tfCount").textContent);

  console.log("\n=== ۴) ترکیب چند فیلتر (minPct + noTrade + minVol) ===");
  w.__tsetmcFilters.enable("noTrade");
  w.__tsetmcFilters.enable("minVol", { x: 10000000000 }); // ۱۰ میلیارد
  const v2 = visibleL18();
  check("ATIRF2609 حذف می‌شود (حجم ۱۲M < ۱۰B)", v2.indexOf("ATIRF2609") === -1, "actual=" + v2);
  check("XIRAN حذف می‌شود (حجم ۳۰M < ۱۰B)", v2.indexOf("XIRAN") === -1, "actual=" + v2);
  check("هیچ ردیفی باقی نمی‌ماند و هشدار در پنل ظاهر می‌شود", v2.length === 0 &&
    (doc.getElementById("tfStatus") || {}).style.display === "block",
    (doc.getElementById("tfStatus") || {}).textContent);

  console.log("\n=== ۵) حذف فیلتر (clear) ===");
  w.__tsetmcFilters.clear();
  check("mw.FilterCode خالی شد", w.mw.FilterCode === "");
  check("FilterNo به -۱ برگشت", w.mw.Settings.FilterNo === -1);
  check("دوباره همه نمادها برگشتند", visibleL18().length === 12, "actual=" + visibleL18().length);

  console.log("\n=== ۶) فیلترهای نوع‌حذفی (noDeriv + noHousing + noEnergy) ===");
  w.__tsetmcFilters.disable("minPct");
  w.__tsetmcFilters.disable("noTrade");
  w.__tsetmcFilters.disable("minVol");
  check("پس از خاموش‌شدن فیلترهای قبلی همه نمادها برگشتند", visibleL18().length === 12, "actual=" + visibleL18().length);
  w.__tsetmcFilters.enable("noDeriv");
  w.__tsetmcFilters.enable("noHousing");
  w.__tsetmcFilters.enable("noEnergy");
  const v3 = visibleL18().sort();
  const gone = ["IRFUND", "ATIRF2609", "HATQ1", "تسه01", "ZAJEO"];
  check("صندوق/آتی/حق تقدم/تسهیلات/انرژی حذف شدند", gone.every(g => v3.indexOf(g) === -1), "actual=" + v3);
  check("۷ نماد باقی مانده", v3.length === 7, "actual=" + v3.length);

  console.log("\n=== ۷) جستجوی نماد + سیاهه ===");
  w.__tsetmcFilters.disable("noDeriv"); w.__tsetmcFilters.disable("noHousing"); w.__tsetmcFilters.disable("noEnergy");
  w.__tsetmcFilters.enable("search", { kw: "FA" });
  let v4 = visibleL18().sort();
  check("جستجوی FA فقط FABRD را نشان می‌دهد (FBIC1 رشته FA ندارد)", JSON.stringify(v4) === JSON.stringify(["FABRD"]), "actual=" + v4);
  w.__tsetmcFilters.disable("search");
  w.__tsetmcFilters.enable("search", { kw: "F" });
  v4 = visibleL18().sort();
  check("جستجوی F همه نمادهای حاوی F را نشان می‌دهد", JSON.stringify(v4) === JSON.stringify(["ATIRF2609", "FABRD", "FBIC1", "IRFUND"]), "actual=" + v4);
  w.__tsetmcFilters.disable("search");
  w.__tsetmcFilters.enable("blacklist", { list: "SHAB, HIGPE" });
  const v5 = visibleL18().sort();
  check("سیاهه SHAB و HIGPE را حذف کرد", v5.indexOf("SHAB") === -1 && v5.indexOf("HIGPE") === -1 && v5.length === 10, "actual=" + v5);

  console.log("\n=== ۸) حداقل قیمت + حداکثر P/E + نسبت حجم به مبنا ===");
  w.__tsetmcFilters.disable("blacklist");
  w.__tsetmcFilters.enable("minPrice", { x: 10000 });
  w.__tsetmcFilters.enable("maxPE", { x: 15 });
  let v6 = visibleL18().sort();
  check("CHEAP(۵۰) حذف شد", v6.indexOf("CHEAP") === -1);
  check("HIGPE(P/E=55) حذف شد", v6.indexOf("HIGPE") === -1);
  check("FBIC1 و FABRD باقی ماندند", v6.indexOf("FBIC1") !== -1 && v6.indexOf("FABRD") !== -1, "actual=" + v6);
  w.__tsetmcFilters.disable("minPrice"); w.__tsetmcFilters.disable("maxPE");
  w.__tsetmcFilters.enable("minVolRatio", { x: 2 });
  const v7 = visibleL18().sort();
  check("SHAB(حجم ۱.۲M < ۲×۱M مبنا) حذف شد", v7.indexOf("SHAB") === -1, "actual=" + v7);
  check("FABRD(حجم ۱۵۰M > ۲×۶۰M مبنا) باقی ماند", v7.indexOf("FABRD") !== -1, "actual=" + v7);
  w.__tsetmcFilters.disable("minVolRatio");

  console.log("\n=== ۹) اعتبارسنجی (خطای کاربر باید نمایش داده شود) ===");
  let bad = w.__tsetmcFilters._internal.validateCode("row.pl >= (");
  check("خطای سینتیکی شناسایی شد", bad && bad.errors.length > 0, JSON.stringify(bad));
  bad = w.__tsetmcFilters._internal.validateCode("row.l18.upper()");
  check("خطای اجرایی (متد ناموجود) شناسایی شد", bad && bad.count > 0, JSON.stringify(bad));
  check("کد سالم خطایی ندارد", w.__tsetmcFilters._internal.validateCode("parseFloat(row.pl) >= 0") === null);

  console.log("\n=== ۱۰) پایداری روی localStorage سایت ===");
  const saved = w.eval("JSON.parse(localStorage.getItem('MarketWatchSettings'))");
  check("فیلتر بوکمارکلت در تنظیمات خود سایت ذخیره شد", saved.Filters.some(f => f.FilterName === "فیلترهای بوکمارکلت"));
  const panelState = w.eval("JSON.parse(localStorage.getItem('tsetmcFiltersPanel.v1'))");
  check("وضعیت پنل هم ذخیره شد", panelState && typeof panelState.enabled === "object");

  console.log("\n=== ۱۱) اجرای دوباره‌ی بوکمارکلت نباید خطا بدهد ===");
  let threw = false;
  try { w.eval(filtersCode); } catch (e) { threw = true; }
  check("بدون خطا اجرا شد (guard دوگانه)", !threw);

  console.log("\n=== ۱۲) فیلترهای ویژه (پول هوشمند / جا مانده از بازار) ===");
  // داده‌ی حقیقی/حقوقی مثل ClientTypeAll.aspx
  w.mw.ClientType["101"] = { Buy_CountI: 2000, Buy_CountN: 50, Buy_I_Volume: 40000000, Buy_N_Volume: 5000000, Sell_CountI: 8000, Sell_CountN: 30, Sell_I_Volume: 10000000, Sell_N_Volume: 8000000 };
  w.mw.ClientType["112"] = { Buy_CountI: 60000, Buy_CountN: 10, Buy_I_Volume: 30000000, Buy_N_Volume: 2000000, Sell_CountI: 20000, Sell_CountN: 5, Sell_I_Volume: 50000000, Sell_N_Volume: 1000000 };
  w.mw.ClientType["110"] = { Buy_CountI: 40000, Buy_CountN: 40, Buy_I_Volume: 80000000, Buy_N_Volume: 30000000, Sell_CountI: 45000, Sell_CountN: 20, Sell_I_Volume: 85000000, Sell_N_Volume: 4000000 };
  // سرصفحه‌ی سفارشات برای فشار خرید
  w.mw.AllRows["103"].qd1 = "8000000"; w.mw.AllRows["103"].qo1 = "2000000"; // XIRAN مثبت
  w.mw.AllRows["102"].qd1 = "5000000"; w.mw.AllRows["102"].qo1 = "1000000"; // SHAB منفی

  // --- پول هوشمند (smartBuy) ---
  w.__tsetmcFilters.enable("smartBuy");
  const s1 = visibleL18();
  check("پول هوشمند: فقط FBIC1 (سرانه خرید ۱۶× فروش، ۴۲٪ کل حجم) باقی ماند", s1.length === 1 && s1[0] === "FBIC1", "actual=" + s1);
  check("پول هوشمند: داده‌ی حقیقی/حقوقی سایت خودکار روشن شد (LoadClientType=1)", w.mw.Settings.LoadClientType === 1);
  check("پول هوشمند: عبارت فیلتر از mw.ClientType استفاده می‌کند", /mw\.ClientType\[row\.inscode\]/.test(w.mw.FilterCode || ""), w.mw.FilterCode);
  w.__tsetmcFilters.disable("smartBuy");

  // --- ورود حقوقی (legalIn) ---
  w.__tsetmcFilters.enable("legalIn");
  const s2 = visibleL18();
  check("ورود حقوقی: فقط CHEAP (خالص حقوقی ۱۳٪ کل حجم) باقی ماند", s2.length === 1 && s2[0] === "CHEAP", "actual=" + s2);
  w.__tsetmcFilters.disable("legalIn");

  // --- جا مانده از بازار (laggard) ---
  w.__tsetmcFilters.enable("laggard");
  const s3 = visibleL18();
  check("جا مانده: فقط CHEAP (P/E=4.2، هنوز ۰.۸٪) باقی ماند", s3.length === 1 && s3[0] === "CHEAP", "actual=" + s3);
  w.__tsetmcFilters.disable("laggard");

  // --- تجمع بی‌سروصدا (quietAcc با ضریب ۲) ---
  w.__tsetmcFilters.enable("quietAcc", { k: 2 });
  const s4 = visibleL18();
  check("تجمع: CHEAP و تسه01 (حجم >= ۲× مبنا و درصد کم) باقی ماندند", s4.indexOf("CHEAP") !== -1 && s4.indexOf("تسه01") !== -1 && s4.length === 2, "actual=" + s4);
  w.__tsetmcFilters.disable("quietAcc");

  // --- فشار خرید سرصفحه (bidHeavy) ---
  w.__tsetmcFilters.enable("bidHeavy");
  const s5 = visibleL18();
  check("فشار سرصفحه: فقط XIRAN (تقاضا ۴× عرضه و مثبت) — SHAB منفی حذف شد", s5.length === 1 && s5[0] === "XIRAN", "actual=" + s5);
  w.__tsetmcFilters.disable("bidHeavy");

  // --- هشدار توزیع (distress با ضریب ۲) ---
  w.__tsetmcFilters.enable("distress", { k: 2 });
  const s6 = visibleL18();
  check("توزیع: فقط FABRD (حجم ۲.۵× مبنا با افت ۳.۱٪) باقی ماند", s6.length === 1 && s6[0] === "FABRD", "actual=" + s6);
  w.__tsetmcFilters.disable("distress");

  // --- پنل جدید: بخش‌ها و سوییچ‌ها ---
  check("پنل: بخش «فیلترهای ویژه» وجود دارد", !!doc.querySelector("#tfPanel .tf-sec"));
  check("پنل: ۶ کارت ویژه ساخته شد", doc.querySelectorAll("#tfPanel .tf-card").length === 6, "actual=" + doc.querySelectorAll("#tfPanel .tf-card").length);
  check("پنل: فیلترهای پایه به‌صورت پیش‌فرض جمع‌اند", (doc.getElementById("tfBasics") || {}).style.display === "none");
  check("پنل: استایل مدرن تزریق شد", !!doc.getElementById("tfStyle"));
  check("API: لیست فیلترهای ویژه در دسترس است", w.__tsetmcFilters.specials.join(",") === "smartBuy,legalIn,laggard,quietAcc,bidHeavy,distress", w.__tsetmcFilters.specials.join(","));

  // پاک‌سازی برای بخش‌های بعدی
  w.mw.Settings.LoadClientType = 0;
  w.__tsetmcFilters.clear();

  console.log("\n================== نتیجه: " + passed + " موفق / " + failed + " ناموفق ==================");
  process.exit(failed > 0 ? 1 : 0);
}, 1200);
