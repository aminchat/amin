// تست راه‌زدن بوت در نود با shim مینیمال DOM — دروازهٔ رهاسازی
// اجرا: node tools/smoke-run.mjs
const APP_DIR = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

function makeClassList() {
  const set = new Set();
  return {
    add: (...c) => c.forEach((x) => set.add(x)),
    remove: (...c) => c.forEach((x) => set.delete(x)),
    toggle: (c, on) => (on === undefined ? (set.has(c) ? (set.delete(c), false) : (set.add(c), true)) : on ? (set.add(c), true) : (set.delete(c), false)),
    contains: (c) => set.has(c),
  };
}

function makeElement(tag = 'div') {
  const el = {
    tagName: (tag || 'div').toUpperCase(),
    innerHTML: '',
    textContent: '',
    value: '',
    disabled: false,
    checked: false,
    style: { setProperty() {} },
    dataset: {},
    className: '',
    id: '',
    classList: makeClassList(),
    children: [],
    _listeners: {},
    offsetLeft: 10,
    offsetWidth: 60,
    addEventListener(t, f) { (el._listeners[t] = el._listeners[t] || []).push(f); },
    removeEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    appendChild(c) { el.children.push(c); return c; },
    insertAdjacentHTML() {},
    insertBefore(c) { el.children.unshift(c); return c; },
    remove() {},
    click() {},
    focus() {},
    blur() {},
    closest() { return null; },
    matches() { return false; },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 56, height: 56 }; },
    getContext() { return null; },
  };
  return el;
}

function storageImpl() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] || null,
    clear: () => m.clear(),
  };
}

const elements = new Map();
function getEl(id) {
  if (!elements.has(id)) { const e = makeElement(); e.id = id; elements.set(id, e); }
  return elements.get(id);
}

const documentShim = {
  documentElement: makeElement('html'),
  body: makeElement('body'),
  head: makeElement('head'),
  getElementById: getEl,
  createElement: (t) => makeElement(t),
  createTextNode: (t) => ({ textContent: t }),
  querySelector: () => makeElement(),
  querySelectorAll: () => [],
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent() {},
  documentMode: undefined,
  readyState: 'complete',
  visibilityState: 'visible',
  font: '',
};

globalThis.window = globalThis;
globalThis.document = documentShim;
globalThis.location = { href: 'http://localhost/', origin: 'http://localhost', hostname: 'localhost', protocol: 'http:', hash: '', search: '', reload() {} };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'fa-IR', languages: ['fa-IR'], userAgent: 'smoke', platform: 'smoke', onLine: true }, configurable: true });
globalThis.localStorage = storageImpl();
globalThis.sessionStorage = storageImpl();
globalThis.CustomEvent = class { constructor(type, opts) { this.type = type; Object.assign(this, opts || {}); } };
globalThis.requestAnimationFrame = (f) => setTimeout(f, 0);
globalThis.fetch = () => Promise.reject(new Error('network-off-in-smoke'));
globalThis.alert = () => {};
globalThis.self = globalThis;
['Node', 'Element', 'HTMLElement', 'HTMLInputElement', 'HTMLDivElement', 'HTMLButtonElement', 'HTMLSelectElement', 'HTMLAnchorElement', 'HTMLCanvasElement', 'HTMLImageElement', 'File', 'Blob', 'FileReader'].forEach((n) => { if (!globalThis[n]) globalThis[n] = class {}; });
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '' });
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.dispatchEvent = () => true;
globalThis.matchMedia = () => ({ matches: false, addEventListener: () => {}, addListener: () => {} });
globalThis.scrollTo = () => {};
globalThis.innerWidth = 390;
globalThis.innerHeight = 800;

const logs = [];
const origErr = console.log.bind(console);
console.error = (...a) => { logs.push(['console.error', ...a].map((x) => (x && x.stack ? x.stack.split('\n').slice(0, 3).join(' | ') : String(x))).join(' ')); };
console.warn = (...a) => { logs.push(['console.warn', ...a].map(String).join(' ')); };
process.on('unhandledRejection', (e) => { logs.push('UNHANDLED_REJECTION: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e))); });
process.on('uncaughtException', (e) => { logs.push('UNCAUGHT: ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : String(e))); });

try {
  await import(APP_DIR + '/js/boot.js');
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 50));
  const html = String((elements.get('homeContent') && elements.get('homeContent').innerHTML) || '');
  origErr('=== LOGS ===');
  logs.slice(0, 30).forEach((l) => origErr(l));
  origErr('=== HOME length:', html.length);
  origErr('pk-ring count:', (html.match(/pk-ring/g) || []).length);
  origErr('hero mood:', /hero (calm|warm|tense)/.test(html));
  origErr('data-ckey count:', (html.match(/data-ckey/g) || []).length);
  origErr(logs.length ? '=== FAIL(logs) ===' : '=== OK ===');
  process.exit(logs.length ? 1 : 0);
} catch (e) {
  origErr('BOOT_IMPORT_THROWN:');
  origErr((e && e.stack ? e.stack : String(e)).split('\n').slice(0, 8).join('\n'));
  logs.slice(0, 30).forEach((l) => origErr(l));
  process.exit(1);
}
