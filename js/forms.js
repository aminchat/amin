import { esc, fmt, toast, uid, todayISO } from './utils.js';
import { jalaliNow, monthOfISO, MONTHS } from './jalali.js';
import { closeModal, openModal, askConfirm } from './modal.js';
import { render } from './view.js';
import {
  ACCT_TYPES,
  CATS,
  accountById,
  accountCurrent,
  addCustomCurrency,
  allCurrencies,
  isTransfer,
  save,
  state,
} from './state.js';

const CUSTOM_CUR = '__custom__';

// گزینه‌های واحد پول + گزینه «سایر» برای افزودن دستی
function currencyOptions(selected) {
  return (
    allCurrencies()
      .map((c) => `<option value="${esc(c)}" ${c === selected ? 'selected' : ''}>${esc(c)}</option>`)
      .join('') + `<option value="${CUSTOM_CUR}">➕ سایر (افزودن دستی…)</option>`
  );
}

export function toggleCustomCurrency(prefix) {
  const sel = document.getElementById(prefix + 'Cur');
  const wrap = document.getElementById(prefix + 'CurCustomWrap');
  if (!sel || !wrap) return;
  wrap.style.display = sel.value === CUSTOM_CUR ? '' : 'none';
  if (sel.value === CUSTOM_CUR) {
    const inp = document.getElementById(prefix + 'CurCustom');
    if (inp) inp.focus();
  }
}

// خواندن واحد پول انتخاب‌شده؛ اگر دستی بود، به لیست واحدها هم اضافه می‌شود
function readCurrencyChoice(prefix) {
  const sel = document.getElementById(prefix + 'Cur');
  if (!sel) return 'تومان';
  if (sel.value !== CUSTOM_CUR) return sel.value;
  const inp = document.getElementById(prefix + 'CurCustom');
  const name = (inp ? inp.value : '').trim();
  if (!name) return null;
  addCustomCurrency(name);
  return name;
}

let editingTxId = null;
let editingAcctId = null;
let editingInvId = null;
let editingTransferPair = null;
let transferStoredRates = {};

export function openTxForm(tx) {
  if (tx && isTransfer(tx)) {
    openTransferForm(tx);
    return;
  }

  editingTxId = tx ? tx.id : null;
  const isEdit = !!tx;
  const type = tx ? tx.type : 'out';
  if (state.accounts.length === 0) {
    openModal(`
      <h2>ابتدا یک حساب بساز</h2>
      <div class="empty"><span class="em">💳</span>برای ثبت تراکنش باید حداقل یک حساب یا کارت تعریف کنی.</div>
      <button class="btn primary block" onclick="closeModal();switchTab('accounts');openAccountForm()">ساخت حساب</button>`);
    return;
  }

  const selectedAccountId = tx ? tx.accountId : state.accounts[0].id;
  const selectedAccount = accountById(selectedAccountId);
  const amountCur = selectedAccount ? selectedAccount.currency : 'تومان';
  const acctOpts = state.accounts
    .map(
      (a) =>
        `<option value="${a.id}" ${a.id === selectedAccountId ? 'selected' : ''}>${esc(a.name)} · ${esc(a.currency)}</option>`
    )
    .join('');
  const catChips = CATS.map(
    (c) => `
    <button type="button" class="chip ${tx && tx.cat === c.id ? 'on' : !tx && c.id === 'need' ? 'on' : ''}" data-cat="${c.id}"
      style="${(!tx && c.id === 'need') || (tx && tx.cat === c.id) ? 'background:' + c.color : ''}"
      onclick="setTxCat(this)">
      <span class="dot"></span>${c.emoji} ${c.label}
    </button>`
  ).join('');
  const showReflect = !!(tx && tx.cat === 'waste' && type === 'out');

  openModal(`
    <button class="x" onclick="closeModal()">✕</button>
    <h2>${isEdit ? 'ویرایش تراکنش' : 'تراکنش جدید'}</h2>
    <div class="seg" id="txTypeSeg" style="margin-bottom:14px">
      <button class="${type === 'out' ? 'on out' : ''}" data-t="out" onclick="setTxType(this)">خرج −</button>
      <button class="${type === 'in' ? 'on' : ''}" data-t="in" onclick="setTxType(this)">درآمد +</button>
    </div>
    <div class="field"><label id="txAmountLbl">مبلغ (${esc(amountCur)})</label>
      <input class="input" id="txAmount" type="number" step="any" inputmode="decimal" min="0" placeholder="مثلاً 250000" value="${tx ? tx.amount : ''}">
    </div>
    <div class="field"><label>از کدام حساب؟</label>
      <select class="input" id="txAccount" onchange="syncTxAmountLabel()">${acctOpts}</select>
    </div>
    <div class="field" id="txCatWrap" style="${type === 'in' ? 'display:none' : ''}">
      <label>دسته‌بندی خرج</label>
      <div class="chips" id="txCats">${catChips}</div>
    </div>
    <div class="field" id="txReflectWrap" style="${showReflect ? '' : 'display:none'}">
      <label>🤔 اگر این خرج را نمی‌کردی، چه می‌شد؟</label>
      <textarea class="input" id="txReflect" placeholder="مثلاً: می‌توانستم همان پول را پس‌انداز کنم...">${tx && tx.reflect ? esc(tx.reflect) : ''}</textarea>
    </div>
    <div class="field"><label>توضیح (اختیاری)</label>
      <input class="input" id="txNote" placeholder="مثلاً: خرید هفتگی" value="${tx ? esc(tx.note || '') : ''}">
    </div>
    <div class="field"><label>تاریخ</label>
      <input class="input" id="txDate" type="date" value="${tx ? tx.dateISO : todayISO()}">
    </div>
    <button class="btn primary block" onclick="saveTx()">${isEdit ? 'ذخیره تغییرات' : 'ثبت تراکنش'}</button>
    ${isEdit ? '<button class="btn danger block" style="margin-top:8px" onclick="delTx(\'' + tx.id + '\')">حذف این تراکنش</button>' : ''}
  `);
}

