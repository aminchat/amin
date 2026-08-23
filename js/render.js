import { esc, fmt, fmtT, toFa, store } from './utils.js';
import { curMonthKey, fmtDate, monthLabel, shiftMonth, jalaliNow, MONTHS } from './jalali.js';
import { pieSVG } from './forms.js';
import { renderSyncCard } from './sync.js';
import {
  CATS,
  accountById,
  accountCurrent,
  cashTotal,
  catById,
  computeMonths,
  curStats,
  investProfit,
  investTotal,
  investValue,
  isTransfer,
  rateOf,
  state,
  budgetOf,
  catSpent,
  catCeiling,
} from './state.js';

export let txMonth = curMonthKey();
export let repMonth = curMonthKey();

function envelopeBars(mk) {
  const budget = budgetOf(mk);
  if (!budget) {
    return '<div class="hint">اول بودجه این ماه را ثبت کن تا سقف هر پاکت مشخص شود.</div>';
  }
  return `<div class="pockets">${CATS.map((c) => {
    const spent = catSpent(mk, c.id);
    const ceil = catCeiling(mk, c.id);
    const over = c.target === 0 ? spent > 0 : spent > ceil;
    const width = ceil > 0 ? Math.min(100, Math.round((spent / ceil) * 100)) : spent > 0 ? 100 : 0;
    const left = Math.max(0, ceil - spent);
    return `<button type="button" class="pocket ${over ? 'over' : ''}" onclick="togglePocket(this)">
      <div class="pocket-head">
        <span class="pocket-ic" style="background:${c.color}22">${c.emoji}</span>
        <span class="pocket-name">${c.label}</span>
        <span class="pocket-share">${toFa(c.target)}٪</span>
        <span class="pocket-chev">▾</span>
      </div>
      <div class="bar"><div style="width:${width}%;background:${over ? 'linear-gradient(90deg,#f59e0b,#ef4444)' : c.color}"></div></div>
      <div class="pocket-detail">
        <div class="pocket-stat"><span class="k">خرج‌شده</span><span class="v">${fmt(spent)}</span></div>
        <div class="pocket-stat"><span class="k">سقف</span><span class="v">${fmt(ceil)}</span></div>
        <div class="pocket-stat"><span class="k">${over ? 'تجاوز' : 'مانده'}</span><span class="v" style="color:${over ? 'var(--red)' : 'var(--green)'}">${over ? fmt(spent - ceil) : fmt(left)}</span></div>
      </div>
    </button>`;
  }).join('')}</div>`;
}

export function togglePocket(el) {
  const wrap = el.closest('.pockets');
  const wasOpen = el.classList.contains('open');
  if (wrap) wrap.querySelectorAll('.pocket.open').forEach((p) => p.classList.remove('open'));
  if (!wasOpen) el.classList.add('open');
}

