export const FA = '۰۱۲۳۴۵۶۷۸۹';
export const APP_VERSION = '2.17.1';

let faDigits = true;
export function setFaDigits(on) {
  faDigits = !!on;
}
// نام واحدهای بزرگ و جداکنندهٔ اعشار بر اساس زبان
const UNIT_NAMES = { fa: { b: 'میلیارد', m: 'میلیون', k: 'هزار' }, en: { b: 'billion', m: 'million', k: 'thousand' } };
export function unitName(k) {
  return (faDigits ? UNIT_NAMES.fa : UNIT_NAMES.en)[k];
}
export function decSep() {
  return faDigits ? '٫' : '.';
}
export function pctSign() {
  return faDigits ? '٪' : '%';
}
export function toFa(n) {
  return faDigits ? String(n).replace(/\d/g, (d) => FA[d]) : String(n);
}

let hideMoney = false;
try {
  hideMoney = localStorage.getItem('t_capital_hide_money') === '1';
} catch (e) {}

export function isMoneyHidden() {
  return hideMoney;
}

export function setMoneyHidden(on) {
  hideMoney = !!on;
  try {
    localStorage.setItem('t_capital_hide_money', hideMoney ? '1' : '0');
  } catch (e) {}
}

// عدد بدون مخفی‌سازی، با جداکنندهٔ هزارگان و اعشار در صورت نیاز (برای نرخ‌ها)
export function fmtPlain(n) {
  n = Number(n) || 0;
  const abs = Math.abs(n);
  const s = abs >= 1000 ? abs.toLocaleString('en-US', { maximumFractionDigits: 2 }) : abs >= 1 ? abs.toLocaleString('en-US', { maximumFractionDigits: 4 }) : abs.toLocaleString('en-US', { maximumFractionDigits: 8 });
  return (n < 0 ? '−' : '') + s.replace('.', decSep());
}
export function fmt(n) {
  if (hideMoney) return '••••';
  n = Number(n) || 0;
  const abs = Math.abs(n);
  let s;
  if (abs >= 1000) {
    // ارقام بزرگ (مثل تومان): بدون اعشار
    s = abs.toLocaleString('en-US', { maximumFractionDigits: 2 });
  } else if (abs >= 1) {
    // ارقام متوسط (مثل دلار): حداکثر ۲ رقم اعشار
    s = abs.toLocaleString('en-US', { maximumFractionDigits: 4 });
  } else if (abs > 0) {
    // ارقام کوچک (مثل بیت‌کوین): تا ۸ رقم اعشار
    s = abs.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
    if (parseFloat(s) === 0) s = '0';
  } else {
    s = '0';
  }
  if (faDigits) s = s.replace(/,/g, '٬').replace('.', '٫');
  return (n < 0 ? '−' : '') + toFa(s);
}

// واحد پایه (از state تزریق می‌شود تا وابستگی چرخه‌ای نباشد)
let baseInfo = { name: 'تومان', big: true, dec: 0 };
export function setBaseInfo(name, info) {
  baseInfo = Object.assign({ name }, info || {});
}
export function baseName() {
  return baseInfo.name;
}
// نمایش نام واحد (در انگلیسی کد ارز)
let curDisplay = (c) => c;
export function setCurDisplay(fn) {
  curDisplay = fn;
}
export function curLabel(c) {
  return curDisplay(c);
}
export function fmtT(n) {
  if (hideMoney) return '••••';
  return fmt(n) + ' ' + curDisplay(baseInfo.name);
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

export function todayISO() {
  const d = new Date();
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

export const store = (() => {
  let mem = {};
  let ok = false;
  try {
    localStorage.setItem('__t', '1');
    localStorage.removeItem('__t');
    ok = true;
  } catch (e) {
    ok = false;
  }
  return {
    get(k) {
      const key = k === '__t' ? k : 't_' + k;
      try {
        return ok ? localStorage.getItem(key) : mem[k] ?? null;
      } catch (e) {
        return mem[k] ?? null;
      }
    },
    set(k, v) {
      const key = k === '__t' ? k : 't_' + k;
      try {
        if (ok) localStorage.setItem(key, v);
        else mem[k] = v;
      } catch (e) {
        mem[k] = v;
      }
    },
    persisted: ok,
  };
})();

export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  // reflow تا انیمیشن هر بار اجرا شود
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 2200);
}

