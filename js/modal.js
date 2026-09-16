import { icon } from './icons.js';
import { enhanceMoneyInputs } from './utils.js';
const overlay = document.getElementById('overlay');
const sheet = document.getElementById('sheet');

export function openModal(html) {
  sheet.innerHTML = '<div class="handle"></div>' + html;
  enhanceMoneyInputs(sheet);
  overlay.classList.add('show');
}

export function closeModal() {
  overlay.classList.remove('show');
}

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && overlay.classList.contains('show')) closeModal();
});

export function askConfirm(msg, onYes) {
  openModal(`
    <div style="text-align:center;padding:10px 4px">
      <span class="ib lg red" style="margin-bottom:12px">${icon('trash')}</span>
      <p style="font-size:15px;margin:0 0 18px">${msg}</p>
      <div class="row">
        <button class="btn" style="flex:1" onclick="closeModal()">انصراف</button>
        <button class="btn danger" style="flex:1" id="cfYes">بله، حذف کن</button>
      </div>
    </div>`);
  document.getElementById('cfYes').onclick = () => {
    closeModal();
    onYes();
  };
}
