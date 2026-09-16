// راه‌انداز: اول زبان بارگذاری می‌شود، بعد برنامه
import { initI18n } from './i18n.js';
initI18n()
  .catch((e) => console.error('i18n', e))
  .then(() => import('./app.js'))
  .catch((e) => {
    console.error(e);
    if (window.__capLog) window.__capLog('boot', e);
  });
