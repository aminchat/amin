// تاریخچهٔ خواندن از عکس: نتیجهٔ مدل + عکس فشرده، فقط روی همین دستگاه (IndexedDB)، آخرین ۵ مورد.
// در حالت رمزنگاری، همه‌چیز با کلید دادهٔ برنامه رمز می‌شود. در Drive همگام نمی‌شود.
import { isEncrypted, getDataKey } from './securestore.js';
import { encryptData, decryptData } from './crypto.js';
import { store } from './utils.js';

const DB = 'cap_scans', ST = 'scans', MAX = 5;
const PREF = 'cap_scan_hist_off';

export function scanHistOn() {
  return !store.get(PREF);
}
export function setScanHistOn(on) {
  store.set(PREF, on ? '' : '1');
  if (!on) clearScanHistory();
}
function openDb() {
  return new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') return rej(new Error('no idb'));
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore(ST, { keyPath: 'id' });
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}
function tx(db, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(ST, mode);
    const out = fn(t.objectStore(ST));
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
    t.onerror = () => rej(t.error);
  });
}
async function seal(obj) {
  const plain = JSON.stringify(obj);
  if (isEncrypted()) {
    const dk = getDataKey();
    if (!dk) return null;
    return { enc: true, blob: await encryptData(dk, plain) };
  }
  return { enc: false, plain };
}
async function unseal(p) {
  if (!p) return null;
  if (p.enc) {
    const dk = getDataKey();
    if (!dk) return null;
    return JSON.parse(await decryptData(dk, p.blob));
  }
  return JSON.parse(p.plain);
}
function blobToB64(blob) {
  return new Promise((res) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => res('');
    r.readAsDataURL(blob);
  });
}
export function b64ToBlob(b64, type) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: type || 'image/jpeg' });
}
// بندانگشتی کوچک برای فهرست
function thumbOf(file, px) {
  return new Promise((res) => {
    try {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const s = (px || 96) / Math.max(img.width, img.height);
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * s));
        c.height = Math.max(1, Math.round(img.height * s));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => { URL.revokeObjectURL(url); res(''); };
      img.src = url;
    } catch (e) { res(''); }
  });
}

// ذخیرهٔ یک خواندن موفق: res = خروجی نرمال‌شده ({kind, invoice|list})، jpegB64 = همان عکسی که به مدل رفت
export async function rememberScan(res, jpegB64, file) {
  if (!scanHistOn()) return;
  try {
    const thumb = file ? await thumbOf(file) : '';
    const payload = await seal({ res, jpeg: jpegB64 || '' });
    if (!payload) return;
    const rec = { id: 'S' + Date.now(), at: Date.now(), kind: res.kind, title: res.kind === 'invoice' ? (res.invoice && res.invoice.store) || '' : '', n: res.kind === 'invoice' ? ((res.invoice && res.invoice.lines) || []).length : (res.list || []).length, thumb, payload };
    const db = await openDb();
    await tx(db, 'readwrite', (s) => s.put(rec));
    const all = await listScans();
    for (const old of all.slice(MAX)) await tx(db, 'readwrite', (s) => s.delete(old.id));
  } catch (e) {}
}
// فهرست (بدون بازکردن payload): جدیدترین اول
export async function listScans() {
  try {
    const db = await openDb();
    const all = await new Promise((res, rej) => { const rq = db.transaction(ST).objectStore(ST).getAll(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error); });
    return all.sort((a, b) => b.at - a.at);
  } catch (e) { return []; }
}
export async function loadScan(id) {
  const all = await listScans();
  const rec = all.find((x) => x.id === id);
  if (!rec) return null;
  const data = await unseal(rec.payload);
  if (!data) return null;
  return { id: rec.id, at: rec.at, kind: rec.kind, res: data.res, jpegBlob: data.jpeg ? b64ToBlob(data.jpeg) : null };
}
export async function deleteScan(id) {
  try { const db = await openDb(); await tx(db, 'readwrite', (s) => s.delete(id)); } catch (e) {}
}
export async function clearScanHistory() {
  try { const db = await openDb(); await tx(db, 'readwrite', (s) => s.clear()); } catch (e) {}
}
export { blobToB64 };
