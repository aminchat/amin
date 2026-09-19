// ─── رابط سه چراغ: صفحهٔ جزئیات + تنظیمات x,y,z ───
import { t as tr } from './i18n.js';
import { state, save } from './state.js';
import { openModal, closeModal } from './modal.js';
import { icon } from './icons.js';
import { esc, toast, toFa } from './utils.js';
import { curMonthKey, monthLabel } from './jalali.js';
import { healthDetailHtml, healthPrefs, setHealthPref, HEALTH_DEFAULTS } from './health.js';
import { render } from './view.js';

export function openHealth(mk, focus) {
  mk = mk || curMonthKey();
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <h2>${tr('hl.title')} <small class="muted" style="font-weight:400;font-size:var(--fs-sm)">· ${monthLabel(mk)}</small></h2>
    <p class="small muted" style="margin-top:-4px">${tr('hl.intro')}</p>
    <div style="max-height:66vh;overflow:auto">${healthDetailHtml(mk, focus)}</div>
    <button type="button" class="btn sm ghost block" style="margin-top:8px" onclick="openHealthSettings('${mk}')">${icon('settings')} ${tr('hl.settings')}</button>
  `);
  if (focus) setTimeout(() => { const el = document.getElementById('hl_' + focus); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 60);
}

export function openHealthSettings(mk) {
  const p = healthPrefs();
  const num = (id, label, sub) => `<div class="field"><label>${label}</label><input class="input" id="hs_${id}" type="number" min="1" max="12" inputmode="numeric" value="${p[id]}"><div class="hint">${sub}</div></div>`;
  openModal(`
    <button class="x" onclick="closeModal()" aria-label="${tr('بستن')}">${icon('x')}</button>
    <button type="button" class="sback" onclick="openHealth('${mk || ''}')">${icon('chevR')} ${tr('act.back')}</button>
    <h2 style="margin-top:6px">${tr('hl.settings')}</h2>
    ${num('funMonths', tr('hl.set.fun'), tr('hl.set.funSub'))}
    ${num('investMonths', tr('hl.set.invest'), tr('hl.set.investSub'))}
    ${num('charityMonths', tr('hl.set.charity'), tr('hl.set.charitySub'))}
    <div class="field"><label>${tr('hl.set.income')}</label>
      <div class="seg" id="hsIncome">
        ${['auto', 'month', 'avg3'].map((m) => `<button type="button" class="${p.incomeMode === m ? 'on' : ''}" data-m="${m}" onclick="this.parentNode.querySelectorAll('button').forEach(b=>b.classList.remove('on'));this.classList.add('on')">${tr('hl.set.income.' + m)}</button>`).join('')}
      </div>
      <div class="hint">${tr('hl.set.incomeSub')}</div>
    </div>
    <button class="btn primary block" onclick="saveHealthSettings('${mk || ''}')">${tr('ذخیره')}</button>
    <button class="btn block" style="margin-top:8px" onclick="resetHealthSettings('${mk || ''}')">${tr('hl.set.reset')}</button>
  `);
}
export function saveHealthSettings(mk) {
  for (const id of ['funMonths', 'investMonths', 'charityMonths']) {
    const v = parseInt(document.getElementById('hs_' + id).value, 10);
    if (v >= 1 && v <= 12) setHealthPref(id, v);
  }
  const on = document.querySelector('#hsIncome button.on');
  if (on) setHealthPref('incomeMode', on.dataset.m);
  save();
  render();
  toast(tr('ذخیره شد') + ' ✓');
  openHealth(mk);
}
export function resetHealthSettings(mk) {
  state.health = Object.assign({}, HEALTH_DEFAULTS, { updatedAt: Date.now() });
  save();
  render();
  openHealthSettings(mk);
}