export function renderHome() {
  const s = curStats();
  const mk = curMonthKey();
  const hasBudget = !!(state.budgets[mk] && state.budgets[mk].amount);
  const base = s.available > 0 ? s.available : s.budget;
  const pct = base > 0 ? Math.min(100, Math.round((s.spent / base) * 100)) : 0;
  let html = '';

  html += renderSyncCard();

  if (!hasBudget) {
    html += `<div class="banner warn">⏰ <span>بودجه ${monthLabel(mk)} هنوز ثبت نشده است.</span>
      <button class="btn sm primary" style="margin-right:auto" onclick="openBudgetForm()">ثبت بودجه</button></div>`;
  }
  if (!store.persisted) {
    html += `<div class="banner" style="border-color:rgba(61,139,253,.4)">ℹ️ <span>حالت پیش‌نمایش: ذخیره دائمی در این حالت فعال نیست. فایل را روی گوشی باز کن تا داده‌ها ذخیره بمانند.</span></div>`;
  }

  html += `
  <div class="card">
    <div class="row" style="align-items:center;margin-bottom:8px">
      <h3 style="margin:0">خلاصه ${monthLabel(mk)}</h3>
    </div>
    <div class="stat" style="background:var(--bg2);border-color:var(--border)">
      <div class="lbl">باقی‌مانده این ماه</div>
      <div class="val ${s.remaining >= 0 ? 'green' : 'red'}" style="font-size:26px">${fmtT(s.remaining)}</div>
      <div class="sub">بودجه ${fmt(s.budget)} + مانده قبلی ${fmt(s.carriedIn)} − خرج ${fmt(s.spent)}</div>
    </div>
    <div class="pbar"><div class="${pct >= 100 ? 'over' : ''}" style="width:${pct}%"></div></div>
    <div class="small muted" style="display:flex;justify-content:space-between"><span>${toFa(pct)}٪ از موجودی ماه خرج شده</span><span>${fmtT(s.spent)}</span></div>
  </div>

  <div class="card">
    <h3>پاکت‌های این ماه</h3>
    <div class="small muted" style="margin-bottom:12px">سقف از بودجه ${fmt(s.budget)} تومان. برای دیدن خرج و مانده، روی هر پاکت بزن.</div>
    ${envelopeBars(mk)}
  </div>

  <div class="card" style="background:linear-gradient(135deg,#14203a,#1a1230);border-color:#2a3b5e">
    <h3 style="color:#c7d6f5">💰 خالص دارایی</h3>
    <div class="val" style="font-size:28px;color:#fff">${fmtT(cashTotal() + investTotal())}</div>
    <div class="small" style="color:#93a5c8;margin-top:4px">نقد + سرمایه‌گذاری</div>
  </div>`;

  document.getElementById('homeContent').innerHTML = html;
}

export function renderTx() {
  const txs = state.transactions
    .filter((t) => t.month === txMonth)
    .sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || ''));
  let html = `<div class="mnav">
    <button onclick="txShift(-1)">‹</button>
    <div class="mttl">${monthLabel(txMonth)}<div class="small muted">${txMonth === curMonthKey() ? 'ماه جاری' : ''}</div></div>
    <button onclick="txShift(1)">›</button>
  </div>`;

  if (txs.length === 0) {
    html += `<div class="empty"><span class="em">💸</span>در این ماه تراکنشی ثبت نشده.<br>با دکمه + پایین صفحه شروع کن.</div>`;
  } else {
    let html2 = '';
    for (const t of txs) {
      const a = accountById(t.accountId);
      const cat = t.type === 'out' ? catById(t.cat) : null;
      const transfer = isTransfer(t);
      const ic = transfer ? '⇄' : t.type === 'in' ? '💵' : cat ? cat.emoji : '•';
      const bg = transfer
        ? 'rgba(167,139,250,.15)'
        : t.type === 'in'
          ? 'rgba(34,197,94,.15)'
          : cat
            ? 'rgba(255,255,255,.05)'
            : '';
      const title = t.note
        ? esc(t.note)
        : transfer
          ? 'انتقال بین حساب‌ها'
          : t.type === 'in'
            ? 'درآمد'
            : cat
              ? cat.label
              : 'خرج';
      const amtClass = transfer ? 'transfer' : t.type;
      const sign = t.type === 'in' || t.type === 'transferIn' ? '+' : '−';
      html2 += `
      <div class="item" onclick="openTxForm(findTx('${t.id}'))">
        <div class="ic" style="background:${bg}">${ic}</div>
        <div class="mid">
          <div class="t1">${title}</div>
          <div class="t2">${fmtDate(t.dateISO)} · ${a ? esc(a.name) : '—'}
            ${transfer ? '<span class="badge" style="color:#a78bfa;border-color:#a78bfa55">انتقال</span>' : ''}
            ${t.type === 'out' && cat ? '<span class="badge" style="color:' + cat.color + ';border-color:' + cat.color + '55">' + cat.label + '</span>' : ''}
            ${t.cat === 'waste' && t.reflect ? '<span class="badge" style="color:#ef4444;border-color:#ef444455">🤔 پاسخ داری</span>' : ''}
            ${a && a.currency && a.currency !== 'تومان' ? '<span class="badge">' + esc(a.currency) + '</span>' : ''}
          </div>
        </div>
        <div class="amt ${amtClass}">${sign}${fmt(t.amount)}</div>
      </div>`;
    }
    html += html2;
  }
  document.getElementById('txContent').innerHTML = html;
}

