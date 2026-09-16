import { store, setBaseInfo, setBigUnits, setCurDisplay } from './utils.js';
import { t, lang } from './i18n.js';
import { curMonthKey, setBookCalendar } from './jalali.js';
import { langInfo } from './i18n.js';
import { isEncrypted, isUnlocked, persist as persistEncrypted } from './securestore.js';

export const KEY = 'capital_app_v1';

export const CATS = [
  { id: 'need', get label() { return t('cat.need'); }, color: '#3d8bfd', target: 60, emoji: '🏠' },
  { id: 'invest', get label() { return t('cat.invest'); }, color: '#22c55e', target: 20, emoji: '📈' },
  { id: 'fun', get label() { return t('cat.fun'); }, color: '#f59e0b', target: 15, emoji: '🎮' },
  { id: 'charity', get label() { return t('cat.charity'); }, color: '#a78bfa', target: 5, emoji: '🤲' },
  { id: 'waste', get label() { return t('cat.waste'); }, color: '#ef4444', target: 0, emoji: '🚨' },
  // پاکت قرض/امانت: جابه‌جایی پول است نه خرج/درآمد واقعی؛ سقف ندارد و در بودجهٔ ماه حساب نمی‌شود
  { id: 'loan', get label() { return t('cat.loan'); }, color: '#14b8a6', target: 0, emoji: '🤝', loan: true },
];

export const LOAN_CAT = 'loan';

// آیا این تراکنش (یا قلم فاکتور) مربوط به پاکت قرض است؟
export function isLoanTx(t) {
  return !!(t && t.cat === LOAN_CAT && !isTransfer(t));
}

export const catById = (id) => CATS.find((c) => c.id === id);
export const ACCT_TYPES = ['کارت بانکی', 'نقدی', 'ارز دیجیتال', 'کیف پول آنلاین', 'سایر'];

// مؤسسه‌های پیشنهادی برای گروه‌بندی حساب‌ها (کاربر می‌تواند هر نام دیگری بنویسد)
export const KNOWN_BANKS = [
  'بانک ملت', 'بانک ملی', 'بانک صادرات', 'بانک تجارت', 'بانک سپه', 'بانک کشاورزی', 'بانک مسکن',
  'بانک رفاه', 'بانک پاسارگاد', 'بانک سامان', 'بانک پارسیان', 'بانک اقتصاد نوین', 'بانک آینده',
  'بانک شهر', 'بانک دی', 'بانک سینا', 'بانک گردشگری', 'بانک خاورمیانه', 'بانک ایران‌زمین',
  'بانک کارآفرین', 'بانک سرمایه', 'بانک توسعه تعاون', 'پست بانک', 'بانک قرض‌الحسنه رسالت', 'بانک قرض‌الحسنه مهر ایران',
  'بلوبانک', 'ویپاد', 'بانکینو',
  'نوبیتکس', 'والکس', 'تبدیل', 'رمزینکس', 'اکسیر', 'بیت‌پین', 'کوینکس', 'بایننس', 'اوکی‌اکس', 'کوکوین',
  'کیف پول سخت‌افزاری', 'تراست والت', 'متامسک',
  'نقد', 'صرافی', 'خانه',
];

// حساب‌ها گروه‌بندی‌شده بر اساس مؤسسه: [{key,label,accts}] (بدون مؤسسه در آخر)
export function accountGroups(list) {
  const accts = list || state.accounts;
  const groups = new Map();
  for (const a of accts) {
    const k = institutionOf(a) || '__none';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(a);
  }
  const keys = [...groups.keys()].sort((x, y) => {
    if (x === '__none') return 1;
    if (y === '__none') return -1;
    return x.localeCompare(y, 'fa');
  });
  return keys.map((k) => ({ key: k, label: k === '__none' ? 'سایر' : k, accts: groups.get(k) }));
}

// <option>های select حساب، دسته‌بندی‌شده با <optgroup> بر اساس مؤسسه
export function accountOptGroups(selectedId, list) {
  const escq = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const gs = accountGroups(list);
  if (gs.length <= 1 && gs[0] && gs[0].key === '__none') {
    return gs[0].accts
      .map((a) => `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${escq(a.name)} · ${escq(curName(a.currency))}</option>`)
      .join('');
  }
  return gs
    .map(
      (g) =>
        `<optgroup label="${escq(g.label)}">` +
        g.accts
          .map((a) => `<option value="${a.id}" ${a.id === selectedId ? 'selected' : ''}>${escq(a.name)} · ${escq(curName(a.currency))}</option>`)
          .join('') +
        `</optgroup>`
    )
    .join('');
}

