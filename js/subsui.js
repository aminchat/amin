// ─── رابط زیرشاخه‌ها: گزارش سه‌سطحی، دسته‌بندی سریع، انتخاب زیرشاخه در فرم‌ها ────
import { t as tr } from './i18n.js';
import { state, catById, save, CATS } from './state.js';
import { openModal, closeModal } from './modal.js';
import { icon } from './icons.js';
import { esc, toast, fmt, fmtShort, toFa, haptic } from './utils.js';
import { curMonthKey, monthLabel, fmtDate } from './jalali.js';
import { subReportHtml, titleReportHtml, titleTotals, uncategorized, applySubToTitle, subsFor, subLabel, addCustomSub, subChipsHtml, mergeTitles, rejectGroup, ungroupTitle, groupMembers, groupTitle, nodeReportHtml, detachTitle, reattachTitle, isDetached, nodeOf, firstWord } from './subs.js';

function header(title, backCall) {
  return backCall
    ? `<button type="button" class="sback" onclick="${backCall}">${icon('chevR')} ${tr('act.back')}</button><h2 style="margin-top:6px">${title}</h2>`
    : `<button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button><h2>${title}</h2>`;
}

// سطح ۲
export function openCatReport(catId, mk) {
  mk = mk || curMonthKey();
  const c = catById(catId);
  if (!c) return;
  openModal(`
    ${header(`${c.emoji} ${esc(c.label)}`)}
    <div class="row" style="margin-bottom:10px">
      <button type="button" class="btn sm" style="flex:1" onclick="openPocketLedger('${catId}','${mk}')">${icon('list')} ${tr('همهٔ تراکنش‌ها')}</button>
      <button type="button" class="btn sm" style="flex:1" onclick="openQuickCategorize('${catId}','${mk}')">${icon('tag')} ${tr('دسته‌بندی سریع')}</button>
    </div>
    <div style="max-height:62vh;overflow:auto">${subReportHtml(mk, catId)}</div>
  `);
}
// سطح ۳
export function openSubReport(catId, sub, mk) {
  mk = mk || curMonthKey();
  curMk = mk;
  openModal(`
    ${header(esc(subLabel(sub)), `openCatReport('${catId}','${mk}')`)}
    <div style="max-height:66vh;overflow:auto">${titleReportHtml(mk, catId, sub)}</div>
  `);
}
// فهرست خام اقلام یک عنوان
export function openTitleItems(catId, sub, key, mk) {
  mk = mk || curMonthKey();
  const row = titleTotals(mk, catId, sub, { level: 'title' }).rows.find((r) => r.key === key);
  if (!row) return openSubReport(catId, sub, mk);
  openModal(`
    ${header(esc(row.title), nodeOf(catId, sub, key) !== key ? `openTitleNode('${catId}','${sub}','${esc(nodeOf(catId, sub, key))}','${mk}')` : `openSubReport('${catId}','${sub}','${mk}')`)}
    <div class="small muted" style="margin-bottom:8px">${monthLabel(mk)} · ${toFa(row.n)} ${tr('بار')} · ${fmt(row.amount)}</div>
    ${isDetached(catId, sub, key) && firstWord(key) ? `<div class="ins" style="margin-bottom:8px">${icon('tag')}<span>${tr('از گرهٔ «{w}» جدا شده.', { w: esc(firstWord(key)) })} <button type="button" class="btn sm" style="margin-inline-start:6px" onclick="ndReattach('${catId}','${sub}','${esc(key)}','${mk}')">${tr('برگردان به گره')}</button></span></div>` : ''}
    ${groupMembers(key).length ? `<div class="ins" style="margin-bottom:8px">${icon('tag')}<span>${tr('شامل: {list}', { list: groupMembers(key).map((k) => '«' + esc(groupTitle(k)) + '»').join(tr('، ')) })} <button type="button" class="btn sm" style="margin-inline-start:6px" onclick="gsUngroup('${esc(key)}','${catId}','${sub}','${mk}')">${tr('جدا کن')}</button></span></div>` : ''}
    <div style="max-height:62vh;overflow:auto">${row.items
      .sort((a, b) => String(b.dateISO).localeCompare(String(a.dateISO)))
      .map((it) => `<div class="item" onclick="openTxForm(findTx('${it.txId}'))"><div class="mid"><div class="t1">${esc(it.title || row.title)}</div><div class="t2">${fmtDate(it.dateISO)}</div></div><div class="amt out">−${fmt(it.amount)}</div></div>`)
      .join('')}</div>
  `);
}