export function txShift(d) {
  txMonth = shiftMonth(txMonth, d);
  renderTx();
}

export function renderReport() {
  const mk = repMonth;
  const txs = state.transactions.filter((t) => t.month === mk);
  const budget = (state.budgets[mk] && state.budgets[mk].amount) || 0;
  const cm = computeMonths()[mk] || { carriedIn: 0, spent: 0, income: 0 };
  const totalSpent = cm.spent;
  const totalIncome = cm.income;
  const wasteTxs = txs.filter((t) => t.cat === 'waste' && t.type === 'out');

  const slices = [];
  for (const c of CATS) {
    const v = txs
      .filter((t) => t.type === 'out' && t.cat === c.id)
      .reduce((s, t) => {
        const a = accountById(t.accountId);
        return s + t.amount * rateOf(a ? a.currency : 'تومان');
      }, 0);
    slices.push({ v, color: c.color, label: c.label });
  }

  let html = `<div class="mnav">
    <button onclick="repShift(-1)">‹</button>
    <div class="mttl">${monthLabel(mk)}</div>
    <button onclick="repShift(1)">›</button>
  </div>`;

  html += `<div class="card">
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:6px">
      <h3 style="margin:0">خرج‌ها به تفکیک دسته</h3>
      <button class="btn sm ghost" onclick="openBudgetForm('${mk}')">${budget ? 'ویرایش بودجه' : 'تعیین بودجه'}</button>
    </div>
    <div class="grid2" style="margin-bottom:12px">
      <div class="stat"><div class="lbl">کل خرج</div><div class="val red">${fmt(totalSpent)}</div></div>
      <div class="stat"><div class="lbl">کل درآمد</div><div class="val green">${fmt(totalIncome)}</div></div>
    </div>
    ${pieSVG(slices.filter((s) => s.v > 0), 190)}
    <div class="legend">
      ${slices
        .filter((s) => s.v > 0)
        .map((s) => {
          const pct = totalSpent > 0 ? Math.round((s.v / totalSpent) * 100) : 0;
          return `<div class="lr"><span class="sw" style="background:${s.color}"></span>
          <span class="nm">${s.label}</span><span class="pv">${fmt(s.v)}</span><span class="pg">${toFa(pct)}٪</span></div>`;
        })
        .join('')}
    </div>
  </div>`;

  html += `<div class="card">
    <h3>سقف پاکت‌ها از بودجه</h3>
    <div class="small muted" style="margin-bottom:12px">${
      budget
        ? 'سقف هر پاکت = سهم آن از بودجه ' + fmt(budget) + ' تومان (۶۰/۲۰/۱۵/۵).'
        : 'برای دیدن سقف پاکت‌ها بودجه این ماه را ثبت کن.'
    }</div>
    ${envelopeBars(mk)}
    <div class="hint">اگر از سقف یک پاکت رد شدی باز هم می‌توانی خرج ثبت کنی؛ فقط از برنامه خارج شده‌ای.</div>
  </div>`;

  html += `<div class="card">
    <h3>🚨 هدررفت‌های این ماه</h3>
    ${
      wasteTxs.length === 0
        ? '<div class="small muted" style="padding:6px 0">هدررفتی ثبت نشده. عالی! 👏</div>'
        : wasteTxs
            .map((t) => {
              const a = accountById(t.accountId);
              return `
      <div class="item" style="align-items:flex-start">
        <div class="ic" style="background:rgba(239,68,68,.15)">🚨</div>
        <div class="mid">
          <div class="t1">${t.note ? esc(t.note) : 'هدررفت'}</div>
          <div class="t2">${fmtDate(t.dateISO)} · ${a ? esc(a.name) : '—'}</div>
          ${t.reflect ? `<div class="hint" style="margin-top:6px">🤔 <b>اگر نمی‌کردی:</b> ${esc(t.reflect)}</div>` : ''}
        </div>
        <div class="amt out">−${fmt(t.amount)}</div>
      </div>`;
            })
            .join('')
    }
    ${
      wasteTxs.length
        ? `<div class="divider"></div><div style="display:flex;justify-content:space-between;font-weight:700"><span>جمع هدررفت</span><span class="red">${fmt(
            wasteTxs.reduce((s, t) => {
              const a = accountById(t.accountId);
              return s + t.amount * rateOf(a ? a.currency : 'تومان');
            }, 0)
          )} تومان</span></div>`
        : ''
    }
  </div>`;

  document.getElementById('reportContent').innerHTML = html;
}

