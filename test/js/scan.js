import { store, toast, uid } from './utils.js';

const KEY = 'capital_gemini_key';
const MODELS = [
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash',
];

export function hasGeminiKey() {
  return !!store.get(KEY);
}

export function getGeminiKey() {
  return (store.get(KEY) || '').trim();
}

export function saveGeminiKey() {
  const el = document.getElementById('geminiKey');
  const v = (el && el.value ? el.value : '').trim();
  if (!v) {
    toast('کلید را بچسبان');
    return;
  }
  store.set(KEY, v);
  toast('کلید ذخیره شد');
  if (typeof window.openSettings === 'function') window.openSettings();
}

export function clearGeminiKey() {
  store.set(KEY, '');
  toast('کلید پاک شد');
  if (typeof window.openSettings === 'function') window.openSettings();
}

function faToEn(s) {
  return String(s == null ? '' : s).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
}

function num(v) {
  if (typeof v === 'number' && isFinite(v)) return v;
  const s = faToEn(v).replace(/,/g, '').replace(/[^\d.-]/g, '');
  const n = parseFloat(s);
  return n > 0 ? n : 0;
}

function fileToJpeg(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1280;
      let w = img.width;
      let h = img.height;
      if (w > max || h > max) {
        const s = max / Math.max(w, h);
        w = Math.round(w * s);
        h = Math.round(h * s);
      }
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const data = c.toDataURL('image/jpeg', 0.72);
      resolve(data.split(',')[1]);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('خواندن عکس نشد'));
    };
    img.src = url;
  });
}

const PROMPT = `این یک عکس فاکتور یا رسید خرید است.
فقط یک JSON معتبر برگردان، بدون متن اضافه.
مبالغ را به تومان بده (اگر روی فاکتور ریال بود تقسیم بر ۱۰ کن).
اگر مقدار یا قیمت واحد نبود، مقدار را ۱ و قیمت واحد را برابر مبلغ همان قلم بگذار.
تاریخ را اگر خواندی به صورت YYYY-MM-DD میلادی بده، وگرنه null.
شکل JSON:
{"store":"نام فروشگاه یا خالی","total":0,"date":null,"lines":[{"name":"نام کالا","qty":1,"unit":"عدد","unitPrice":0,"amount":0}]}`;

function parseModelJson(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try {
    return JSON.parse(s);
  } catch (e) {
    return null;
  }
}

async function callGemini(model, key, b64) {
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(model) +
    ':generateContent?key=' +
    encodeURIComponent(key);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: PROMPT },
            { inlineData: { mimeType: 'image/jpeg', data: b64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.1 },
    }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const msg = (data.error && data.error.message) || 'خطای ' + resp.status;
    const err = new Error(msg);
    err.status = resp.status;
    throw err;
  }
  const text =
    data.candidates &&
    data.candidates[0] &&
    data.candidates[0].content &&
    data.candidates[0].content.parts &&
    data.candidates[0].content.parts.map((p) => p.text || '').join('\n');
  return parseModelJson(text);
}

export async function readInvoiceImage(file) {
  const key = getGeminiKey();
  if (!key) throw new Error('NO_KEY');
  const b64 = await fileToJpeg(file);
  let lastErr = null;
  for (const model of MODELS) {
    try {
      const raw = await callGemini(model, key, b64);
      if (raw) return normalizeScan(raw);
      lastErr = new Error('جواب قابل فهم نبود');
    } catch (e) {
      lastErr = e;
      if (e.status && e.status !== 404) break;
    }
  }
  throw lastErr || new Error('خواندن فاکتور نشد');
}

function normalizeScan(raw) {
  const linesIn = Array.isArray(raw.lines) ? raw.lines : [];
  const lines = [];
  for (const row of linesIn) {
    const name = String(row.name || row.title || '').trim();
    let qty = num(row.qty != null ? row.qty : row.quantity);
    let unitPrice = num(row.unitPrice != null ? row.unitPrice : row.price);
    let amount = num(row.amount != null ? row.amount : row.total);
    if (!qty) qty = 1;
    if (!amount && unitPrice) amount = unitPrice * qty;
    if (!unitPrice && amount && qty) unitPrice = amount / qty;
    if (!name || !amount) continue;
    lines.push({
      id: uid(),
      name,
      qty,
      unit: String(row.unit || 'عدد').trim() || 'عدد',
      unitPrice,
      amount,
      cat: 'need',
    });
  }
  let total = num(raw.total);
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  if (!total && sum) total = sum;
  let date = raw.date ? String(raw.date).slice(0, 10) : '';
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) date = '';
  return {
    store: String(raw.store || raw.shop || '').trim(),
    total,
    date,
    lines,
  };
}