// ── دسته‌بندی سریع: هر عنوان یکتا یک بار ──
let qcCat = null;
let qcMk = null;
export function openQuickCategorize(catId, mk) {
  qcCat = catId || null;
  qcMk = mk || curMonthKey();
  const list = uncategorized(qcCat).slice(0, 40);
  const back = qcCat ? `openCatReport('${qcCat}','${qcMk}')` : '';
  openModal(`
    ${header(tr('دسته‌بندی سریع'), back)}
    <p class="small muted">${tr('برای هر عنوان یک بار انتخاب کن؛ روی همهٔ خرج‌های هم‌نام (قدیمی و جدید) اعمال می‌شود.')}</p>
    <div id="qcList" style="max-height:64vh;overflow:auto">${list.length ? list.map(qcRow).join('') : `<div class="empty">${tr('همه‌چیز دسته‌بندی شده ✓')}</div>`}</div>
  `);
}
function qcRow(u) {
  const c = catById(u.cat) || CATS[0];
  return `<div class="qc" data-key="${esc(u.key)}">
    <div class="qc-head"><span class="ib sm" style="background:${c.color}22;color:${c.color}">${icon('cat_' + c.id)}</span>
      <span class="smid"><span class="st1">${esc(u.title)}</span><span class="st2">${toFa(u.n)} ${tr('مورد')} · ${fmtShort(u.amount)}</span></span></div>
    <div class="chips subchips">${subsFor(c.id).map((s) => `<button type="button" class="chip sub" onclick="qcPick('${esc(u.key)}','${s.id}')">${esc(subLabel(s.id))}</button>`).join('')}<button type="button" class="chip sub add" onclick="qcPick('${esc(u.key)}','__add')">+ ${tr('دلخواه')}</button></div>
  </div>`;
}
export function qcPick(key, sub) {
  const [cat, tkey] = key.split('|');
  if (sub === '__add') {
    const label = window.prompt(tr('نام زیرشاخهٔ جدید'));
    if (!label) return;
    sub = addCustomSub(cat, label);
    if (!sub) return;
  }
  const n = applySubToTitle(cat, tkey, sub);
  save();
  haptic(6);
  const el = document.querySelector(`.qc[data-key="${CSS.escape(key)}"]`);
  if (el) {
    el.classList.add('done');
    setTimeout(() => el.remove(), 260);
  }
  toast(tr('{n} مورد → {s}', { n: toFa(n), s: subLabel(sub) }));
  const list = document.getElementById('qcList');
  if (list && list.querySelectorAll('.qc').length <= 1) setTimeout(() => openQuickCategorize(qcCat, qcMk), 300);
}

// ── انتخاب زیرشاخه در فرم‌ها ──
// setter(subId) را صدا می‌زند؛ '__add' → پرسیدن نام
export function pickSub(btn, catId, setter) {
  let sub = btn.dataset.sub;
  if (sub === '__add') {
    const label = window.prompt(tr('نام زیرشاخهٔ جدید'));
    if (!label) return;
    sub = addCustomSub(catId, label);
    if (!sub) return;
    const wrap = btn.parentElement;
    if (wrap) wrap.outerHTML = subChipsHtml(catId, sub, btn.getAttribute('onclick').split('(')[0], (btn.getAttribute('onclick').match(/,'([^']+)'\)/) || [])[1]);
  } else {
    const wrap = btn.parentElement;
    if (wrap) wrap.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === btn && !c.classList.contains('on')));
    if (!btn.classList.contains('on')) sub = '';
  }
  setter(sub || '');
}

// ── پاسخ به پیشنهاد ادغام عنوان‌ها ──
let curMk = null;
export function gsAnswer(id, canon, yes, catId, sub) {
  const keys = id.split('|');
  if (yes) { mergeTitles(keys, canon); toast(tr('ادغام شد')); }
  else rejectGroup(keys);
  save();
  haptic(6);
  openSubReport(catId, sub, curMk);
}
export function gsUngroup(key, catId, sub, mk) {
  for (const k of groupMembers(key)) ungroupTitle(k);
  save();
  toast(tr('جدا شد'));
  openSubReport(catId, sub, mk);
}

// ── گرهٔ خودکار: اعضا / جدا کردن / برگرداندن ──
export function openTitleNode(catId, sub, node, mk) {
  mk = mk || curMonthKey();
  openModal(`
    ${header(esc(node), `openSubReport('${catId}','${sub}','${mk}')`)}
    <div style="max-height:66vh;overflow:auto">${nodeReportHtml(mk, catId, sub, node)}</div>
  `);
}
export function ndDetach(catId, sub, key, node, mk) {
  detachTitle(catId, sub, key);
  save();
  toast(tr('جدا شد'));
  const left = nodeReportHtml(mk, catId, sub, node);
  if (nodeOf(catId, sub, key) === key && !left.includes('class="srow')) openSubReport(catId, sub, mk);
  else openTitleNode(catId, sub, node, mk);
}
export function ndReattach(catId, sub, key, mk) {
  reattachTitle(catId, sub, key);
  save();
  toast(tr('برگشت'));
  openTitleItems(catId, sub, key, mk);
}