export function repShift(d) {
  repMonth = shiftMonth(repMonth, d);
  renderReport();
}

export function renderInvest() {
  const total = investTotal();
  const totalBuy = state.investments.reduce((s, i) => s + i.qty * i.buy * rateOf(i.currency), 0);
  const plAll = total - totalBuy;
  let html = `
  <div class="card" style="background:linear-gradient(135deg,#14203a,#1a1230);border-color:#2a3b5e">
    <h3 style="color:#c7d6f5">📈 ارزش کل سرمایه‌گذاری</h3>
    <div class="val" style="font-size:26px;color:#fff">${fmtT(total)}</div>
    <div class="small" style="margin-top:6px;color:${plAll >= 0 ? '#22c55e' : '#ef4444'}">${plAll >= 0 ? 'سود' : 'زیان'} کلی: ${fmt(plAll)} تومان</div>
  </div>
  <button class="btn primary block" style="margin-bottom:14px" onclick="openInvestForm()">+ افزودن دارایی</button>`;

  if (state.investments.length === 0) {
    html += `<div class="empty"><span class="em">📈</span>هنوز دارایی ثبت نکرده‌ای.<br>طلا، ملک، ماشین یا هر سرمایه‌ای را اضافه کن.</div>`;
  } else {
    html += state.investments
      .map((i) => {
        const val = investValue(i);
        const pl = investProfit(i);
        const curSuffix = i.currency !== 'تومان' ? ` (${fmt(rateOf(i.currency))} ت/${i.currency})` : '';
        return `<div class="card" style="padding:14px">
        <div class="row" style="align-items:center;margin-bottom:6px">
          <div style="flex:1"><b>${esc(i.name)}</b> <span class="badge">${toFa(i.qty)} ${esc(i.unit || '')}</span></div>
          <div class="small muted">${i.currency}</div>
        </div>
        <div class="grid2" style="margin:10px 0">
          <div class="stat"><div class="lbl">ارزش فعلی</div><div class="val accent">${fmt(val)}</div><div class="sub">${i.currency !== 'تومان' ? '≈ ' + fmtT(val * rateOf(i.currency)) : 'تومان'}</div></div>
          <div class="stat"><div class="lbl">سود / زیان</div><div class="val ${pl >= 0 ? 'green' : 'red'}">${pl >= 0 ? '+' : '−'}${fmt(Math.abs(pl))}</div><div class="sub">از زمان خرید</div></div>
        </div>
        <div class="small muted" style="margin-bottom:10px">قیمت خرید هر ${esc(i.unit || 'واحد')}: ${fmt(i.buy)} · قیمت امروز: <b style="color:var(--text)">${fmt(i.cur)}</b>${curSuffix}</div>
        <div class="row">
          <button class="btn sm primary" onclick="editInvestPrice('${i.id}')">📊 قیمت امروز</button>
          <button class="btn sm" onclick="openInvestForm(findInvest('${i.id}'))">✏️ ویرایش</button>
          <button class="btn sm danger" onclick="delInvest('${i.id}')">🗑️</button>
        </div>
      </div>`;
      })
      .join('');
  }
  document.getElementById('investContent').innerHTML = html;
}

