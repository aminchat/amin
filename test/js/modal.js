const overlay = document.getElementById('overlay');
const sheet = document.getElementById('sheet');

export function openModal(html) {
  sheet.innerHTML = '<div class="handle"></div>' + html;
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
      <div style="font-size:38px;margin-bottom:10px">🗑️</div>
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
