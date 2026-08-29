/*!
 * تِست‌م‌سی‌سی - فیلترهای پیشرفته دیده‌بان بازار
 * ------------------------------------------------
 * فیلترها را روی صفحه‌ی «دیده‌بان بازار پیشرفته» (old.tsetmc.com/Loader.aspx?ParTree=15131F)
 * اعمال می‌کند. این اسکریپت از موتور داخلی خود سایت (اوبژه‌ی mw) استفاده می‌کند و فیلترها را
 * به‌صورت یک فیلترِ نام‌دار در سیستم فیلتر خودِ سایت ثبت می‌کند؛ بنابراین:
 *   - با هر بروزرسانی داده (هر ثانیه) به‌صورت زنده اعمال می‌شوند
 *   - در localStorage خود سایت ذخیره می‌شوند (بعد از رفرش صفحه هم فعال‌اند)
 *   - در پنجره‌ی «فیلتر» خود سایت هم دیده می‌شوند
 *
 * نسخه ۱.۱: فیلترهای ویژه (پول هوشمند بر پایه‌ی داده‌ی حقیقی/حقوقی خود سایت:
 * mw.ClientType از ClientTypeAll.aspx) + پنل مدرن
 *
 * سازنده: aminchat
 * بارگذاری توسط: بوکمارکلت (کد در README.md)
 */