export function renderAccounts() {
  const foreign = [...new Set(state.accounts.map((a) => a.currency).filter((c) => c !== 'تومان'))];
  let html = `
  <div class="row" style="margin-bottom:14px">
    <button class="btn primary" style="flex:1" onclick="openAccountForm()">+ افزودن حساب / کارت</button>
    <button class="btn" style="flex:1" onclick="openTransferForm()">⇄ انتقال بین حساب‌ها</button>
  </div>`;

  if (state.accounts.length === 0) {
    html += `<div class="empty"><span class="em">💳</span>هنوز حسابی نساخته‌ای.<br>کارت بانکی، پول نقد یا کیف پول ارزی اضافه کن.</div>`;
  } else {
    html += state.accounts
      .map((a) => {
        const bal = accountCurrent(a);
        const isForeign = a.currency !== 'تومان';
        const rate = rateOf(a.currency);
        return `<div class="card" style="padding:14px">
        <div class="row" style="align-items:center">
          <div class="ic" style="background:rgba(61,139,253,.15)">💳</div>
          <div style="flex:1">
            <div class="t1" style="font-size:14px">${esc(a.name)} ${a.last4 ? `<span class="badge">•••• ${toFa(a.last4)}</span>` : ''}</div>
            <div class="t2">${esc(a.type)} · ${a.currency}${isForeign && rate ? ` (${fmt(rate)} ت/${a.currency})` : ''}</div>
          </div>
          <div style="text-align:left">
            <div class="amt ${bal >= 0 ? 'in' : 'out'}">${fmt(bal)}</div>
            ${isForeign ? `<div class="small muted">≈ ${fmtT(bal * rate)}</div>` : `<div class="small muted">تومان</div>`}
          </div>
        </div>
        ${isForeign && !rate ? `<div class="hint" style="color:var(--orange);border-color:rgba(245,158,11,.4)">⚠️ نرخ ${a.currency} ثبت نشده؛ در جمع کل حساب نمی‌شود.</div>` : ''}
        <div class="row" style="margin-top:10px">
          <button class="btn sm" onclick="openAccountForm(findAccount('${a.id}'))">✏️ ویرایش</button>
          <button class="btn sm danger" onclick="delAccount('${a.id}')">🗑️</button>
        </div>
      </div>`;
      })
      .join('');
  }

  if (foreign.length) {
    html += `<div class="card"><h3>💱 نرخ روز ارز (تومان به ازای هر واحد)</h3>
      <div class="small muted" style="margin-bottom:8px">این نرخ فقط برای محاسبه ارزش تومانیِ حساب‌ها و دارایی کل استفاده می‌شود؛ نرخ هر انتقال بین حساب‌ها را هنگام ثبت همان انتقال جداگانه وارد می‌کنی.</div>
      ${foreign
        .map(
          (c) => `
        <div class="row" style="align-items:center;margin-bottom:8px">
          <b style="min-width:64px">${esc(c)}</b>
          <input class="input" style="flex:1" id="rate_${c}" type="number" inputmode="decimal" value="${state.rates[c] || ''}" placeholder="مثلاً 90000">
          <button class="btn sm primary" onclick="saveRateFrom('${c}')">ذخیره</button>
        </div>`
        )
        .join('')}
    </div>`;
  }

  document.getElementById('accountsContent').innerHTML = html;
}

export function renderAll() {
  renderHome();
  renderTx();
  renderReport();
  renderInvest();
  renderAccounts();
}

export function setTodayLabel() {
  const [y, m, d] = jalaliNow();
  document.getElementById('todayLbl').textContent = toFa(d) + ' ' + MONTHS[m - 1] + ' ' + toFa(y);
}