// بازخورد لمسی خفیف (اگر دستگاه پشتیبانی کند)
export function haptic(ms = 10) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {}
}

// عدد کوتاه برای کارت‌های خلاصه: ۲٫۴ میلیون / ۸۵۰ هزار (ارزهای بزرگ‌واحد) یا 1.2M / 850K (بقیه)
export function fmtShort(n, cur) {
  if (isMoneyHidden()) return '••••';
  n = Number(n) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const big = cur ? !!(cur.big) : baseInfo.big;
  const digits = (v) => (v < 10 ? 2 : v < 100 ? 1 : 0);
  const fa = (t) => toFa(t.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '').replace('.', decSep()));
  const units = big ? [[1e9, ' ' + unitName('b')], [1e6, ' ' + unitName('m')], [1e3, ' ' + unitName('k')]] : [[1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
  for (let i = 0; i < units.length; i++) {
    const [div, name] = units[i];
    if (abs < div) continue;
    const v = abs / div;
    const r = Number(v.toFixed(digits(v)));
    if (r >= 1000 && i > 0) {
      const [d2, n2] = units[i - 1];
      return sign + fa((abs / d2).toFixed(2)) + n2;
    }
    return sign + fa(r.toFixed(digits(v))) + name;
  }
  return fmt(n);
}

// دکمهٔ ⓘ که توضیح را فقط در صورت درخواست کاربر نشان می‌دهد (چند ثانیه یا تا ضربهٔ بعدی)
export function infoTip(text, cls) {
  return `<button type="button" class="info-btn ${cls || ''}" data-tip="${esc(text)}" onclick="event.stopPropagation();showTip(this)" aria-label="راهنما">i</button>`;
}
let tipEl = null, tipTimer = 0;
export function hideTip() {
  if (tipEl) tipEl.remove();
  tipEl = null;
  clearTimeout(tipTimer);
}
export function showTip(btn) {
  const same = tipEl && tipEl._for === btn;
  hideTip();
  if (same) return;
  const t = document.createElement('div');
  t.className = 'tip';
  t.textContent = btn.dataset.tip || '';
  t._for = btn;
  document.body.appendChild(t);
  const r = btn.getBoundingClientRect();
  const w = Math.min(300, window.innerWidth - 24);
  t.style.width = w + 'px';
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(12, Math.min(window.innerWidth - w - 12, left));
  t.style.left = left + 'px';
  const below = r.bottom + 8;
  t.style.top = below + 'px';
  requestAnimationFrame(() => {
    const th = t.offsetHeight;
    if (below + th > window.innerHeight - 12) t.style.top = Math.max(12, r.top - th - 8) + 'px';
    t.classList.add('show');
  });
  tipEl = t;
  tipTimer = setTimeout(hideTip, 6000);
}
document.addEventListener('pointerdown', (e) => {
  if (tipEl && !e.target.closest('.info-btn') && !e.target.closest('.tip')) hideTip();
}, true);
document.addEventListener('scroll', () => hideTip(), true);

// ── ورودی مبلغ: کاما هنگام تایپ + «به حروف» زیر فیلد ──
// همهٔ <input type="number"> که شمارش/درصد نیستند خودکار تبدیل می‌شوند؛
// el.value همچنان عدد خام (بدون کاما) برمی‌گرداند تا کدهای فعلی دست نخورند.
const PLAIN_IDS = /^(txQty|lnQty_|iQty|plCount|plRate|plEvery|plPrepaid)/;
const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
const AR = '٠١٢٣٤٥٦٧٨٩';
export function normNum(str) {
  str = String(str == null ? '' : str)
    .replace(/[۰-۹]/g, (d) => FA.indexOf(d))
    .replace(/[٠-٩]/g, (d) => AR.indexOf(d))
    .replace(/[٫،,\s]/g, (c) => (c === '٫' ? '.' : ''));
  const neg = str.trim().startsWith('-');
  str = str.replace(/[^\d.]/g, '');
  const i = str.indexOf('.');
  if (i >= 0) str = str.slice(0, i + 1) + str.slice(i + 1).replace(/\./g, '');
  return (neg ? '-' : '') + str;
}
function groupNum(raw) {
  if (!raw) return '';
  const neg = raw.startsWith('-');
  if (neg) raw = raw.slice(1);
  const [int, dec] = raw.split('.');
  const g = (int || '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + g + (dec !== undefined ? '.' + dec : '');
}
export function amountWords(n, cur) {
  n = Math.abs(Number(n) || 0);
  if (!n) return '';
  const trim = (t) => (t.includes('.') ? t.replace(/0+$/, '').replace(/\.$/, '') : t);
  const u = curDisplay(cur || baseInfo.name);
  const big = cur ? cur === baseInfo.name ? baseInfo.big : !!(bigUnits && bigUnits.has(cur)) : baseInfo.big;
  if (big) {
    if (n >= 1e9) return toFa(trim((n / 1e9).toFixed(2)).replace('.', decSep())) + ' ' + unitName('b') + ' ' + u;
    if (n >= 1e6) return toFa(trim((n / 1e6).toFixed(2)).replace('.', decSep())) + ' ' + unitName('m') + ' ' + u;
    if (n >= 1e3) return toFa(trim((n / 1e3).toFixed(1)).replace('.', decSep())) + ' ' + unitName('k') + ' ' + u;
  } else if (n >= 1e6) {
    return toFa(trim((n / 1e6).toFixed(2)).replace('.', decSep())) + ' ' + unitName('m') + ' ' + u;
  }
  return fmt(n) + ' ' + u;
}
let bigUnits = null;
export function setBigUnits(set) {
  bigUnits = set;
}
function moneyize(el) {
  if (el.dataset.money) return;
  el.dataset.money = '1';
  const raw0 = normNum(nativeValue.get.call(el));
  el.type = 'text';
  el.inputMode = el.getAttribute('inputmode') === 'numeric' ? 'numeric' : 'decimal';
  el.setAttribute('dir', 'ltr');
  el.classList.add('money');
  const ph = el.getAttribute('placeholder') || '';
  if (ph) {
    const d = normNum(ph);
    el.setAttribute('placeholder', d ? groupNum(d) : '');
  }
  let words = null;
  const showWords = () => {
    const raw = normNum(nativeValue.get.call(el));
    const n = Number(raw) || 0;
    const txt = n >= 1000 ? amountWords(n, el.dataset.cur) : '';
    if (!txt) {
      if (words) words.textContent = '';
      return;
    }
    if (!words || !words.isConnected) {
      words = document.createElement('div');
      words.className = 'money-words';
      el.insertAdjacentElement('afterend', words);
    }
    words.textContent = txt;
  };
  const paint = (raw) => {
    nativeValue.set.call(el, groupNum(raw));
    showWords();
  };
  Object.defineProperty(el, 'value', {
    configurable: true,
    get() {
      return normNum(nativeValue.get.call(el));
    },
    set(v) {
      paint(normNum(v));
    },
  });
  paint(raw0);
  el.addEventListener('input', () => {
    const cur = nativeValue.get.call(el);
    const caret = el.selectionStart || cur.length;
    const digitsBefore = cur.slice(0, caret).replace(/[^\d.-]/g, '').length;
    paint(normNum(cur));
    // بازگرداندن نشانگر بعد از همان تعداد رقم
    const out = nativeValue.get.call(el);
    let pos = 0, seen = 0;
    while (pos < out.length && seen < digitsBefore) {
      if (/[\d.-]/.test(out[pos])) seen++;
      pos++;
    }
    try {
      el.setSelectionRange(pos, pos);
    } catch (e) {}
  });
}
export function enhanceMoneyInputs(root) {
  const scope = root && root.querySelectorAll ? root : document;
  scope.querySelectorAll('input[type="number"]').forEach((el) => {
    if (el.dataset.money || el.dataset.plain != null || PLAIN_IDS.test(el.id)) return;
    moneyize(el);
  });
}
if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) enhanceMoneyInputs(n.matches('input') ? n.parentNode : n);
  }).observe(document.documentElement, { childList: true, subtree: true });
}