export function syncTxAmountLabel() {
  const a = accountById(document.getElementById('txAccount').value);
  const lbl = document.getElementById('txAmountLbl');
  if (lbl) lbl.textContent = 'مبلغ (' + (a ? a.currency : 'تومان') + ')';
}

export function setTxType(btn) {
  const t = btn.dataset.t;
  document.querySelectorAll('#txTypeSeg button').forEach((b) => b.classList.remove('on', 'out'));
  btn.classList.add('on');
  if (t === 'out') btn.classList.add('out');
  document.getElementById('txCatWrap').style.display = t === 'in' ? 'none' : '';
  if (t === 'in') document.getElementById('txReflectWrap').style.display = 'none';
  else {
    const active = document.querySelector('#txCats .chip.on');
    document.getElementById('txReflectWrap').style.display =
      active && active.dataset.cat === 'waste' ? '' : 'none';
  }
}

export function setTxCat(btn) {
  document.querySelectorAll('#txCats .chip').forEach((c) => {
    c.classList.remove('on');
    c.style.background = '';
  });
  btn.classList.add('on');
  btn.style.background = CATS.find((c) => c.id === btn.dataset.cat).color;
  document.getElementById('txReflectWrap').style.display = btn.dataset.cat === 'waste' ? '' : 'none';
}

export function saveTx() {
  const amount = parseFloat(document.getElementById('txAmount').value);
  if (!amount || amount <= 0) {
    toast('مبلغ را درست وارد کن');
    return;
  }
  const onBtn = document.querySelector('#txTypeSeg button.on');
  if (!onBtn) {
    toast('نوع تراکنش را انتخاب کن');
    return;
  }
  const type = onBtn.dataset.t;
  if (type !== 'in' && type !== 'out') {
    toast('این مورد را از فرم انتقال ویرایش کن');
    return;
  }
  const accountId = document.getElementById('txAccount').value;
  const note = document.getElementById('txNote').value.trim();
  const dateISO = document.getElementById('txDate').value || todayISO();
  const month = monthOfISO(dateISO);
  const activeCat = document.querySelector('#txCats .chip.on');
  const cat = type === 'out' ? (activeCat ? activeCat.dataset.cat : 'need') : null;
  const reflect = type === 'out' && cat === 'waste' ? document.getElementById('txReflect').value.trim() : '';
  const stamp = Date.now();
  if (editingTxId) {
    const t = state.transactions.find((x) => x.id === editingTxId);
    if (!t || isTransfer(t)) {
      toast('این انتقال را از فرم مخصوصش ویرایش کن');
      return;
    }
    Object.assign(t, { amount, accountId, note, dateISO, type, cat, reflect, month, updatedAt: stamp });
    toast('ویرایش شد');
  } else {
    state.transactions.push({
      id: uid(),
      amount,
      accountId,
      note,
      dateISO,
      type,
      cat,
      reflect,
      month,
      updatedAt: stamp,
    });
    toast('ثبت شد ✓');
  }
  save();
  closeModal();
  render();
}