export function institutionOf(a) {
  return (a && a.bank && String(a.bank).trim()) || '';
}

// آیکون گروه بر اساس نوع غالب حساب‌ها
export function institutionIcon(accts) {
  const types = accts.map((x) => x.type);
  if (types.every((t) => t === 'ارز دیجیتال')) return '🪙';
  if (types.every((t) => t === 'نقدی')) return '💵';
  if (types.every((t) => t === 'کیف پول آنلاین')) return '📱';
  return '🏦';
}
// کاتالوگ ارزها: نام فارسی (کلید ذخیره‌شده)، کد ISO، نماد، رقم اعشار، «بزرگ‌واحد» (هزار/میلیون به‌جای K/M)
export const CURRENCY_INFO = {
  'تومان': { code: 'TMN', symbol: 'ت', dec: 0, big: true },
  'ریال': { code: 'IRR', symbol: 'ریال', dec: 0, big: true },
  'دلار': { code: 'USD', symbol: '$', dec: 2 },
  'یورو': { code: 'EUR', symbol: '€', dec: 2 },
  'پوند': { code: 'GBP', symbol: '£', dec: 2 },
  'درهم': { code: 'AED', symbol: 'AED', dec: 2 },
  'لیر': { code: 'TRY', symbol: '₺', dec: 2 },
  'ین': { code: 'JPY', symbol: '¥', dec: 0 },
  'یوان': { code: 'CNY', symbol: '¥', dec: 2 },
  'روبل': { code: 'RUB', symbol: '₽', dec: 2 },
  'روپیه': { code: 'INR', symbol: '₹', dec: 2 },
  'دلار کانادا': { code: 'CAD', symbol: 'C$', dec: 2 },
  'دلار استرالیا': { code: 'AUD', symbol: 'A$', dec: 2 },
  'فرانک': { code: 'CHF', symbol: 'CHF', dec: 2 },
  'دینار عراق': { code: 'IQD', symbol: 'IQD', dec: 0, big: true },
  'افغانی': { code: 'AFN', symbol: '؋', dec: 2 },
  'منات': { code: 'AZN', symbol: '₼', dec: 2 },
  'درام': { code: 'AMD', symbol: '֏', dec: 0 },
  'ریال عمان': { code: 'OMR', symbol: 'OMR', dec: 3 },
  'ریال قطر': { code: 'QAR', symbol: 'QAR', dec: 2 },
  'ریال سعودی': { code: 'SAR', symbol: 'SAR', dec: 2 },
  'دینار کویت': { code: 'KWD', symbol: 'KWD', dec: 3 },
  'تتر': { code: 'USDT', symbol: '₮', dec: 2 },
  'بیت‌کوین': { code: 'BTC', symbol: '₿', dec: 8 },
  'اتریوم': { code: 'ETH', symbol: 'Ξ', dec: 6 },
  'طلا (گرم)': { code: 'XAU', symbol: 'گرم', dec: 3 },
};
export const CURRENCIES = [...Object.keys(CURRENCY_INFO), 'سایر'];
export function currencyInfo(cur) {
  return CURRENCY_INFO[cur] || { code: cur, symbol: cur, dec: 2 };
}
// نام نمایشی واحد پول: در فارسی همان نام؛ در زبان‌های دیگر کد (USD, TMN…)
export function curName(cur) {
  if (!cur) return '';
  if (lang() === 'fa') return cur;
  const i = CURRENCY_INFO[cur];
  return i ? i.code : cur;
}
setCurDisplay(curName);
export const DEFAULT_BASE = 'تومان';
export function baseCur() {
  return (state && state.baseCurrency) || DEFAULT_BASE;
}
// آیا این ارز از خانوادهٔ «بزرگ‌واحد» است (هزار/میلیون به‌جای K/M)
export function isBigUnit(cur) {
  return !!currencyInfo(cur || baseCur()).big;
}

export function defaultState() {
  return {
    accounts: [],
    transactions: [],
    investments: [],
    debts: [],
    installments: [],
    budgets: {},
    rates: {},
    baseCurrency: DEFAULT_BASE,
    calendar: 'jalali',
    bookId: '',
    customCurrencies: [],
    updatedAt: 0,
    rev: 0,
  };
}

