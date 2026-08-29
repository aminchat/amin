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

  var VERSION = "1.0.0";
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
    return String(s).replace(/[0-9]/g, function (d) { return "۰۱۳۴۵۷۸۹"[+d]; });
  }

  // ===================== وضعیت (localStorage) =====================
  var state = {
    enabled: {},            // id -> true
    params: {},             // id -> {key:value}
    blacklist: "",          // "AAA,BBB"
    search: "",             // کلمه‌ی جستجو در نماد
    open: true
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
        }
      }
    } catch (e) { /* وضعیت خراب -> پیش‌فرض */ }
  }
  function saveState() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }

  // ===================== تعریف فیلترها =====================
  // هر عبارت (expr) یک عبارت بولی روی `row` است؛ دقیقاً همان دامنه‌ای که
  // RenderData سایت هنگام eval(mw.FilterCode) در اختیار دارد.
  // نکته‌ی مهم: عبارت‌ها نباید الگوی (فیلد) مثل (pl) داشته باشند تا
  // PrepareFilterCode سایت دست‌نخورده بمانند.
  function n(v, d) { var x = parseFloat(v); return isFinite(x) ? x : d; }

  var FILTERS = [
    {
      id: "noTrade", label: "حذف نمادهای بی‌معامله", desc: "نمادهایی که هنوز معامله‌ای ثبت نکرده‌اند",
      expr: function () { return "parseInt(row.tno,10) > 0"; }
    },
    {
      id: "minPrice", label: "حداقل قیمت", desc: "قیمت آخرین معامله به تومان", def: { x: 5000 },
      expr: function (p) { return "parseFloat(row.pl) >= " + n(p.x, 0); }
    },
    {
      id: "minPct", label: "حداقل درصد تغییر", desc: "درصد تغییر آخرین قیمت", def: { x: 1 },
      expr: function (p) { return "parseFloat(row.plp) >= " + n(p.x, 0); }
    },
    {
      id: "minVol", label: "حداقل حجم معامله", desc: "حجم به واحد سهم", def: { x: 1000000 },
      expr: function (p) { return "parseInt(row.tvol,10) >= " + n(p.x, 0); }
    },
    {
      id: "minVolRatio", label: "حداقل نسبت حجم به حجم مبنا", desc: "نمادهای داغ: حجم امروز >= ضریب × حجم مبنا", def: { x: 2 },
      expr: function (p) {
        var k = n(p.x, 1);
        return "(parseInt(row.bvol,10) > 0 ? parseInt(row.tvol,10) >= " + k + "*parseInt(row.bvol,10) : true)";
      }
    },
    {
      id: "minTval", label: "حداقل ارزش معامله", desc: "ارزش به تومان (مثلا 1000000000 = یک میلیارد)", def: { x: 1000000000 },
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
      for (var k2 in saved) merged[k2] = saved[k2];
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
      try {
        var r = fn(rows[i]);
        if (typeof r !== "boolean" && typeof r !== "number") {
          // سایت مقدار truthy/falsy را می‌گیرد؛ ولی نوع عجیب را علامت می‌زنیم
        }
      } catch (e) {
        bad++;
        var msg = String(e);
        if (errs.indexOf(msg) === -1) errs.push(msg);
        if (errs.length >= 3) break;
      }
    }
    return bad > 0 ? { count: bad, errors: errs } : null;
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
      applyToEngine(code);
      setStatus("ok", "اعمال شد ✓");
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
      c.textContent = "نمایش: " + toFaNum(r.v) + " از " + toFaNum(r.t) + " نماد";
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

  // ===================== پنل =====================
  var panel = null, statusEl = null;

  function setStatus(kind, text) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.style.background = kind === "error" ? "#ffd6d6" : (kind === "warn" ? "#fff3cd" : "#d6f5d6");
    statusEl.style.display = text ? "block" : "none";
  }

  function rebuildPanel() {
    if (!panel) return;
    var body = $("#tfBody");
    while (body.firstChild) body.removeChild(body.firstChild);

    for (var i = 0; i < FILTERS.length; i++) {
      (function (f) {
        var rowDiv = el("div", { class: "tf-row" });
        var cb = el("input", { type: "checkbox", id: "tfcb_" + f.id });
        cb.checked = state.enabled[f.id] === true;
        cb.title = f.desc || "";
        cb.addEventListener("change", function () {
          state.enabled[f.id] = cb.checked;
          saveState();
          applyAll();
        });
        var lab = el("label", { class: "tf-lab", for: "tfcb_" + f.id }, f.label);
        rowDiv.appendChild(cb);
        rowDiv.appendChild(lab);

        var input = null;
        if (f.def) {
          input = el("input", { type: "number", id: "tfp_" + f.id, class: "tf-inp", dir: "ltr", step: "any" });
          input.value = paramOf(f).x != null ? paramOf(f).x : "";
          input.title = f.desc || "";
          var deb = null;
          input.addEventListener("input", function () {
            if (deb) clearTimeout(deb);
            deb = setTimeout(function () {
              state.params[f.id] = { x: input.value };
              saveState();
              applyAll();
            }, 400);
          });
          rowDiv.appendChild(input);
        } else if (f.id === "search") {
          input = el("input", { type: "text", id: "tfp_search", class: "tf-inp", dir: "ltr", placeholder: "مثلا: FA" });
          input.value = state.search;
          var deb2 = null;
          input.addEventListener("input", function () {
            state.search = input.value;
            saveState();
            if (deb2) clearTimeout(deb2);
            deb2 = setTimeout(applyAll, 400);
          });
          rowDiv.appendChild(input);
        } else if (f.id === "blacklist") {
          input = el("input", { type: "text", id: "tfp_blacklist", class: "tf-inp", dir: "ltr", placeholder: "AAA, BBB" });
          input.value = state.blacklist;
          var deb3 = null;
          input.addEventListener("input", function () {
            state.blacklist = input.value;
            saveState();
            if (deb3) clearTimeout(deb3);
            deb3 = setTimeout(applyAll, 400);
          });
          rowDiv.appendChild(input);
        }
        body.appendChild(rowDiv);
      })(FILTERS[i]);
    }

    // دکمه‌ها
    var btns = el("div", { class: "tf-btns" });
    var b1 = el("button", { class: "tf-btn" }, "اعمال");
    b1.addEventListener("click", function () { saveState(); applyAll(); });
    var b2 = el("button", { class: "tf-btn" }, "حذف فیلتر");
    b2.addEventListener("click", function () {
      clearFromEngine();
      setStatus("ok", "فیلتر برداشته شد — همه‌ی نمادها نمایش داده می‌شوند");
      updateCount(true);
    });
    var b3 = el("button", { class: "tf-btn" }, "بازنشانی پنل");
    b3.addEventListener("click", fullReset);
    btns.appendChild(b1); btns.appendChild(b2); btns.appendChild(b3);
    body.appendChild(btns);

    // خطای ذخیره‌شده
    if (lastError) setStatus("error", lastError);
    updateCount(false);
  }

  function buildPanel() {
    panel = el("div", { id: "tfPanel", dir: "rtl" });
    panel.style.cssText =
      "position:fixed;top:64px;right:12px;width:360px;max-height:82vh;z-index:99999;" +
      "background:#ffffff;border:1px solid #888;border-right:4px solid #00aacc;" +
      "box-shadow:0 4px 14px rgba(0,0,0,.35);font-family:Tahoma,'Segoe UI',sans-serif;" +
      "font-size:12px;color:#222;display:flex;flex-direction:column;overflow:hidden;border-radius:4px;";

    // سربرگ (قابل جابه‌جایی + جمع‌شدن)
    var head = el("div", { id: "tfHead" });
    head.style.cssText = "display:flex;align-items:center;gap:6px;padding:7px 10px;background:#00aacc;color:#fff;cursor:move;user-select:none;";
    var title = el("span", { id: "tfTitle", style: "flex:1;font-weight:bold;cursor:pointer;" }, "⚙ فیلترهای دیده‌بان بازار");
    var count = el("span", { id: "tfCount" }, "");
    count.style.cssText = "font-size:11px;opacity:.95;";
    var tog = el("span", { id: "tfTog" }, "▾");
    tog.style.cssText = "cursor:pointer;padding:0 4px;";
    head.appendChild(title); head.appendChild(count); head.appendChild(tog);

    var body = el("div", { id: "tfBody" });
    body.style.cssText = "overflow-y:auto;padding:6px 8px;display:flex;flex-direction:column;gap:4px;";

    statusEl = el("div", { id: "tfStatus" });
    statusEl.style.cssText = "display:none;margin:4px 8px 0;padding:5px 8px;font-size:11px;direction:rtl;border:1px solid #bbb;border-radius:3px;";

    panel.appendChild(head);
    panel.appendChild(body);
    panel.appendChild(statusEl);
    document.body.appendChild(panel);

    if (!state.open) toggle(false);

    // جمع/باز شدن
    function toggle(open) {
      if (typeof open === "boolean") state.open = open;
      else state.open = !state.open;
      body.style.display = state.open ? "flex" : "none";
      statusEl.style.display = state.open && statusEl.textContent ? "block" : "none";
      tog.textContent = state.open ? "▾" : "▸";
      saveState();
    }
    title.addEventListener("click", function () { toggle(); });
    tog.addEventListener("click", function (e) { e.stopPropagation(); toggle(); });

    // جابه‌جایی
    var drag = null;
    head.addEventListener("mousedown", function (e) {
      if (e.target === title || e.target === tog) return;
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
    state: function () { return JSON.parse(JSON.stringify(state)); },
    enable: function (id, param) {
      state.enabled[id] = true;
      if (param) { state.params[id] = param; if (id === "search") state.search = param.kw || ""; if (id === "blacklist") state.blacklist = param.list || ""; }
      saveState(); rebuildPanel(); return applyAll();
    },
    disable: function (id) {
      state.enabled[id] = false; saveState(); rebuildPanel(); return applyAll();
    },
    apply: applyAll,
    clear: function () { clearFromEngine(); setStatus("ok", "فیلتر برداشته شد"); updateCount(true); },
    combined: buildCombined,
    toggle: function () {
      if (!panel) return;
      var body = $("#tfBody");
      var open = body.style.display !== "none";
      body.style.display = open ? "none" : "flex";
      state.open = !open; saveState();
      $("#tfTog").textContent = !open ? "▾" : "▸";
    },
    _internal: { buildCombined: buildCombined, validateCode: validateCode, state: state }
  };
})();