(function () {
  "use strict";

  // ===================== جلوگیری از اجرای دوبار =====================
  if (window.__tsetmcFiltersLoaded) {
    if (window.__tsetmcFilters) window.__tsetmcFilters.toggle();
    return;
  }
  window.__tsetmcFiltersLoaded = true;

  var VERSION = "1.1.0";
  var FILTER_NAME = "فیلترهای بوکمارکلت";
  var LS_KEY = "tsetmcFiltersPanel.v1";

  // ===================== ابزارهای کوچک =====================
  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "dir") e.setAttribute("dir", attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (html != null) e.innerHTML = html;
    return e;
  }
  function toFaNum(s) {
    return String(s).replace(/[0-9]/g, function (d) { return "۰۱۲۳۴۵۶۷۸۹"[+d]; });
  }
  function n(v, d) { var x = parseFloat(v); return isFinite(x) ? x : d; }

  // ===================== وضعیت (localStorage) =====================
  var state = {
    enabled: {},            // id -> true
    params: {},             // id -> {key:value}
    blacklist: "",          // "AAA,BBB"
    search: "",             // کلمه‌ی جستجو در نماد
    open: true,
    basicsOpen: false       // بخش «فیلترهای پایه» جمع باشد
  };
  function loadState() {
    try {
      var raw = localStorage.getItem(LS_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (s && typeof s === "object") {
          state.enabled = s.enabled || {};
          state.params = s.params || {};
          state.blacklist = s.blacklist || "";
          state.search = s.search || "";
          state.open = s.open !== false;
          state.basicsOpen = s.basicsOpen === true;
        }
      }
    } catch (e) { /* وضعیت خراب -> پیش‌فرض */ }
  }
  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ===================== فیلترهای ویژه =====================
  // داده‌ی حقیقی/حقوقی: موتور سایت داخل eval فیلتر، mw.ClientType[row.inscode] را
  // با فیلدهای {Buy_CountI,Buy_CountN,Buy_I_Volume,Buy_N_Volume,Sell_CountI,
  // Sell_CountN,Sell_I_Volume,Sell_N_Volume} در دسترس می‌گذارد (ClientTypeAll.aspx).
  // همه‌ی شرط‌ها «نسبی» نوشته شده‌اند تا به واحد (ریال/تومان/سهم) وابسته نباشند.
  var SPECIALS = [
    {
      id: "smartBuy", icon: "🧠", group: "sp", needsCT: true,
      label: "پول هوشمند — خرید حقیقی سنگین",
      desc: "خریدار حقیقیِ بزرگ وارد شده: خالص خرید حقیقی مثبت + سرانه‌ی خرید هر حقیقی چند برابر سرانه‌ی فروش + خرید حقیقی بخش بزرگی از کل حجم",
      def: { k: 2, x: 25 }, pmeta: [{ key: "k", label: "حداقل چند برابر بودن سرانه خرید به سرانه فروش" }, { key: "x", label: "حداقل درصد خرید حقیقی از کل حجم" }],
      expr: function (p) {
        var K = n(p.k, 2), X = n(p.x, 25);
        return "(function(){var c=mw.ClientType[row.inscode];if(!c){return false}" +
          "var bv=c.Buy_I_Volume||0,sv=c.Sell_I_Volume||0,bn=c.Buy_CountI||0,sn=c.Sell_CountI||0;" +
          "if(bv<=sv||bn<=0){return false}" +
          "if(bv/Math.max(bn,1)<" + K + "*(sv/Math.max(sn,1))){return false}" +
          "var tv=parseInt(row.tvol,10)||0;" +
          "if(tv>0&&bv<" + X + "*tv/100){return false}" +
          "return true})()";
      }
    },
    {
      id: "legalIn", icon: "🏛", group: "sp", needsCT: true,
      label: "ورود پول حقوقی",
      desc: "حقوقی‌ها خالصِ خریدارند و حجم قابل توجهی از معاملات را خریده‌اند (نشان ورود نهادی)",
      def: { x: 10 }, pmeta: [{ key: "x", label: "حداقل درصد خالص خرید حقوقی از کل حجم" }],
      expr: function (p) {
        var X = n(p.x, 10);
        return "(function(){var c=mw.ClientType[row.inscode];if(!c){return false}" +
          "var net=(c.Buy_N_Volume||0)-(c.Sell_N_Volume||0);" +
          "var tv=parseInt(row.tvol,10)||0;" +
          "return net>0&&tv>0&&net>=" + X + "*tv/100})()";
      }
    },
    {
      id: "laggard", icon: "💎", group: "sp",
      label: "جا مانده از بازار (ارزنده)",
      desc: "سودآور و ارزان (P/E پایین) اما هنوز حرکت نکرده و نقدشونده است — کاندید «جا مانده از رالی»",
      def: { pe: 6, x: 1.5 }, pmeta: [{ key: "pe", label: "حداکثر P/E" }, { key: "x", label: "حداکثر قدر مطلق درصد تغییر پایانی" }],
      expr: function (p) {
        var PE = n(p.pe, 6), X = n(p.x, 1.5);
        return "(row.pe!==\"\"&&row.pe!=null&&parseFloat(row.pe)>0&&parseFloat(row.pe)<=" + PE + ")" +
          "&&Math.abs(parseFloat(row.pcp))<=" + X +
          "&&parseInt(row.tno,10)>0" +
          "&&(parseInt(row.bvol,10)>0?parseInt(row.tvol,10)>=parseInt(row.bvol,10):true)";
      }
    },
    {
      id: "quietAcc", icon: "🤫", group: "sp",
      label: "تجمع بی‌سروصدا",
      desc: "حجم چند برابر حجم مبنا آمده ولی قیمت هنوز بالا نرفته — الگوی کلاسیک «جمع‌کردن» سهم",
      def: { k: 3, x: 2 }, pmeta: [{ key: "k", label: "حداقل ضریب حجم نسبت به حجم مبنا" }, { key: "x", label: "حداکثر درصد تغییر پایانی" }],
      expr: function (p) {
        var K = n(p.k, 3), X = n(p.x, 2);
        return "(parseInt(row.bvol,10)>0&&parseInt(row.tvol,10)>=" + K + "*parseInt(row.bvol,10))" +
          "&&parseFloat(row.pcp)>=0&&parseFloat(row.pcp)<=" + X +
          "&&parseInt(row.tno,10)>0";
      }
    },
    {
      id: "bidHeavy", icon: "⚖️", group: "sp",
      label: "فشار خرید سرصفحه",
      desc: "در بهترین صف خرید/فروش، حجم تقاضا چند برابر حجم عرضه است و سهم مثبت است — فشار لحظه‌ای خریدار",
      def: { k: 2 }, pmeta: [{ key: "k", label: "حداقل نسبت حجم خرید سرصفحه به فروش" }],
      expr: function (p) {
        var K = n(p.k, 2);
        return "(function(){var qd=parseFloat(row.qd1)||0,qo=parseFloat(row.qo1)||0;" +
          "return qd>0&&(qo<=0||qd>=" + K + "*qo)&&parseFloat(row.pcp)>0&&parseInt(row.tno,10)>0})()";
      }
    },
    {
      id: "distress", icon: "🚨", group: "sp",
      label: "هشدار توزیع (خروج پول)",
      desc: "حجم سنگین همراه با افت قیمت — الگوی توزیع/خروج پول؛ برای جداکردن نمادهای پرریسک",
      def: { k: 3, x: -2 }, pmeta: [{ key: "k", label: "حداقل ضریب حجم نسبت به حجم مبنا" }, { key: "x", label: "حداکثر درصد تغییر پایانی (منفی)" }],
      expr: function (p) {
        var K = n(p.k, 3), X = n(p.x, -2);
        return "(parseInt(row.bvol,10)>0&&parseInt(row.tvol,10)>=" + K + "*parseInt(row.bvol,10))" +
          "&&parseFloat(row.pcp)<=" + X;
      }
    }
  ];

  // ===================== فیلترهای پایه =====================
  // هر عبارت (expr) یک عبارت بولی روی `row` است؛ دقیقاً همان دامنه‌ای که
  // RenderData سایت هنگام eval(mw.FilterCode) در اختیار دارد.
  // نکته‌ی مهم: عبارت‌ها نباید الگوی (فیلد) مثل (pl) داشته باشند تا
  // PrepareFilterCode سایت دست‌نخورده بمانند.
  var BASICS = [
    {
      id: "noTrade", label: "حذف نمادهای بی‌معامله", desc: "نمادهایی که هنوز معامله‌ای ثبت نکرده‌اند",
      expr: function () { return "parseInt(row.tno,10) > 0"; }
    },
    {
      id: "minPrice", label: "حداقل قیمت", desc: "قیمت آخرین معامله", def: { x: 5000 },
      pmeta: [{ key: "x", label: "قیمت" }],
      expr: function (p) { return "parseFloat(row.pl) >= " + n(p.x, 0); }
    },
    {
      id: "minPct", label: "حداقل درصد تغییر", desc: "درصد تغییر آخرین قیمت", def: { x: 1 },
      pmeta: [{ key: "x", label: "درصد" }],
      expr: function (p) { return "parseFloat(row.plp) >= " + n(p.x, 0); }
    },
    {
      id: "minVol", label: "حداقل حجم معامله", desc: "حجم به واحد سهم", def: { x: 1000000 },
      pmeta: [{ key: "x", label: "حجم (سهم)" }],
      expr: function (p) { return "parseInt(row.tvol,10) >= " + n(p.x, 0); }
    },
    {
      id: "minVolRatio", label: "حداقل نسبت حجم به حجم مبنا", desc: "نمادهای داغ: حجم امروز >= ضریب × حجم مبنا", def: { x: 2 },
      pmeta: [{ key: "x", label: "ضریب" }],
      expr: function (p) {
        var k = n(p.x, 1);
        return "(parseInt(row.bvol,10) > 0 ? parseInt(row.tvol,10) >= " + k + "*parseInt(row.bvol,10) : true)";
      }
    },
    {
      id: "minTval", label: "حداقل ارزش معامله", desc: "همان واحد ستون «ارزش» جدول", def: { x: 1000000000 },
      pmeta: [{ key: "x", label: "ارزش معامله" }],
      expr: function (p) { return "parseInt(row.tval,10) >= " + n(p.x, 0); }
    },
    {
      id: "noDeriv", label: "حذف اوراق و مشتقات", desc: "صندوق‌ها، اوراق بهادار، آتی، حق تقدم، اختیار فروش و تسهیلات",
      expr: function () {
        return "!(row.yval==\"306\"||row.yval==\"301\"||row.yval==\"706\"||row.yval==\"208\"||row.yval==\"206\"||" +
               "row.yval==\"305\"||row.yval==\"380\"||row.yval==\"263\"||row.yval==\"304\"||row.yval==\"400\"||" +
               "row.yval==\"403\"||row.yval==\"404\"||row.yval==\"600\"||row.yval==\"602\"||row.yval==\"605\"||" +
               "row.yval==\"603\"||row.yval==\"311\"||row.yval==\"312\"||row.yval==\"320\"||row.yval==\"321\")";
      }
    },
    {
      id: "noHousing", label: "حذف تسهیلات مسکن", desc: "نمادهای شروع‌شده با «تسه» یا «تملي»",
      expr: function () { return "!(row.l18.indexOf(\"تسه\")==0 || row.l18.indexOf(\"تملي\")==0)"; }
    },
    {
      id: "noEnergy", label: "حذف بازار انرژی", desc: "نمادهای flow=6 (بازار انرژی)",
      expr: function () { return "row.flow != \"6\""; }
    },
    {
      id: "maxPE", label: "حداکثر P/E", desc: "حذف نمادهای P/E بالاتر از مقدار (نمادهای بدون P/E نمایش داده می‌شوند)", def: { x: 15 },
      pmeta: [{ key: "x", label: "حداکثر P/E" }],
      expr: function (p) { return "(row.pe===\"\" || row.pe==null || parseFloat(row.pe) <= " + n(p.x, 0) + ")"; }
    },
    {
      id: "search", label: "جستجوی نماد", desc: "فقط نمادهای حاوی این رشته (حساس به بزرگ/کوچک نیست)",
      expr: function (p) {
        var kw = String(p.kw || "").toUpperCase().replace(/["\\]/g, "");
        if (kw === "") return "true";
        return "row.l18.toUpperCase().indexOf(\"" + kw + "\") != -1";
      }
    },
    {
      id: "blacklist", label: "سیاهه (نمادهای مخفی)", desc: "نمادها را با ویرایش جدا کنید: AAA,BBB",
      expr: function (p) {
        var list = String(p.list || "").split(/[\s,،;؛]+/).filter(function (s) { return s !== ""; });
        if (list.length === 0) return "true";
        var clean = list.map(function (s) { return s.toUpperCase().replace(/["\\]/g, ""); });
        return "[" + clean.map(function (s) { return "\"" + s + "\""; }).join(",") + "].indexOf(row.l18.toUpperCase()) == -1";
      }
    }
  ];

  var FILTERS = SPECIALS.concat(BASICS);

  function filterById(id) {
    for (var i = 0; i < FILTERS.length; i++) if (FILTERS[i].id === id) return FILTERS[i];
    return null;
  }
  function paramOf(f) {
    var merged = {};
    if (f.def) {
      for (var k in f.def) merged[k] = f.def[k];
    }
    if (state.params[f.id]) {
      var saved = state.params[f.id];
      for (var k2 in saved) {
        if (saved[k2] !== "" && saved[k2] != null) merged[k2] = saved[k2];
      }
    }
    if (f.id === "search") merged.kw = state.search;
    if (f.id === "blacklist") merged.list = state.blacklist;
    return merged;
  }

  // ترکیب فیلترهای فعال به یک عبارت
  function buildCombined() {
    var parts = [];
    for (var i = 0; i < FILTERS.length; i++) {
      var f = FILTERS[i];
      if (state.enabled[f.id] !== true) continue;
      if (f.id === "search" && String(state.search || "").trim() === "") continue;
      if (f.id === "blacklist" && String(state.blacklist || "").trim() === "") continue;
      try { parts.push(f.expr(paramOf(f))); }
      catch (e) { parts.push("false"); }
    }
    return parts.join(" && ");
  }

  // اعتبارسنجی: اجرای عبارت روی تمام ردیف‌های موجود (مثل «اعتبار سنجی» خود سایت، اما سخت‌گیرانه‌تر)
  function validateCode(code) {
    if (code.length === 0) return null;
    var rows = [];
    for (var k in mw.AllRows) if (mw.AllRows.hasOwnProperty(k)) rows.push(mw.AllRows[k]);
    if (rows.length === 0) return null; // هنوز داده‌ای بار نشده
    var fn, errs = [], bad = 0;
    try { fn = new Function("row", "return (" + code + ");"); }
    catch (e) { return { count: rows.length, errors: [String(e)] }; }
    for (var i = 0; i < rows.length; i++) {
      try { fn(rows[i]); }
      catch (e) {
        bad++;
        var msg = String(e);
        if (errs.indexOf(msg) === -1) errs.push(msg);
        if (errs.length >= 3) break;
      }
    }
    return bad > 0 ? { count: bad, errors: errs } : null;
  }

  // ===================== داده‌ی حقیقی/حقوقی (mw.ClientType) =====================
  // فیلترهای needsCT به mw.ClientType نیاز دارند؛ موتور سایت این داده را فقط وقتی
  // می‌گیرد که Settings.LoadClientType==1 باشد (تنظیمات - اطلاعات تکمیلی).
  // ما آن را خودکار روشن می‌کنیم و فچ فوری را صدا می‌زنیم.
  function ctNeeded() {
    for (var i = 0; i < FILTERS.length; i++) {
      if (FILTERS[i].needsCT && state.enabled[FILTERS[i].id] === true) return true;
    }
    return false;
  }
  function ensureCT() {
    try {
      if (mw.Settings.LoadClientType === 1) return "already";
      mw.Settings.LoadClientType = 1;
      try { if (mw.SaveParams) mw.SaveParams(); } catch (e2) {}
      try { if (mw.LoadClientType) mw.LoadClientType(); } catch (e3) {}
      return "enabled";
    } catch (e) { return "off"; }
  }
  function ctReady() {
    try {
      var c = 0;
      for (var k in mw.ClientType) if (mw.ClientType.hasOwnProperty(k)) c++;
      return c > 0;
    } catch (e) { return false; }
  }

  // ===================== اعمال روی موتور سایت =====================
  var lastError = "";

  function applyToEngine(code) {
    // ثبت/به‌روزرسانی ورودی فیلتر در سیستم فیلتر خودِ سایت
    var entry = null;
    for (var i = 0; i < mw.Settings.Filters.length; i++) {
      if (mw.Settings.Filters[i].FilterName === FILTER_NAME) { entry = mw.Settings.Filters[i]; break; }
    }
    if (!entry) {
      entry = { FilterName: FILTER_NAME, FilterCode: code };
      mw.Settings.Filters.push(entry);
    }
    entry.FilterCode = code;
    var idx = mw.Settings.Filters.indexOf(entry);
    mw.Settings.FilterNo = idx;
    mw.FilterCode = code;
    try { if (mw.SaveParams) mw.SaveParams(); } catch (e) {}
    // مسیر استاندارد خود سایت: PrepareFilterCode + RemoveAllData + RenderData
    mw.SelectFilter(idx);
  }

  function clearFromEngine() {
    mw.Settings.FilterNo = -1;
    mw.FilterCode = "";
    try { if (mw.SaveParams) mw.SaveParams(); } catch (e) {}
    mw.SelectFilter(-1);
  }

  function applyAll() {
    var code = buildCombined();
    var bad = validateCode(code);
    if (bad) {
      lastError = "خطای اعتبارسنجی در " + toFaNum(bad.count) + " ردیف: " + bad.errors.join(" | ");
      setStatus("error", lastError);
      return false;
    }
    lastError = "";
    if (code.length === 0) {
      clearFromEngine();
      setStatus("ok", "بدون فیلتر — همه‌ی نمادها نمایش داده می‌شوند");
    } else {
      if (ctNeeded()) {
        var r = ensureCT();
        if (r === "enabled") {
          setStatus("warn", "داده‌ی حقیقی/حقوقی روشن شد و در حال دریافت است؛ چند ثانیه بعد دوباره «اعمال» را بزنید تا فیلتر پول هوشمند کامل شود");
        } else if (r === "already" && !ctReady()) {
          setStatus("warn", "در انتظار رسیدن داده‌ی حقیقی/حقوقی از سرور…");
        }
      }
      applyToEngine(code);
      if (!ctNeeded()) setStatus("ok", "اعمال شد ✓");
    }
    updateCount(true);
    return true;
  }

  function fullReset() {
    state.enabled = {};
    state.params = {};
    state.search = "";
    state.blacklist = "";
    saveState();
    rebuildPanel();
    applyAll();
  }

  // ===================== شمارنده‌ی نمادهای نمایش‌داده‌شده =====================
  var countTimer = null;
  function visibleRows() {
    var main = document.getElementById("main");
    if (!main) return { v: 0, t: 0 };
    var v = 0;
    for (var i = 0; i < main.children.length; i++) {
      if (main.children[i].id && main.children[i].id.charAt(0) !== "S") v++;
    }
    var t = 0;
    for (var k in mw.AllRows) if (mw.AllRows.hasOwnProperty(k)) t++;
    return { v: v, t: t };
  }
  function updateCount(force) {
    var c = $("#tfCount");
    if (c) {
      var r = visibleRows();
      c.textContent = toFaNum(r.v) + " از " + toFaNum(r.t) + " نماد";
      // هشدار: فیلتر فعال است ولی هیچ ردیفی نمی‌ماند
      if (mw.FilterCode && mw.FilterCode.length > 0 && r.t > 0 && r.v === 0 && force) {
        setStatus("warn", "فیلتر فعال است اما هیچ ردیفی باقی نمانده — آستانه‌ها را بررسی کنید");
      }
    }
  }
  function startCountTimer() {
    if (countTimer) return;
    countTimer = window.setInterval(function () { updateCount(false); }, 2000);
  }

  // ===================== پنل (طرح مدرن) =====================
  var panel = null, statusEl = null;

  var CSS = [
    "#tfPanel{position:fixed;top:64px;right:12px;width:378px;max-height:84vh;z-index:2147483000;",
    "background:rgba(17,21,28,.96);color:#e8eaed;border:1px solid rgba(255,255,255,.09);",
    "border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.5);overflow:hidden;",
    "font-family:Vazirmatn,Vazir,'IRANSans','Segoe UI',Tahoma,sans-serif;font-size:12.5px;",
    "display:flex;flex-direction:column;direction:rtl}",
    "#tfPanel *{box-sizing:border-box;margin:0;padding:0}",
    "#tfHead{display:flex;align-items:center;gap:8px;padding:11px 14px;cursor:move;user-select:none;",
    "background:linear-gradient(120deg,#0e7490 0%,#4f46e5 60%,#7c3aed 100%);color:#fff}",
    "#tfTitle{flex:1;font-weight:700;font-size:13.5px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    "#tfCount{font-size:11px;background:rgba(255,255,255,.18);border-radius:99px;padding:2px 9px;white-space:nowrap}",
    "#tfTog{cursor:pointer;padding:0 6px;font-size:12px;opacity:.9}",
    "#tfClose{cursor:pointer;padding:0 4px;font-size:14px;opacity:.75;line-height:1}",
    "#tfClose:hover{opacity:1}",
    "#tfStatus{display:none;margin:8px 12px 0;padding:7px 11px;font-size:11.5px;border-radius:9px;line-height:1.7;",
    "border:1px solid transparent}",
    "#tfStatus.ok{background:rgba(34,197,94,.13);border-color:rgba(34,197,94,.35);color:#86efac}",
    "#tfStatus.warn{background:rgba(234,179,8,.12);border-color:rgba(234,179,8,.35);color:#fde047}",
    "#tfStatus.error{background:rgba(239,68,68,.13);border-color:rgba(239,68,68,.4);color:#fca5a5}",
    "#tfBody{overflow-y:auto;padding:10px 12px 12px;display:flex;flex-direction:column;gap:8px;scrollbar-width:thin}",
    "#tfBody::-webkit-scrollbar{width:8px}#tfBody::-webkit-scrollbar-thumb{background:rgba(255,255,255,.16);border-radius:8px}",
    ".tf-sec{font-size:11px;font-weight:700;color:#93c5fd;letter-spacing:.3px;margin:4px 2px 0;",
    "display:flex;align-items:center;gap:6px}",
    ".tf-sec .tf-line{flex:1;height:1px;background:rgba(255,255,255,.1)}",
    ".tf-card{background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);border-radius:12px;",
    "padding:9px 11px;transition:background .15s,border-color .15s}",
    ".tf-card:hover{background:rgba(255,255,255,.07)}",
    ".tf-card.on{background:rgba(59,130,246,.13);border-color:rgba(96,165,250,.55)}",
    ".tf-card.top{display:flex;align-items:center;gap:8px}",
    ".tf-card .tf-ic{font-size:15px;line-height:1}",
    ".tf-card .tf-name{flex:1;font-weight:700;font-size:12.5px;color:#f1f5f9}",
    ".tf-card .tf-desc{font-size:11px;color:#94a3b8;line-height:1.8;margin-top:5px}",
    ".tf-card.on .tf-desc{color:#cbd5e1}",
    ".tf-par{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}",
    ".tf-par .tf-p{display:flex;align-items:center;gap:5px;background:rgba(0,0,0,.28);",
    "border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:3px 8px}",
    ".tf-par label{font-size:10px;color:#94a3b8;white-space:nowrap}",
    ".tf-par input{width:64px;background:transparent;border:0;outline:0;color:#e8eaed;",
    "font-family:inherit;font-size:11.5px;direction:ltr;text-align:center}",
    ".tf-brow{display:flex;align-items:center;gap:8px;padding:6px 9px;border-radius:10px;",
    "background:rgba(255,255,255,.035);border:1px solid transparent}",
    ".tf-brow:hover{background:rgba(255,255,255,.06)}",
    ".tf-brow.on{background:rgba(52,211,153,.1);border-color:rgba(52,211,153,.35)}",
    ".tf-brow .tf-name{flex:1;font-size:12px;color:#e2e8f0;cursor:pointer}",
    ".tf-brow input.tf-inp{width:86px;background:rgba(0,0,0,.3);border:1px solid rgba(255,255,255,.12);",
    "border-radius:7px;padding:3px 6px;color:#e8eaed;font-family:inherit;font-size:11px;direction:ltr;text-align:center;outline:0}",
    ".tf-brow input.tf-inp:focus{border-color:#60a5fa}",
    "#tfBasicsToggle{cursor:pointer;color:#7dd3fc;font-size:11px;font-weight:700;padding:2px 4px}",
    "#tfBasicsToggle:hover{text-decoration:underline}",
    "#tfBtns{display:flex;gap:6px;margin-top:2px}",
    "#tfBtns button{flex:1;border:0;border-radius:10px;padding:8px 4px;font-family:inherit;font-size:11.5px;",
    "font-weight:700;cursor:pointer;transition:filter .15s}",
    "#tfBtns button:hover{filter:brightness(1.15)}",
    "#tfApply{background:linear-gradient(120deg,#2563eb,#4f46e5);color:#fff}",
    "#tfClear{background:rgba(255,255,255,.09);color:#e2e8f0}",
    "#tfReset{background:rgba(255,255,255,.09);color:#e2e8f0;flex:0 0 auto;padding:8px 10px}",
    "#tfFoot{padding:0 12px 4px;font-size:10px;color:#64748b;text-align:center}",
    "#tfFoot a{color:#7dd3fc;text-decoration:none}",
    // سوییچ
    ".tf-sw{position:relative;display:inline-block;width:34px;height:19px;flex:0 0 auto;cursor:pointer}",
    ".tf-sw input{opacity:0;width:0;height:0;position:absolute}",
    ".tf-sw i{position:absolute;inset:0;background:rgba(255,255,255,.18);border-radius:99px;transition:background .18s}",
    ".tf-sw i:before{content:'';position:absolute;width:15px;height:15px;right:2px;top:2px;background:#fff;",
    "border-radius:50%;transition:transform .18s}",
    ".tf-sw input:checked + i{background:linear-gradient(120deg,#22c55e,#16a34a)}",
    ".tf-sw input:checked + i:before{transform:translateX(-15px)}"
  ].join("");
  function injectStyle() {
    if (document.getElementById("tfStyle")) return;
    var st = document.createElement("style");
    st.id = "tfStyle";
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function setStatus(kind, text) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = text ? kind : "";
    statusEl.style.display = text ? "block" : "none";
  }

  function makeSwitch(f, onChange) {
    var lab = el("label", { class: "tf-sw" });
    var cb = el("input", { type: "checkbox" });
    cb.checked = state.enabled[f.id] === true;
    cb.addEventListener("change", function () {
      onChange(cb.checked);
    });
    lab.appendChild(cb);
    lab.appendChild(el("i"));
    return lab;
  }

  function makeParamInputs(f, container) {
    var meta = f.pmeta || [];
    for (var j = 0; j < meta.length; j++) {
      (function (m) {
        var box = el("div", { class: "tf-p" });
        var lab = el("label", {}, m.label + ":");
        var inp = el("input", { type: "number", step: "any", dir: "ltr" });
        var v = paramOf(f)[m.key];
        inp.value = v != null ? v : "";
        var deb = null;
        inp.addEventListener("input", function () {
          if (deb) clearTimeout(deb);
          deb = setTimeout(function () {
            var p = state.params[f.id] || {};
            p[m.key] = inp.value;
            state.params[f.id] = p;
            saveState(); applyAll();
          }, 500);
        });
        box.appendChild(lab); box.appendChild(inp);
        container.appendChild(box);
      })(meta[j]);
    }
  }

  function rebuildPanel() {
    if (!panel) return;
    var body = $("#tfBody");
    while (body.firstChild) body.removeChild(body.firstChild);

    // ---- بخش ویژه ----
    body.appendChild(el("div", { class: "tf-sec" }, "<span>✨ فیلترهای ویژه</span><span class='tf-line'></span>"));
    for (var i = 0; i < SPECIALS.length; i++) {
      (function (f) {
        var card = el("div", { class: "tf-card" + (state.enabled[f.id] === true ? " on" : "") });
        var top = el("div", { class: "top" });
        top.appendChild(el("span", { class: "tf-ic" }, f.icon || "•"));
        top.appendChild(el("span", { class: "tf-name", title: f.desc || "" }, f.label));
        var sw = makeSwitch(f, function (on) {
          state.enabled[f.id] = on;
          saveState(); applyAll(); rebuildPanel();
        });
        top.appendChild(sw);
        card.appendChild(top);
        card.appendChild(el("div", { class: "tf-desc" }, f.desc || ""));
        var par = el("div", { class: "tf-par" });
        makeParamInputs(f, par);
        if (par.children.length) card.appendChild(par);
        body.appendChild(card);
      })(SPECIALS[i]);
    }

    // ---- بخش پایه (جمع‌شونده) ----
    var bt = el("div", { class: "tf-sec" }, "<span class='tf-line'></span>");
    var btoggle = el("span", { id: "tfBasicsToggle" }, (state.basicsOpen ? "▾" : "▸") + " فیلترهای پایه");
    bt.appendChild(btoggle);
    body.appendChild(bt);
    var basics = el("div", { id: "tfBasics", style: "display:" + (state.basicsOpen ? "flex" : "none") + ";flex-direction:column;gap:4px" });
    btoggle.addEventListener("click", function () {
      state.basicsOpen = !state.basicsOpen;
      saveState();
      basics.style.display = state.basicsOpen ? "flex" : "none";
      btoggle.textContent = (state.basicsOpen ? "▾" : "▸") + " فیلترهای پایه";
    });

    for (var b = 0; b < BASICS.length; b++) {
      (function (f) {
        var rowDiv = el("div", { class: "tf-brow" + (state.enabled[f.id] === true ? " on" : "") });
        var sw = makeSwitch(f, function (on) {
          state.enabled[f.id] = on;
          saveState(); applyAll(); rebuildPanel();
        });
        rowDiv.appendChild(sw);
        var lab = el("span", { class: "tf-name", title: f.desc || "" }, f.label);
        lab.addEventListener("click", function () {
          state.enabled[f.id] = !(state.enabled[f.id] === true);
          saveState(); applyAll(); rebuildPanel();
        });
        rowDiv.appendChild(lab);

        if (f.def && f.pmeta && f.pmeta.length === 1 && f.pmeta[0].key === "x") {
          var input = el("input", { type: "number", class: "tf-inp", dir: "ltr", step: "any" });
          input.value = paramOf(f).x != null ? paramOf(f).x : "";
          input.title = f.pmeta[0].label || f.desc || "";
          var deb = null;
          input.addEventListener("input", function () {
            if (deb) clearTimeout(deb);
            deb = setTimeout(function () {
              state.params[f.id] = { x: input.value };
              saveState(); applyAll();
            }, 400);
          });
          rowDiv.appendChild(input);
        } else if (f.id === "search") {
          var si = el("input", { type: "text", class: "tf-inp", dir: "ltr", placeholder: "مثلا: FA" });
          si.style.width = "96px";
          si.value = state.search;
          var deb2 = null;
          si.addEventListener("input", function () {
            state.search = si.value;
            saveState();
            if (deb2) clearTimeout(deb2);
            deb2 = setTimeout(applyAll, 400);
          });
          rowDiv.appendChild(si);
        } else if (f.id === "blacklist") {
          var bi = el("input", { type: "text", class: "tf-inp", dir: "ltr", placeholder: "AAA, BBB" });
          bi.style.width = "96px";
          bi.value = state.blacklist;
          var deb3 = null;
          bi.addEventListener("input", function () {
            state.blacklist = bi.value;
            saveState();
            if (deb3) clearTimeout(deb3);
            deb3 = setTimeout(applyAll, 400);
          });
          rowDiv.appendChild(bi);
        }
        basics.appendChild(rowDiv);
      })(BASICS[b]);
    }
    body.appendChild(basics);

    // ---- دکمه‌ها ----
    var btns = el("div", { id: "tfBtns" });
    var b1 = el("button", { id: "tfApply" }, "اعمال");
    b1.addEventListener("click", function () { saveState(); applyAll(); });
    var b2 = el("button", { id: "tfClear" }, "حذف فیلتر");
    b2.addEventListener("click", function () {
      clearFromEngine();
      setStatus("ok", "فیلتر برداشته شد — همه‌ی نمادها نمایش داده می‌شوند");
      updateCount(true);
    });
    var b3 = el("button", { id: "tfReset" }, "↺");
    b3.title = "بازنشانی پنل";
    b3.addEventListener("click", fullReset);
    btns.appendChild(b1); btns.appendChild(b2); btns.appendChild(b3);
    body.appendChild(btns);

    var foot = el("div", { id: "tfFoot" }, "v" + toFaNum(VERSION) + " — پول هوشمند بر پایه‌ی داده‌ی حقیقی/حقوقی خود TSETMC");
    body.appendChild(foot);

    // خطای ذخیره‌شده
    if (lastError) setStatus("error", lastError);
    updateCount(false);
  }

  function buildPanel() {
    injectStyle();
    panel = el("div", { id: "tfPanel", dir: "rtl" });

    // سربرگ (قابل جابه‌جایی + جمع‌شدن)
    var head = el("div", { id: "tfHead" });
    var title = el("span", { id: "tfTitle" }, "⚡ فیلترهای دیده‌بان بازار");
    var count = el("span", { id: "tfCount" }, "");
    var tog = el("span", { id: "tfTog" }, "▾");
    var close = el("span", { id: "tfClose", title: "بستن (با کلیک دوباره روی بوکمارککت باز می‌شود)" }, "✕");
    head.appendChild(title); head.appendChild(count); head.appendChild(tog); head.appendChild(close);

    var body = el("div", { id: "tfBody" });
    statusEl = el("div", { id: "tfStatus" });

    panel.appendChild(head);
    panel.appendChild(statusEl);
    panel.appendChild(body);
    document.body.appendChild(panel);

    if (!state.open) toggleBody(false);

    // جمع/باز شدن بدنه
    function toggleBody(open) {
      if (typeof open === "boolean") state.open = open;
      else state.open = !state.open;
      body.style.display = state.open ? "flex" : "none";
      tog.textContent = state.open ? "▾" : "▸";
      saveState();
    }
    title.addEventListener("click", function () { toggleBody(); });
    tog.addEventListener("click", function (e) { e.stopPropagation(); toggleBody(); });

    // بستن کل پنل
    close.addEventListener("click", function () {
      panel.style.display = "none";
    });

    // جابه‌جایی
    var drag = null;
    head.addEventListener("mousedown", function (e) {
      if (e.target === title || e.target === tog || e.target === close) return;
      var r = panel.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      e.preventDefault();
    });
    document.addEventListener("mousemove", function (e) {
      if (!drag) return;
      panel.style.left = (e.clientX - drag.dx) + "px";
      panel.style.top = (e.clientY - drag.dy) + "px";
      panel.style.right = "auto";
    });
    document.addEventListener("mouseup", function () { drag = null; });

    rebuildPanel();
  }

  function showPanel() {
    if (!panel) return;
    panel.style.display = "flex";
    if (!state.open) {
      var b = $("#tfBody");
      if (b) b.style.display = "none";
      var t = $("#tfTog");
      if (t) t.textContent = "▸";
    }
  }

  // ===================== راه‌اندازی =====================
  function banner(msg, kind) {
    var d = el("div", {}, msg);
    d.style.cssText = "position:fixed;bottom:10px;right:12px;z-index:99999;max-width:420px;padding:10px 14px;" +
      "background:" + (kind === "err" ? "#ffdddd" : "#fff8dc") + ";border:1px solid #999;font-family:Tahoma,sans-serif;" +
      "font-size:12px;direction:rtl;box-shadow:0 3px 10px rgba(0,0,0,.3);border-radius:4px;";
    d.addEventListener("click", function () { d.remove(); });
    document.body.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.remove(); }, 20000);
  }

  function boot() {
    try {
      if (typeof mw === "undefined" || !mw.AllRows || !mw.SelectFilter || !mw.Settings) return false;
      buildPanel();
      startCountTimer();
      // اگر سایت الان فیلتر دیگری فعال دارد، به کاربر بگوییم
      if (mw.Settings.FilterNo !== -1) {
        var f = mw.Settings.Filters[mw.Settings.FilterNo];
        if (f && f.FilterName !== FILTER_NAME) {
          setStatus("warn", "توجه: فیلتر «" + f.FilterName + "» خود سایت هم فعال است — با اعمال فیلترهای این پنل جایگزین می‌شود");
        }
      }
      // اعمال اولیه‌ی وضعیت ذخیره‌شده
      applyAll();
      return true;
    } catch (e) {
      banner("خطا در اجرای فیلترهای دیده‌بان: " + e, "err");
      return false;
    }
  }

  var tries = 0;
  (function waitMw() {
    if (boot()) return;
    tries++;
    if (tries >= 200) { // ~60 ثانیه
      banner("اوبژه‌ی دیده‌بان بازار (mw) پیدا نشد. این بوکمارکلت فقط روی صفحه‌ی «دیده‌بان بازار پیشرفته» (ParTree=15131F) کار می‌کند.", "err");
      return;
    }
    setTimeout(waitMw, 300);
  })();

  // ===================== API برای کنسول/تست =====================
  window.__tsetmcFilters = {
    version: VERSION,
    filters: FILTERS.map(function (f) { return f.id; }),
    specials: SPECIALS.map(function (f) { return f.id; }),
    state: function () { return JSON.parse(JSON.stringify(state)); },
    enable: function (id, param) {
      state.enabled[id] = true;
      if (param) { state.params[id] = param; if (id === "search") state.search = param.kw || ""; if (id === "blacklist") state.blacklist = param.list || ""; }
      saveState(); rebuildPanel(); return applyAll();
    },
    disable: function (id) {
      state.enabled[id] = false;
      saveState(); rebuildPanel(); return applyAll();
    },
    apply: applyAll,
    clear: function () { clearFromEngine(); setStatus("ok", "فیلتر برداشته شد"); updateCount(true); },
    combined: buildCombined,
    toggle: function () {
      if (!panel) return;
      if (panel.style.display === "none") { showPanel(); return; }
      var body = $("#tfBody");
      var open = body.style.display !== "none";
      body.style.display = open ? "none" : "flex";
      state.open = !open; saveState();
      $("#tfTog").textContent = !open ? "▾" : "▸";
    },
    _internal: { buildCombined: buildCombined, validateCode: validateCode, state: state, ensureCT: ensureCT }
  };
})();