function loadState() {
  // حالت رمزشده: داده بعد از بازکردن قفل تزریق می‌شود
  if (isEncrypted()) return defaultState();
  try {
    const s = store.get(KEY);
    if (s) return Object.assign(defaultState(), JSON.parse(s));
  } catch (e) {}
  // کاربر تازه: تقویم دفتر از زبان دستگاه
  const fresh = defaultState();
  fresh.calendar = langInfo().cal === 'gregorian' ? 'gregorian' : 'jalali';
  return fresh;
}
export function bookCal() {
  return state.calendar || 'jalali';
}

export let state = loadState();
syncBase();
export function syncBase() {
  setBookCalendar(state.calendar || 'jalali');
  setBaseInfo(baseCur(), currencyInfo(baseCur()));
  setBigUnits(new Set(Object.keys(CURRENCY_INFO).filter((c) => CURRENCY_INFO[c].big)));
}

let onSave = () => {};
export function setOnSave(fn) {
  onSave = fn;
}

export function persistLocal() {
  if (isEncrypted()) {
    if (isUnlocked()) persistEncrypted(state);
    return;
  }
  store.set(KEY, JSON.stringify(state));
}

export function touchMeta() {
  state.updatedAt = Date.now();
  state.rev = (state.rev || 0) + 1;
}

export function save() {
  touchMeta();
  persistLocal();
  onSave();
}

export function replaceState(next, { markDirty } = {}) {
  state = Object.assign(defaultState(), next);
  syncBase();
  if (markDirty) touchMeta();
  persistLocal();
}

export function accountById(id) {
  return state.accounts.find((a) => a.id === id);
}

// همه واحدهای پول قابل انتخاب: پیش‌فرض‌ها + واحدهای دستی + هر واحدی که قبلاً استفاده شده
export function allCurrencies() {
  const set = new Set([baseCur(), ...CURRENCIES.filter((c) => c !== 'سایر')]);
  for (const c of state.customCurrencies || []) if (c) set.add(c);
  for (const a of state.accounts) if (a.currency) set.add(a.currency);
  for (const i of state.investments) if (i.currency) set.add(i.currency);
  return [...set];
}

export function addCustomCurrency(name) {
  if (!name) return;
  if (!state.customCurrencies) state.customCurrencies = [];
  if (!allCurrencies().includes(name)) state.customCurrencies.push(name);
}

// نرخ یک ارز نسبت به واحد پایه (چند واحد پایه = ۱ واحد این ارز)
export function rateOf(cur) {
  return !cur || cur === baseCur() ? 1 : state.rates[cur] || 0;
}

// تغییر واحد پایه: همهٔ نرخ‌ها با نرخِ واحد جدید بازمحاسبه می‌شوند؛ بودجه‌ها تبدیل می‌شوند.
// newRate = چند واحدِ پایهٔ فعلی = ۱ واحدِ جدید (اگر قبلاً نرخ داشته باشد از همان استفاده می‌شود)
export function changeBaseCurrency(next, newRate) {
  const cur = baseCur();
  if (!next || next === cur) return false;
  const r = Number(newRate) || state.rates[next] || 0;
  if (!(r > 0)) return false;
  const rates = {};
  const tidy = (x) => Number(x.toPrecision(10));
  for (const [c, v] of Object.entries(state.rates || {})) if (c !== next && v > 0) rates[c] = tidy(v / r);
  rates[cur] = tidy(1 / r);
  delete rates[next];
  state.rates = rates;
  for (const mk of Object.keys(state.budgets || {})) {
    const b = state.budgets[mk];
    if (b && b.amount) b.amount = tidy(b.amount / r);
  }
  addCustomCurrency(next);
  state.baseCurrency = next;
  syncBase();
  return true;
}

export function isTransfer(t) {
  return t.type === 'transferIn' || t.type === 'transferOut';
}

export function isInvoice(t) {
  return !!(t && t.kind === 'invoice' && t.lines && t.lines.length);
}

export function txAmountToman(t) {
  const a = accountById(t.accountId);
  return (t.amount || 0) * rateOf(a ? a.currency : baseCur());
}

export function accountCurrent(a) {
  let b = a.initial || 0;
  for (const t of state.transactions) {
    if (t.accountId !== a.id) continue;
    b += t.type === 'in' || t.type === 'transferIn' ? t.amount : -t.amount;
  }
  return b;
}

export function accountCurrentToman(a) {
  return accountCurrent(a) * rateOf(a.currency);
}