function pairTransactions(idOrPair) {
  const t = state.transactions.find((x) => x.id === idOrPair || x.pair === idOrPair);
  if (!t) return [];
  if (t.pair) return state.transactions.filter((x) => x.pair === t.pair);
  return [t];
}

export function delTx(id) {
  const group = pairTransactions(id);
  const isPair = group.length > 1;
  askConfirm(isPair ? 'این انتقال (هر دو طرف) حذف شود؟' : 'این تراکنش حذف شود؟', () => {
    const ids = new Set(group.map((x) => x.id));
    state.transactions = state.transactions.filter((t) => !ids.has(t.id));
    save();
    render();
    toast('حذف شد');
  });
}

export function openAccountForm(a) {
  editingAcctId = a ? a.id : null;
  const isEdit = !!a;
  openModal(`
    <button class="x" onclick="closeModal()">✕</button>
    <h2>${isEdit ? 'ویرایش حساب' : 'حساب جدید'}</h2>
    <div class="field"><label>نام حساب</label>
      <input class="input" id="aName" placeholder="مثلاً کارت ملت" value="${a ? esc(a.name) : ''}">
    </div>
    <div class="field"><label>نوع</label>
      <select class="input" id="aType">
        ${ACCT_TYPES.map((t) => `<option ${a && a.type === t ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>واحد پول</label>
      <select class="input" id="aCur" onchange="toggleCustomCurrency('a')">
        ${currencyOptions(a ? a.currency : 'تومان')}
      </select>
    </div>
    <div class="field" id="aCurCustomWrap" style="display:none"><label>نام واحد پول جدید</label>
      <input class="input" id="aCurCustom" placeholder="مثلاً روبل، ین، بیت‌کوین">
      <div class="small muted" style="margin-top:6px">این واحد به لیست اضافه می‌شود و دفعه بعد در گزینه‌ها هست.</div>
    </div>
    <div class="field"><label>۴ رقم آخر کارت (اختیاری)</label>
      <input class="input" id="aLast4" inputmode="numeric" maxlength="4" placeholder="1234" value="${a ? esc(a.last4 || '') : ''}">
    </div>
    <div class="field"><label>موجودی اولیه</label>
      <input class="input" id="aInit" type="number" step="any" inputmode="decimal" placeholder="۰" value="${a ? a.initial : ''}">
    </div>
    <button class="btn primary block" onclick="saveAccount()">${isEdit ? 'ذخیره' : 'افزودن حساب'}</button>
  `);
}

export function saveAccount() {
  const name = document.getElementById('aName').value.trim();
  if (!name) {
    toast('نام حساب را بنویس');
    return;
  }
  const currency = readCurrencyChoice('a');
  if (!currency) {
    toast('نام واحد پول را بنویس');
    return;
  }
  const data = {
    name,
    type: document.getElementById('aType').value,
    currency,
    last4: document.getElementById('aLast4').value.trim(),
    initial: parseFloat(document.getElementById('aInit').value) || 0,
    updatedAt: Date.now(),
  };
  if (editingAcctId) {
    Object.assign(accountById(editingAcctId), data);
  } else {
    state.accounts.push(Object.assign({ id: uid() }, data));
  }
  save();
  closeModal();
  render();
}

export function delAccount(id) {
  const hasTx = state.transactions.some((t) => t.accountId === id);
  askConfirm(hasTx ? 'این حساب و تراکنش‌های مربوط به آن حذف می‌شود. ادامه می‌دهی؟' : 'این حساب حذف شود؟', () => {
    const pairs = new Set(
      state.transactions.filter((t) => t.accountId === id && t.pair).map((t) => t.pair)
    );
    state.accounts = state.accounts.filter((a) => a.id !== id);
    state.transactions = state.transactions.filter((t) => {
      if (t.accountId === id) return false;
      if (t.pair && pairs.has(t.pair)) return false;
      return true;
    });
    save();
    render();
    toast('حذف شد');
  });
}

export function openInvestForm(inv) {
  editingInvId = inv ? inv.id : null;
  const isEdit = !!inv;
  openModal(`
    <button class="x" onclick="closeModal()">✕</button>
    <h2>${isEdit ? 'ویرایش دارایی' : 'دارایی جدید'}</h2>
    <div class="field"><label>نام دارایی</label>
      <input class="input" id="iName" placeholder="مثلاً طلا، زمین، ماشین" value="${inv ? esc(inv.name) : ''}">
    </div>
    <div class="row">
      <div class="col field"><label>مقدار</label>
        <input class="input" id="iQty" type="number" step="any" inputmode="decimal" min="0" placeholder="مثلاً ۵" value="${inv ? inv.qty : ''}">
      </div>
      <div class="col field"><label>واحد</label>
        <input class="input" id="iUnit" placeholder="گرم / متر / عدد" value="${inv ? esc(inv.unit || '') : ''}">
      </div>
    </div>
    <div class="field"><label>واحد پول</label>
      <select class="input" id="iCur" onchange="toggleCustomCurrency('i')">
        ${currencyOptions(inv ? inv.currency : 'تومان')}
      </select>
    </div>
    <div class="field" id="iCurCustomWrap" style="display:none"><label>نام واحد پول جدید</label>
      <input class="input" id="iCurCustom" placeholder="مثلاً روبل، ین، بیت‌کوین">
      <div class="small muted" style="margin-top:6px">این واحد به لیست اضافه می‌شود و دفعه بعد در گزینه‌ها هست.</div>
    </div>
    <div class="row">
      <div class="col field"><label>قیمت خرید (هر واحد)</label>
        <input class="input" id="iBuy" type="number" step="any" inputmode="decimal" min="0" placeholder="۰" value="${inv ? inv.buy : ''}">
      </div>
      <div class="col field"><label>قیمت امروز (هر واحد)</label>
        <input class="input" id="iPriceNow" type="number" step="any" inputmode="decimal" min="0" placeholder="۰" value="${inv ? inv.cur : ''}">
      </div>
    </div>
    <div class="hint">💡 این بخش فقط برای ردیابی «ارزش دارایی» است. خرجِ خریدِ آن را جداگانه در بخش تراکنش‌ها (دسته سرمایه‌گذاری) ثبت کن.</div>
    <div style="height:12px"></div>
    <button class="btn primary block" onclick="saveInvest()">${isEdit ? 'ذخیره' : 'افزودن دارایی'}</button>
  `);
}

export function saveInvest() {
  const name = document.getElementById('iName').value.trim();
  if (!name) {
    toast('نام دارایی را بنویس');
    return;
  }
  const qty = parseFloat(document.getElementById('iQty').value);
  if (!qty || qty <= 0) {
    toast('مقدار را درست وارد کن');
    return;
  }
  const currency = readCurrencyChoice('i');
  if (!currency) {
    toast('نام واحد پول را بنویس');
    return;
  }
  const data = {
    name,
    qty,
    unit: document.getElementById('iUnit').value.trim(),
    currency,
    buy: parseFloat(document.getElementById('iBuy').value) || 0,
    cur: parseFloat(document.getElementById('iPriceNow').value) || 0,
    updatedAt: Date.now(),
  };
  if (editingInvId) {
    Object.assign(state.investments.find((x) => x.id === editingInvId), data);
  } else {
    state.investments.push(Object.assign({ id: uid() }, data));
  }
  save();
  closeModal();
  render();
}

export function delInvest(id) {
  askConfirm('این دارایی حذف شود؟', () => {
    state.investments = state.investments.filter((i) => i.id !== id);
    save();
    render();
    toast('حذف شد');
  });
}

export function editInvestPrice(id) {
  const inv = state.investments.find((i) => i.id === id);
  openModal(`
    <button class="x" onclick="closeModal()">✕</button>
    <h2>به‌روزرسانی قیمت</h2>
    <p class="muted small" style="margin-top:-6px">${esc(inv.name)} — ${inv.qty} ${esc(inv.unit || '')}</p>
    <div class="field"><label>قیمت امروز (هر ${esc(inv.unit || 'واحد')})</label>
      <input class="input" id="pNew" type="number" step="any" inputmode="decimal" min="0" value="${inv.cur}">
    </div>
    <button class="btn primary block" onclick="savePrice('${id}')">ذخیره قیمت</button>
  `);
}

export function savePrice(id) {
  const inv = state.investments.find((i) => i.id === id);
  inv.cur = parseFloat(document.getElementById('pNew').value) || 0;
  inv.updatedAt = Date.now();
  save();
  closeModal();
  render();
  toast('قیمت به‌روز شد ✓');
}

export function openBudgetForm(mk) {
  mk = mk || (function () {
    const [y, m] = jalaliNow();
    return y + '/' + String(m).padStart(2, '0');
  })();
  const b = state.budgets[mk];
  const [sy, sm] = mk.split('/').map(Number);
  const cur = jalaliNow();
  const years = [];
  for (let y = cur[0] - 2; y <= cur[0] + 2; y++) years.push(y);
  const monthOpts = MONTHS.map(
    (name, i) => `<option value="${i + 1}" ${i + 1 === sm ? 'selected' : ''}>${name}</option>`
  ).join('');
  const yearOpts = years
    .map((y) => `<option value="${y}" ${y === sy ? 'selected' : ''}>${y}</option>`)
    .join('');
  openModal(`
    <button class="x" onclick="closeModal()">✕</button>
    <h2>${b ? 'ویرایش بودجه' : 'ثبت بودجه'}</h2>
    <p class="muted small" style="margin-top:-6px">ماه موردنظر را انتخاب کن (مقدار پیش‌فرض، ماه فعلی است).</p>
    <div class="row">
      <div class="col field"><label>ماه</label>
        <select class="input" id="bMonth">${monthOpts}</select>
      </div>
      <div class="col field"><label>سال</label>
        <select class="input" id="bYear">${yearOpts}</select>
      </div>
    </div>
    <div class="field"><label>مبلغ بودجه (تومان)</label>
      <input class="input" id="bAmount" type="number" step="any" inputmode="decimal" min="0" placeholder="مثلاً 15000000" value="${b ? b.amount : ''}">
    </div>
    <button class="btn primary block" onclick="saveBudget()">${b ? 'ذخیره تغییرات' : 'ذخیره بودجه'}</button>
  `);
}

export function saveBudget() {
  const amount = parseFloat(document.getElementById('bAmount').value);
  if (!amount || amount <= 0) {
    toast('مبلغ بودجه را وارد کن');
    return;
  }
  const m = parseInt(document.getElementById('bMonth').value, 10);
  const y = parseInt(document.getElementById('bYear').value, 10);
  const mk = y + '/' + String(m).padStart(2, '0');
  state.budgets[mk] = { amount, updatedAt: Date.now() };
  save();
  closeModal();
  render();
  toast('بودجه ذخیره شد ✓');
}

export function openRateEdit(cur) {
  openModal(`
    <button class="x" onclick="closeModal()">✕</button>
    <h2>نرخ روز ${esc(cur)}</h2>
    <p class="muted small" style="margin-top:-6px">هر ۱ واحد ${esc(cur)} چند تومان است؟ (فقط برای محاسبه دارایی کل؛ در انتقال‌ها استفاده نمی‌شود)</p>
    <div class="field"><label>تومان به ازای هر واحد</label>
      <input class="input" id="rVal" type="number" step="any" inputmode="decimal" min="0" value="${state.rates[cur] || ''}">
    </div>
    <button class="btn primary block" onclick="saveRate('${cur}')">ذخیره نرخ</button>
  `);
}

export function saveRate(cur) {
  const v = parseFloat(document.getElementById('rVal').value);
  if (!v || v <= 0) {
    toast('نرخ را وارد کن');
    return;
  }
  state.rates[cur] = v;
  save();
  closeModal();
  render();
  toast('نرخ ذخیره شد ✓');
}

export function saveRateFrom(cur) {
  const el = document.getElementById('rate_' + cur);
  const v = parseFloat(el ? el.value : '');
  if (!v || v <= 0) {
    toast('نرخ معتبر وارد کن');
    return;
  }
  state.rates[cur] = v;
  save();
  render();
  toast('نرخ ذخیره شد ✓');
}

export function openTransferForm(tx) {
  if (state.accounts.length < 2) {
    toast('برای انتقال، حداقل دو حساب بساز');
    return;
  }
  const pair = tx && tx.pair ? tx.pair : null;
  const out = pair ? state.transactions.find((t) => t.pair === pair && t.type === 'transferOut') : null;
  const inn = pair ? state.transactions.find((t) => t.pair === pair && t.type === 'transferIn') : null;
  editingTransferPair = pair;
  const fromId = out ? out.accountId : state.accounts[0].id;
  const toId = inn
    ? inn.accountId
    : state.accounts.find((a) => a.id !== fromId)?.id || state.accounts[1].id;
  transferStoredRates = {};
  if (out) {
    const fa = accountById(out.accountId);
    const ta = inn ? accountById(inn.accountId) : null;
    if (fa && out.fromRate) transferStoredRates[fa.currency] = out.fromRate;
    if (ta && out.toRate) transferStoredRates[ta.currency] = out.toRate;
  }
  const opts = state.accounts
    .map((a) => `<option value="${a.id}">${esc(a.name)} · ${a.currency}</option>`)
    .join('');
  openModal(`<button class="x" onclick="closeModal()">✕</button>
    <h2>⇄ ${pair ? 'ویرایش انتقال' : 'انتقال بین حساب‌ها'}</h2>
    <div class="hint" style="margin-bottom:12px">این انتقال هزینه یا درآمد نیست و در گزارش‌ها حساب نمی‌شود.</div>
    <div class="field"><label>از حساب</label><select class="input" id="trFrom" onchange="transferAccountsChanged()">${opts}</select></div>
    <div class="field"><label>به حساب</label><select class="input" id="trTo" onchange="transferAccountsChanged()">${opts}</select></div>
    <div class="field"><label>مبلغ از حساب مبدأ</label><input class="input" id="trAmount" type="number" step="any" inputmode="decimal" min="0" placeholder="مبلغ به واحد حساب مبدأ" value="${out ? out.amount : ''}" oninput="updateTransferPreview()"></div>
    <div id="trBalance" class="small muted" style="margin:-8px 0 12px"></div>
    <div id="trRates"></div>
    <div id="trPreview" class="hint" style="margin-bottom:12px">مبلغ حساب مقصد بعد از تبدیل اینجا نمایش داده می‌شود.</div>
    <div class="field"><label>توضیح (اختیاری)</label><input class="input" id="trNote" placeholder="مثلاً انتقال به کارت خرید" value="${esc((out && out.note) || (inn && inn.note) || '')}"></div>
    <div class="field"><label>تاریخ</label><input class="input" id="trDate" type="date" value="${(out && out.dateISO) || (inn && inn.dateISO) || todayISO()}"></div>
    <button class="btn primary block" onclick="saveTransfer()">${pair ? 'ذخیره انتقال' : 'ثبت انتقال'}</button>
    ${pair ? '<button class="btn danger block" style="margin-top:8px" onclick="delTx(\'' + (out || inn).id + '\')">حذف این انتقال</button>' : ''}
  `);
  document.getElementById('trFrom').value = fromId;
  document.getElementById('trTo').value = toId;
  renderTransferRates();
  renderTransferBalance();
  updateTransferPreview();
}

// موجودی قابل برداشت از حساب مبدأ؛ هنگام ویرایش، مبلغ قبلیِ همین انتقال به موجودی برگردانده می‌شود
function transferSourceAvailable(fromId) {
  const acct = accountById(fromId);
  if (!acct) return 0;
  let bal = accountCurrent(acct);
  if (editingTransferPair) {
    const out = state.transactions.find(
      (t) => t.pair === editingTransferPair && t.type === 'transferOut'
    );
    if (out && out.accountId === fromId) bal += out.amount || 0;
  }
  return bal;
}

function renderTransferBalance() {
  const el = document.getElementById('trBalance');
  const fromEl = document.getElementById('trFrom');
  if (!el || !fromEl) return;
  const acct = accountById(fromEl.value);
  if (!acct) {
    el.textContent = '';
    return;
  }
  const avail = Math.max(0, transferSourceAvailable(acct.id));
  el.innerHTML = `موجودی قابل برداشت از ${esc(acct.name)}: <b style="color:var(--text)">${fmt(avail)} ${esc(acct.currency)}</b>`;
}

function renderTransferRates() {
  const wrap = document.getElementById('trRates');
  const fromEl = document.getElementById('trFrom');
  const toEl = document.getElementById('trTo');
  if (!wrap || !fromEl || !toEl) return;
  const from = accountById(fromEl.value);
  const to = accountById(toEl.value);

  // مقادیری که کاربر همین الان در فرم وارد کرده را بر اساس ارز نگه می‌داریم
  const typed = {};
  ['From', 'To'].forEach((w) => {
    const el = document.getElementById('trRate' + w);
    if (el && el.dataset.cur && el.value) typed[el.dataset.cur] = el.value;
  });

  const rateField = (which, acct) => {
    const cur = acct.currency;
    const val =
      typed[cur] !== undefined
        ? typed[cur]
        : transferStoredRates[cur] !== undefined
          ? transferStoredRates[cur]
          : state.rates[cur] || '';
    return `<div class="field"><label>نرخ ${esc(cur)} برای این انتقال (تومان به ازای هر واحد)</label>
      <input class="input" id="trRate${which}" data-cur="${esc(cur)}" type="number" step="any" inputmode="decimal" min="0" placeholder="مثلاً 90000" value="${val}" oninput="updateTransferPreview()">
    </div>`;
  };

  let html = '';
  if (from && to && from.currency !== to.currency) {
    if (from.currency !== 'تومان') html += rateField('From', from);
    if (to.currency !== 'تومان') html += rateField('To', to);
  }
  if (html) {
    html =
      `<div class="hint" style="margin-bottom:12px">💱 این نرخ فقط برای همین انتقال استفاده می‌شود و روی نرخ روزِ محاسبه دارایی کل اثری ندارد.</div>` +
      html;
  }
  wrap.innerHTML = html;
}

export function transferAccountsChanged() {
  renderTransferRates();
  renderTransferBalance();
  updateTransferPreview();
}

function readTransferRates(from, to) {
  const read = (which) => {
    const el = document.getElementById('trRate' + which);
    return parseFloat(el ? el.value : '') || 0;
  };
  const fromRate = from.currency === 'تومان' ? 1 : read('From');
  const toRate = to.currency === 'تومان' ? 1 : read('To');
  return { fromRate, toRate };
}

export function updateTransferPreview() {
  const fromEl = document.getElementById('trFrom');
  const toEl = document.getElementById('trTo');
  const amtEl = document.getElementById('trAmount');
  const box = document.getElementById('trPreview');
  if (!fromEl || !toEl || !amtEl || !box) return;
  const from = accountById(fromEl.value);
  const to = accountById(toEl.value);
  const amount = parseFloat(amtEl.value) || 0;
  if (!from || !to || !amount) {
    box.textContent = 'مبلغ حساب مقصد بعد از تبدیل اینجا نمایش داده می‌شود.';
    return;
  }
  const avail = transferSourceAvailable(from.id);
  if (amount > avail + 1e-9) {
    box.innerHTML = `<span style="color:var(--red)">⚠️ مبلغ از موجودی حساب مبدأ بیشتر است. حداکثر برداشت: <b>${fmt(Math.max(0, avail))} ${esc(from.currency)}</b></span>`;
    return;
  }
  if (from.currency === to.currency) {
    box.innerHTML = `واریز به مقصد: <b>${fmt(amount)} ${esc(to.currency)}</b> (بدون تبدیل)`;
    return;
  }
  const { fromRate, toRate } = readTransferRates(from, to);
  if (!fromRate || !toRate) {
    box.textContent = 'نرخ تبدیل این انتقال را در فیلد بالا وارد کن.';
    return;
  }
  const toman = amount * fromRate;
  const dest = toman / toRate;
  box.innerHTML = `ارزش انتقال: <b>${fmt(toman)} تومان</b><br>واریز به مقصد: <b>${fmt(dest)} ${esc(to.currency)}</b><br><span class="small muted">نرخ این انتقال — ${esc(from.currency)}: ${fmt(fromRate)} تومان · ${esc(to.currency)}: ${fmt(toRate)} تومان</span>`;
}

export function saveTransfer() {
  const from = document.getElementById('trFrom').value;
  const to = document.getElementById('trTo').value;
  const amount = parseFloat(document.getElementById('trAmount').value);
  if (from === to) {
    toast('حساب مبدأ و مقصد باید متفاوت باشند');
    return;
  }
  if (!amount || amount <= 0) {
    toast('مبلغ معتبر وارد کن');
    return;
  }
  const available = transferSourceAvailable(from);
  if (amount > available + 1e-9) {
    toast('مبلغ از موجودی حساب مبدأ بیشتر است؛ حداکثر ' + fmt(Math.max(0, available)));
    return;
  }
  const fromAcct = accountById(from);
  const toAcct = accountById(to);
  const sameCurrency = fromAcct.currency === toAcct.currency;
  let fromRate = 1;
  let toRate = 1;
  if (!sameCurrency) {
    const rates = readTransferRates(fromAcct, toAcct);
    fromRate = rates.fromRate;
    toRate = rates.toRate;
    if (!fromRate || fromRate <= 0 || !toRate || toRate <= 0) {
      toast('نرخ تبدیل این انتقال را وارد کن');
      return;
    }
  }
  const destinationAmount = sameCurrency ? amount : (amount * fromRate) / toRate;
  const dateISO = document.getElementById('trDate').value || todayISO();
  const month = monthOfISO(dateISO);
  const note = document.getElementById('trNote').value.trim();
  const stamp = Date.now();

  if (editingTransferPair) {
    let out = state.transactions.find((t) => t.pair === editingTransferPair && t.type === 'transferOut');
    let inn = state.transactions.find((t) => t.pair === editingTransferPair && t.type === 'transferIn');
    if (!out) {
      out = { id: uid(), pair: editingTransferPair, type: 'transferOut', cat: null };
      state.transactions.push(out);
    }
    if (!inn) {
      inn = { id: uid(), pair: editingTransferPair, type: 'transferIn', cat: null };
      state.transactions.push(inn);
    }
    Object.assign(out, { amount, accountId: from, note, dateISO, month, updatedAt: stamp, type: 'transferOut', cat: null, fromRate, toRate });
    Object.assign(inn, {
      amount: destinationAmount,
      accountId: to,
      note: note || 'انتقال بین حساب‌ها',
      dateISO,
      month,
      updatedAt: stamp,
      type: 'transferIn',
      cat: null,
      fromRate,
      toRate,
    });
    toast('انتقال ویرایش شد ✓');
  } else {
    const pair = uid();
    state.transactions.push({
      id: uid(),
      pair,
      amount,
      accountId: from,
      note,
      dateISO,
      month,
      type: 'transferOut',
      cat: null,
      updatedAt: stamp,
      fromRate,
      toRate,
    });
    state.transactions.push({
      id: uid(),
      pair,
      amount: destinationAmount,
      accountId: to,
      note: note || 'انتقال بین حساب‌ها',
      dateISO,
      month,
      type: 'transferIn',
      cat: null,
      updatedAt: stamp,
      fromRate,
      toRate,
    });
    toast('انتقال با موفقیت ثبت شد ✓');
  }
  editingTransferPair = null;
  save();
  closeModal();
  render();
}

export function pieSVG(slices, size) {
  size = size || 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 6;
  const total = slices.reduce((s, x) => s + x.v, 0);
  if (total <= 0) {
    return `<svg width="${size}" height="${size}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="#1b2435"/><text x="${cx}" y="${cy}" fill="#8b98ab" font-size="13" text-anchor="middle" dominant-baseline="middle">بدون داده</text></svg>`;
  }
  const positive = slices.filter((s) => s.v > 0);
  if (positive.length === 1) {
    const s = positive[0];
    return `<svg width="${size}" height="${size}" style="display:block;margin:0 auto"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${s.color}"/><circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="#141b29"/></svg>`;
  }
  let a = -Math.PI / 2;
  let paths = '';
  for (const s of slices) {
    if (s.v <= 0) continue;
    const sweep = (s.v / total) * Math.PI * 2;
    const x0 = cx + r * Math.cos(a);
    const y0 = cy + r * Math.sin(a);
    const a1 = a + sweep;
    const x1 = cx + r * Math.cos(a1);
    const y1 = cy + r * Math.sin(a1);
    const large = sweep > Math.PI ? 1 : 0;
    paths += `<path d="M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z" fill="${s.color}"/>`;
    a = a1;
  }
  return `<svg width="${size}" height="${size}" style="display:block;margin:0 auto">${paths}<circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="#141b29"/></svg>`;
}
