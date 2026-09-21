import { icon } from './icons.js';
import { enhanceMoneyInputs } from './utils.js';
import { enhanceDateInputs } from './jalali.js';
import { t as tr } from './i18n.js';
const overlay = document.getElementById('overlay');
const sheet = document.getElementById('sheet');

export function openModal(html) {
  sheet.innerHTML = '<div class="handle"></div>' + html;
  enhanceMoneyInputs(sheet);
  enhanceDateInputs(sheet);
  overlay.classList.add('show');
}

// بستن با پس‌زمینه/Escape: اگر صفحه‌ای «دکمهٔ بستن» سفارشی دارد (مثل فرم تراکنش با برگشت به مبدأ)، همان اجرا می‌شود
function dismiss() {
  const x = document.querySelector('#sheet .x[onclick]');
  const call = x && x.getAttribute('onclick');
  if (call && call !== 'closeModal()') { try { new Function(call)(); return; } catch (e) { /* fallthrough */ } }
  closeModal();
}
export function closeModal() {
  overlay.classList.remove('show');
}

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) dismiss();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay.classList.contains('show')) dismiss();
});

export function askConfirm(msg, onYes) {
  openModal(`
    <div style="text-align:center;padding:10px 4px">
      <span class="ib lg red" style="margin-bottom:12px">${icon('trash')}</span>
      <p style="font-size:15px;margin:0 0 18px">${msg}</p>
      <div class="row">
        <button class="btn" style="flex:1" onclick="closeModal()">${tr('انصراف')}</button>
        <button class="btn danger" style="flex:1" id="cfYes">${tr('بله، حذف کن')}</button>
      </div>
    </div>`);
  document.getElementById('cfYes').onclick = () => {
    closeModal();
    onYes();
  };
}
