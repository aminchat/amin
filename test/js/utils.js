export const FA = '۰۱۲۳۴۵۶۷۸۹';
export const APP_VERSION = '1.1.6';

export function toFa(n) {
  return String(n).replace(/\d/g, (d) => FA[d]);
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
  return (n < 0 ? '−' : '') + toFa(s);
}

export function fmtT(n) {
  if (hideMoney) return '••••';
  return fmt(n) + ' تومان';
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
    el.style.cssText =
      'position:fixed;bottom:100px;right:50%;transform:translateX(50%);background:#22c55e;color:#04180a;font-weight:700;padding:11px 22px;border-radius:99px;z-index:99;box-shadow:0 8px 24px rgba(0,0,0,.4);transition:.25s;font-size:14px;white-space:nowrap;max-width:90vw;overflow:hidden;text-overflow:ellipsis';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  el.style.transform = 'translateX(50%) translateY(0)';
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(50%) translateY(12px)';
  }, 2000);
}