export function cashTotal() {
  return state.accounts.reduce((s, a) => s + accountCurrentToman(a), 0);
}

export function investValue(inv) {
  return (inv.qty || 0) * (inv.cur || 0);
}

export function investValueToman(inv) {
  return investValue(inv) * rateOf(inv.currency);
}

export function investTotal() {
  return state.investments.reduce((s, i) => s + investValueToman(i), 0);
}

export function investProfit(inv) {
  return investValue(inv) - (inv.qty || 0) * (inv.buy || 0);
}

export function sortTxs(txs) {
  return txs.slice().sort((a, b) => {
    const d = (b.dateISO || '').localeCompare(a.dateISO || '');
    if (d) return d;
    const ta = b.updatedAt || 0;
    const tb = a.updatedAt || 0;
    if (ta !== tb) return ta - tb;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

export function txDelta(t) {
  return (t.type === 'in' || t.type === 'transferIn' ? 1 : -1) * (t.amount || 0);
}

// موجودی هر حساب درست بعد از همان تراکنش (از قدیم به جدید)
export function runningBalanceByTxId() {
  const bal = {};
  for (const a of state.accounts) bal[a.id] = a.initial || 0;
  const after = {};
  const chrono = sortTxs(state.transactions).reverse();
  for (const t of chrono) {
    if (!t.accountId) continue;
    if (bal[t.accountId] == null) bal[t.accountId] = 0;
    bal[t.accountId] += txDelta(t);
    after[t.id] = bal[t.accountId];
  }
  return after;
}

// خرج واقعی ماه — بدون تراکنش‌های قرض (و بدون اقلامِ قرض در فاکتورها)
export function spentIn(mk) {
  let s = 0;
  for (const t of state.transactions) {
    if (t.month !== mk || t.type !== 'out') continue;
    if (isInvoice(t)) {
      const rate = rateOf(accountById(t.accountId)?.currency);
      for (const line of t.lines) if (line.cat !== LOAN_CAT) s += (line.amount || 0) * rate;
    } else if (!isLoanTx(t)) {
      s += txAmountToman(t);
    }
  }
  return s;
}

// گردش پاکت قرض در ماه: داده‌شده (out) و گرفته‌شده/برگشتی (in)
export function loanFlow(mk) {
  let out = 0;
  let inn = 0;
  for (const t of state.transactions) {
    if (t.month !== mk || isTransfer(t)) continue;
    if (t.type === 'out') {
      if (isInvoice(t)) {
        const rate = rateOf(accountById(t.accountId)?.currency);
        for (const line of t.lines) if (line.cat === LOAN_CAT) out += (line.amount || 0) * rate;
      } else if (isLoanTx(t)) out += txAmountToman(t);
    } else if (t.type === 'in' && isLoanTx(t)) {
      inn += txAmountToman(t);
    }
  }
  return { out, in: inn, net: inn - out };
}

export function budgetOf(mk) {
  return (state.budgets[mk] && state.budgets[mk].amount) || 0;
}

export function catSpent(mk, catId) {
  let s = 0;
  for (const t of state.transactions) {
    if (t.month !== mk || t.type !== 'out') continue;
    if (isInvoice(t)) {
      for (const line of t.lines) {
        if (line.cat === catId) s += (line.amount || 0) * rateOf(accountById(t.accountId)?.currency);
      }
    } else if (t.cat === catId) {
      s += txAmountToman(t);
    }
  }
  return s;
}

export function pocketItems(mk, catId) {
  const items = [];
  for (const t of state.transactions) {
    if (t.month !== mk || isTransfer(t)) continue;
    if (t.type === 'in') {
      if (catId === LOAN_CAT && isLoanTx(t))
        items.push({
          txId: t.id,
          amount: t.amount || 0,
          title: t.note || 'قرض گرفته/برگشت طلب',
          dateISO: t.dateISO,
          accountId: t.accountId,
          invoice: false,
          inflow: true,
        });
      continue;
    }
    if (t.type !== 'out') continue;
    if (isInvoice(t)) {
      for (const line of t.lines) {
        if (line.cat !== catId) continue;
        items.push({
          txId: t.id,
          amount: line.amount || 0,
          title: line.name || 'قلم فاکتور',
          dateISO: t.dateISO,
          accountId: t.accountId,
          invoice: true,
        });
      }
    } else if (t.cat === catId) {
      items.push({
        txId: t.id,
        amount: t.amount || 0,
        title: t.note || (catById(catId) ? catById(catId).label : 'خرج'),
        dateISO: t.dateISO,
        accountId: t.accountId,
        invoice: false,
      });
    }
  }
  return items.sort((a, b) => String(b.dateISO || '').localeCompare(String(a.dateISO || '')));
}

export function catCeiling(mk, catId) {
  const cat = catById(catId);
  const target = cat ? cat.target : 0;
  return Math.round((budgetOf(mk) * target) / 100);
}

// درآمد واقعی ماه — بدون پول قرضی/برگشتی
export function incomeIn(mk) {
  return state.transactions
    .filter((t) => t.month === mk && t.type === 'in' && !isLoanTx(t))
    .reduce((s, t) => s + txAmountToman(t), 0);
}

export function allMonthKeys() {
  const set = new Set([curMonthKey()]);
  for (const t of state.transactions) if (t.month) set.add(t.month);
  for (const k of Object.keys(state.budgets)) set.add(k);
  return [...set].sort();
}

export function computeMonths() {
  const keys = allMonthKeys();
  let carried = 0;
  const res = {};
  for (const k of keys) {
    const budget = (state.budgets[k] && state.budgets[k].amount) || 0;
    const spent = spentIn(k);
    const income = incomeIn(k);
    const available = budget + carried;
    const remaining = available - spent;
    res[k] = { budget, carriedIn: carried, spent, income, available, remaining };
    carried = remaining > 0 ? remaining : 0;
  }
  return res;
}

export function curStats() {
  return (
    computeMonths()[curMonthKey()] || {
      budget: 0,
      carriedIn: 0,
      spent: 0,
      income: 0,
      available: 0,
      remaining: 0,
    }
  );
}

export function hasLocalData(s = state) {
  return (
    !!s.bookId ||
    (s.accounts && s.accounts.length) ||
    (s.transactions && s.transactions.length) ||
    (s.investments && s.investments.length) ||
    (s.debts && s.debts.length) ||
    (s.installments && s.installments.length) ||
    Object.keys(s.budgets || {}).length
  );
}

function mergeById(a, b) {
  const map = new Map();
  for (const item of b || []) if (item && item.id) map.set(item.id, item);
  for (const item of a || []) {
    if (!item || !item.id) continue;
    const other = map.get(item.id);
    if (!other) map.set(item.id, item);
    else {
      const lt = item.updatedAt || 0;
      const rt = other.updatedAt || 0;
      map.set(item.id, lt >= rt ? item : other);
    }
  }
  return [...map.values()];
}

export function mergeStates(local, remote) {
  // دفترهای متفاوت (تقویم متفاوت یا شناسهٔ دفتر متفاوت) با هم ادغام نمی‌شوند؛
  // نسخهٔ جدیدتر به‌طور کامل برنده است (مثلاً بعد از «دفتر جدید» روی دستگاه دیگر)
  const lc = local.calendar || 'jalali';
  const rc = remote.calendar || 'jalali';
  const lb = local.bookId || '';
  const rb = remote.bookId || '';
  if (lc !== rc || (lb && rb && lb !== rb)) {
    const win = (local.updatedAt || 0) >= (remote.updatedAt || 0) ? local : remote;
    return Object.assign(defaultState(), JSON.parse(JSON.stringify(win)), {
      rev: Math.max(local.rev || 0, remote.rev || 0),
    });
  }
  return {
    calendar: lc,
    bookId: lb || rb,
    accounts: mergeById(local.accounts, remote.accounts),
    transactions: mergeById(local.transactions, remote.transactions),
    investments: mergeById(local.investments, remote.investments),
    debts: mergeById(local.debts, remote.debts),
    installments: mergeById(local.installments, remote.installments),
    budgets: Object.assign({}, remote.budgets || {}, local.budgets || {}),
    rates: Object.assign({}, remote.rates || {}, local.rates || {}),
    baseCurrency: local.baseCurrency || remote.baseCurrency || DEFAULT_BASE,
    customCurrencies: [
      ...new Set([...(remote.customCurrencies || []), ...(local.customCurrencies || [])]),
    ],
    updatedAt: Math.max(local.updatedAt || 0, remote.updatedAt || 0),
    rev: Math.max(local.rev || 0, remote.rev || 0),
  };
}

export function fingerprint(s) {
  const copy = Object.assign({}, s);
  delete copy.updatedAt;
  delete copy.rev;
  return JSON.stringify(copy);
}
