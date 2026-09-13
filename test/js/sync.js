import { esc, store, toast } from './utils.js';
import { render } from './view.js';
import {
  fingerprint,
  hasLocalData,
  mergeStates,
  persistLocal,
  replaceState,
  state,
} from './state.js';
import * as sec from './securestore.js';
import { showLockForRemote, openPinRestoreModal, unlockApp } from './prefs.js';

export const GOOGLE_CLIENT_ID = '802769209005-v1jiuetctp8u8lr5su697fafdqhe80oc.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FILENAME = 'capital-app-data-test.json';
const DRIVE_FILE_KEY = 'capital_app_drive_file_id';
const TOKEN_KEY = 'capital_app_g_token';
const TOKEN_SESSION = 't_capital_app_g_token';

export let gUser = null;
let gToken = null;
let tokenClient = null;
let tokenWaiters = [];
let tokenRequesting = false;
let syncTimer = null;
let pushInFlight = false;
let pullInFlight = false;
let pendingLocalSave = false;
let pendingRemoteEnv = null;
let legacyLocalSnapshot = null;
let pinRestoreAsked = false;
let lastPullAt = 0;

function decodeJWT(tok) {
  const b64 = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64 + '==='.slice((b64.length + 3) % 4);
  const bytes = Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function tokenAlive() {
  return !!(gToken && gToken.token && gToken.exp > Date.now() + 5000);
}

function rememberToken(tok) {
  gToken = tok;
  const raw = tok ? JSON.stringify(tok) : '';
  store.set(TOKEN_KEY, raw);
  try {
    if (raw) sessionStorage.setItem(TOKEN_SESSION, raw);
    else sessionStorage.removeItem(TOKEN_SESSION);
  } catch (e) {}
}

function loadSavedToken() {
  try {
    let raw = store.get(TOKEN_KEY);
    if (!raw) {
      try {
        raw = sessionStorage.getItem(TOKEN_SESSION);
      } catch (e) {}
    }
    if (!raw) return;
    const t = JSON.parse(raw);
    if (t && t.token && t.exp > Date.now() + 5000) {
      gToken = t;
      store.set(TOKEN_KEY, raw);
    } else {
      store.set(TOKEN_KEY, '');
      try {
        sessionStorage.removeItem(TOKEN_SESSION);
      } catch (e) {}
    }
  } catch (e) {
    store.set(TOKEN_KEY, '');
  }
}

function setSignedIn(u) {
  gUser = u;
  store.set('g_user', JSON.stringify(u));
  store.set('g_signed', '1');
}

function clearSignedIn() {
  gUser = null;
  rememberToken(null);
  store.set('g_user', '');
  store.set('g_signed', '0');
}

export function handleCredential(resp) {
  try {
    const p = decodeJWT(resp.credential);
    setSignedIn({ name: p.name, email: p.email, picture: p.picture || '' });
  } catch (e) {}
  requestAccessToken(function (ok) {
    if (!ok) {
      toast('نتوانستم به درایو دسترسی بگیرم');
      render();
      return;
    }
    loadFromDrive(function () {
      render();
      toast('ورود موفق ✓ همگام‌سازی فعال شد');
    }, true);
  }, true);
}

export function requestAccessToken(cb, interactive) {
  const done = function (ok) {
    if (cb) cb(ok);
  };
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
    done(false);
    return;
  }
  if (tokenAlive() && gToken.exp > Date.now() + 60000) {
    done(true);
    return;
  }
  tokenWaiters.push(done);
  if (tokenRequesting) return;

  if (!tokenClient) {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: function () {},
    });
  }

  tokenRequesting = true;
  tokenClient.callback = function (resp) {
    tokenRequesting = false;
    const ok = !!(resp && !resp.error && resp.access_token);
    if (ok) {
      rememberToken({
        token: resp.access_token,
        exp: Date.now() + (resp.expires_in || 3600) * 1000,
      });
    }
    const waiters = tokenWaiters.splice(0);
    waiters.forEach((fn) => fn(ok));
  };
  tokenClient.requestAccessToken({ prompt: interactive ? '' : 'none' });
}

export function googleSignIn() {
  if (typeof google === 'undefined' || !google.accounts) {
    toast('در حال بارگذاری گوگل…');
    return;
  }
  requestDriveSignIn();
}

function requestDriveSignIn() {
  requestAccessToken(function (ok) {
    if (!ok) {
      toast('ورود انجام نشد');
      return;
    }
    if (!gUser) {
      setSignedIn({ name: 'حساب گوگل', email: '', picture: '' });
    }
    loadFromDrive(function () {
      render();
      toast('ورود موفق ✓ همگام‌سازی فعال شد');
    }, true);
  }, true);
}

export function openProfileMenu() {
  if (!gUser) return;
  openModalSafe(
    '<button class="x" onclick="closeModal()">✕</button><h2>حساب کاربری</h2><div class="hint" style="margin:14px 0">' +
      esc(gUser.name) +
      '<br><span class="small muted">' +
      esc(gUser.email) +
      '</span></div><button class="btn primary block" onclick="closeModal();pushToDrive(true)">الان در گوگل ذخیره کن</button><button class="btn block" style="margin-top:8px" onclick="closeModal();loadFromDrive(function(){render();toast(\'دریافت از گوگل انجام شد ✓\');},true)">دریافت از گوگل</button><button class="btn danger block" style="margin-top:8px" onclick="closeModal();googleSignOut()">خروج از حساب گوگل</button>'
  );
}

function openModalSafe(html) {
  import('./modal.js').then((m) => m.openModal(html));
}

export function googleSignOut() {
  clearSignedIn();
  if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
    google.accounts.id.disableAutoSelect();
  }
  render();
  toast('از حساب خارج شدی');
}

function driveFetch(url, opts) {
  opts = opts || {};
  opts.headers = opts.headers || {};
  opts.headers.Authorization = 'Bearer ' + gToken.token;
  return fetch(url, opts).then(function (r) {
    if (r.status === 401) {
      rememberToken(null);
      return new Promise(function (res) {
        requestAccessToken(function (ok) {
          if (!ok) {
            res(r);
            return;
          }
          opts.headers.Authorization = 'Bearer ' + gToken.token;
          res(fetch(url, opts));
        }, false);
      });
    }
    return r;
  });
}

function driveFindFile() {
  const savedId = store.get(DRIVE_FILE_KEY);
  if (savedId) {
    return driveFetch(
      'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(savedId) + '?fields=id,name,trashed'
    )
      .then(function (r) {
        if (r.ok) return r.json();
        store.set(DRIVE_FILE_KEY, '');
        return null;
      })
      .then(function (f) {
        if (f && !f.trashed) return f;
        return driveFindFileByName();
      });
  }
  return driveFindFileByName();
}

function driveFindFileByName() {
  const q = "name='" + DRIVE_FILENAME + "' and trashed=false";
  return driveFetch(
    'https://www.googleapis.com/drive/v3/files?q=' +
      encodeURIComponent(q) +
      '&spaces=drive&corpora=user&orderBy=modifiedTime%20desc&pageSize=100&fields=files(id,name,modifiedTime)'
  )
    .then(function (r) {
      if (!r.ok) throw new Error('Drive list ' + r.status);
      return r.json();
    })
    .then(function (d) {
      const f = (d.files && d.files[0]) || null;
      if (f) store.set(DRIVE_FILE_KEY, f.id);
      return f;
    });
}

function driveRead(id) {
  return driveFetch('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media').then(function (r) {
    if (!r.ok) throw new Error('Drive read ' + r.status);
    return r.text();
  });
}

function driveCreate(content) {
  const fd = new FormData();
  fd.append(
    'metadata',
    new Blob([JSON.stringify({ name: DRIVE_FILENAME, mimeType: 'application/json' })], {
      type: 'application/json',
    })
  );
  fd.append('file', new Blob([content], { type: 'application/json' }));
  return driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name',
    { method: 'POST', body: fd }
  )
    .then(function (r) {
      if (!r.ok) throw new Error('Drive create ' + r.status);
      return r.json();
    })
    .then(function (d) {
      if (d.id) store.set(DRIVE_FILE_KEY, d.id);
      return d;
    });
}

function driveUpdate(id, content) {
  const fd = new FormData();
  fd.append(
    'metadata',
    new Blob([JSON.stringify({ name: DRIVE_FILENAME, mimeType: 'application/json' })], {
      type: 'application/json',
    })
  );
  fd.append('file', new Blob([content], { type: 'application/json' }));
  return driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=multipart&fields=id,name',
    { method: 'PATCH', body: fd }
  ).then(function (r) {
    if (r.ok) return r;
    return driveCreate(content);
  });
}

function hasRemoteData(r) {
  return (
    (r.accounts && r.accounts.length) ||
    (r.transactions && r.transactions.length) ||
    (r.investments && r.investments.length) ||
    (r.debts && r.debts.length) ||
    Object.keys(r.budgets || {}).length
  );
}

function decideSync(local, remote) {
  const localHas = hasLocalData(local);
  const remoteHas = hasRemoteData(remote);
  if (localHas && !remoteHas) return { action: 'push', next: local };
  if (remoteHas && !localHas) return { action: 'pull', next: remote };
  const lAt = local.updatedAt || 0;
  const rAt = remote.updatedAt || 0;
  if (lAt > rAt) return { action: 'push', next: local };
  if (rAt > lAt) return { action: 'pull', next: remote };
  const merged = mergeStates(local, remote);
  if (fingerprint(merged) !== fingerprint(local)) return { action: 'push', next: merged };
  return { action: 'noop', next: local };
}

export function loadFromDrive(cb, interactive, quiet) {
  cb = cb || function () {};
  if (pushInFlight || pendingLocalSave) {
    cb();
    return;
  }
  if (pullInFlight) {
    cb();
    return;
  }
  const run = function () {
    pullInFlight = true;
    driveFindFile()
      .then(function (f) {
        if (!f) {
          if (sec.isEncrypted() && !sec.isUnlocked()) return; // هنوز قفل است
          return driveCreate(syncContent()).then(function () {
            pendingLocalSave = false;
            if (!quiet) toast('اطلاعات در Google Drive ذخیره شد ✓');
          });
        }
        return driveRead(f.id).then(function (text) {
          let remote;
          try {
            remote = JSON.parse(text);
          } catch (e) {
            return;
          }
          // پاکت رمزشدهٔ نسخهٔ ۲؟
          if (remote && remote.v === 2 && remote.wraps && remote.data) {
            return handleRemoteEnvelope(remote, f.id);
          }
          // فایل قدیمیِ متن‌ساده
          if (sec.isEncrypted()) {
            if (!sec.isUnlocked()) return; // بعد از باز شدن قفل رسیدگی می‌شود
            const d2 = decideSync(state, remote);
            if (d2.action === 'pull') {
              replaceState(d2.next);
              render();
              pendingLocalSave = true;
            } else if (d2.action === 'push') {
              replaceState(d2.next);
              persistLocal();
              return driveUpdate(f.id, syncContent());
            }
            return;
          }
          const decision = decideSync(state, remote);
          if (decision.action === 'pull') {
            replaceState(decision.next);
          } else if (decision.action === 'push') {
            replaceState(decision.next);
            persistLocal();
            return driveUpdate(f.id, syncContent());
          }
        });
      })
      .then(function () {
        lastPullAt = Date.now();
      })
      .catch(function () {
        if (!quiet && interactive) toast('خطا در دریافت از درایو؛ دوباره مجوز را تأیید کن');
      })
      .then(function () {
        pullInFlight = false;
        cb();
      });
  };

  if (!tokenAlive()) {
    requestAccessToken(function (ok) {
      if (ok) run();
      else {
        if (!quiet && interactive) toast('مجوز Google Drive داده نشد');
        cb();
      }
    }, !!interactive);
    return;
  }
  run();
}

// ─── پردازش پاکت رمزشدهٔ دوردست ────────────────────────────────────────────
async function handleRemoteEnvelope(env, fileId) {
  // دستگاه تازه یا بدون رمزنگاری محلی: پاکت را «قفل‌شده» می‌پذیریم تا
  // جریان عادیِ ورود با رمز عبور اجرا شود — هیچ داده‌ای قبلش دیده نمی‌شود
  if (!sec.isEncrypted()) {
    if (hasLocalData(state)) {
      legacyLocalSnapshot = JSON.parse(JSON.stringify(state));
      pendingRemoteEnv = env;
    }
    sec.adoptRemoteEnvelope(env);
    showLockForRemote();
    render();
    return;
  }
  const localAt = sec.metaUpdatedAt();
  const remoteAt = (env.meta && env.meta.updatedAt) || 0;
  const remoteKid = env.meta && env.meta.kid;
  const localKid = sec.metaKid();
  const diverged = !!(remoteKid && localKid && remoteKid !== localKid);

  // دو دستگاه جداگانه رمزنگاری فعال کرده‌اند: باید یکی شوند
  if (diverged) {
    return tryRepairMerge(env);
  }

  if (remoteAt > localAt) {
    if (!sec.hasSessionPass()) {
      pendingRemoteEnv = env;
      showLockForRemote();
      return;
    }
    try {
      const got = await sec.decryptRemote(env);
      sec.adoptRemoteEnvelope(env);
      sec.setSessionKey(got.dk);
      replaceState(got.state);
      render();
      pendingLocalSave = false;
      toast('داده‌های جدیدتر از گوگل دریافت شد ✓');
    } catch (e) {
      pendingRemoteEnv = env;
      openRemotePassModal();
    }
    return;
  }

  if (localAt > remoteAt) {
    // محلی جدیدتر است؛ پاکت محلی پوش می‌شود
    if (sec.isUnlocked()) return driveUpdate(fileId, syncContent()).then(() => (pendingLocalSave = false));
    pendingLocalSave = true;
    return;
  }

  // هم‌زمان: ادغام در صورت تفاوت
  if (!sec.hasSessionPass()) {
    pendingRemoteEnv = env;
    return;
  }
  try {
    const got = await sec.decryptRemote(env);
    const merged = mergeStates(state, got.state);
    if (fingerprint(merged) !== fingerprint(state)) {
      replaceState(merged);
      render();
      pendingLocalSave = true;
    }
  } catch (e) {
    pendingRemoteEnv = env;
    openRemotePassModal();
  }
}

// ─── یکی‌کردن دو دستگاهی که جداگانه رمزنگاری فعال کرده‌اند ───────────────
async function tryRepairMerge(env) {
  if (!sec.isUnlocked()) {
    // اول با رمز همین دستگاه باز کن، بعد رمز آن یکی را می‌پرسیم
    pendingRemoteEnv = env;
    showLockForRemote();
    return;
  }
  if (sec.hasSessionPass()) {
    try {
      const got = await sec.decryptRemote(env);
      return applyRemoteMerge(env, got);
    } catch (e) {
      // رمز این دستگاه به پاکت گوگل نمی‌خورد
    }
  }
  pendingRemoteEnv = env;
  openRemotePassModal();
}

function openRemotePassModal() {
  openModalSafe(`
    <button class="x" onclick="closeModal()">✕</button>
    <h2>🔑 یکی‌کردن دستگاه‌ها</h2>
    <p class="small muted">نسخهٔ داخل گوگل با رمز عبور دیگری ساخته شده — احتمالاً رمزنگاری را روی دستگاه دیگر جداگانه فعال کرده‌ای.
    برای یکی‌کردن داده‌ها، <b>رمز عبوری که روی آن دستگاه ساختی</b> را وارد کن. بعد از یکی‌شدن، همان رمز روی همهٔ دستگاه‌ها معتبر می‌شود.</p>
    <div class="field"><label>رمز عبورِ دستگاه دیگر</label>
      <input class="input" id="remotePass" type="password" dir="ltr" autocomplete="off"></div>
    <div id="remotePassErr" class="hint" style="display:none;color:#fb7185"></div>
    <button class="btn primary block" style="margin-top:12px" onclick="submitRemotePass()">یکی‌کردن داده‌ها</button>
    <button class="btn block" style="margin-top:8px" onclick="closeModal()">بعداً</button>
  `);
}

export async function submitRemotePass() {
  const env = pendingRemoteEnv;
  if (!env) {
    closeModalSafe();
    return;
  }
  const val = String((document.getElementById('remotePass') || {}).value || '');
  if (!val) {
    toast('رمز عبور را وارد کن');
    return;
  }
  try {
    const got = await sec.decryptRemoteWith(env, val);
    await applyRemoteMerge(env, got);
    closeModalSafe();
  } catch (e) {
    const err = document.getElementById('remotePassErr');
    if (err) {
      err.style.display = '';
      err.textContent = 'این رمز به داده‌های گوگل نخورد؛ رمز همان دستگاه دیگر را وارد کن.';
    }
  }
}

async function applyRemoteMerge(env, got) {
  pendingRemoteEnv = null;
  const merged = mergeStates(state, got.state);
  // پاکت گوگل (کلید و رمزهایش) معتبر می‌شود؛ پین قدیمی این دستگاه باطل است
  sec.adoptRemoteEnvelope(env, { dropPin: true });
  sec.setSessionKey(got.dk);
  replaceState(merged);
  if (document.body.classList.contains('locked')) unlockApp();
  render();
  pendingLocalSave = true;
  pinRestoreAsked = false;
  toast('داده‌ها یکی شد ✓ از این پس با این رمز باز می‌شود');
  pushToDrive(false);
  askRestorePin();
}

function closeModalSafe() {
  import('./modal.js').then((m) => m.closeModal());
}

async function processPendingRemote() {
  const env = pendingRemoteEnv;
  if (!env) return;
  if (!sec.hasSessionPass()) return; // هنوز با رمز عبور باز نشده
  try {
    const got = await sec.decryptRemote(env);
    pendingRemoteEnv = null;
    let next = got.state;
    if (legacyLocalSnapshot) {
      next = mergeStates(legacyLocalSnapshot, next);
      legacyLocalSnapshot = null;
    }
    if (hasLocalData(state)) next = mergeStates(state, next);
    replaceState(next);
    render();
    toast('داده‌ها از گوگل باز شد ✓');
  } catch (e) {
    // رمز این دستگاه به نسخهٔ گوگل نمی‌خورد → پرسیدن رمز دستگاه دیگر
    openRemotePassModal();
  }
}

function askRestorePin() {
  if (pinRestoreAsked) return;
  if (!sec.isEncrypted() || sec.hasWrap('pin')) return;
  pinRestoreAsked = true;
  setTimeout(() => openPinRestoreModal(), 600);
}

// بعد از باز شدن قفل: رسیدگی به دوردستِ معطل، پوش‌های مانده و پیشنهاد پین
document.addEventListener('cap:unlocked', function () {
  if (pendingRemoteEnv) processPendingRemote();
  else if (pendingLocalSave) pushToDrive(false);
  askRestorePin();
});

// بعد از فعال‌شدن رمزنگاری: پوش فوری پاکت رمزشده به درایو
document.addEventListener('cap:encrypt-on', function () {
  if (gUser || tokenAlive()) pushToDrive(false);
});

// محتوایی که در درایو ذخیره می‌شود: پاکت رمزشده یا حالت ساده
function syncContent() {
  if (sec.isEncrypted()) {
    const env = sec.remoteEnvelopeJson();
    if (env) return env;
  }
  return JSON.stringify(state);
}

export function scheduleSync() {
  if (!gUser && !tokenAlive()) return;
  pendingLocalSave = true;
  // فقط تلاش بی‌صدا — هیچ پنجرهٔ لاگینی باز نمی‌شود
  pushToDrive(false);
}

export function pushToDrive(interactive) {
  if (sec.isEncrypted() && !sec.isUnlocked()) return;
  const finish = function () {
    pushInFlight = false;
  };
  const run = function () {
    pushInFlight = true;
    // اول صبر می‌کنیم آخرین رمزکردن محلی تمام شود، بعد محتوا را می‌سازیم
    return sec.whenPersisted().then(startPush);
  };
  const startPush = function () {
    const content = syncContent();
    return driveFindFile()
      .then(function (f) {
        if (f) return driveUpdate(f.id, content);
        return driveCreate(content);
      })
      .then(function () {
        pendingLocalSave = false;
        if (interactive) toast('در Google Drive ذخیره شد ✓');
      })
      .catch(function () {
        if (interactive) toast('ذخیره در گوگل نشد؛ یک‌بار دیگر ثبت را بزن');
      })
      .then(finish);
  };

  if (!tokenAlive()) {
    requestAccessToken(function (ok) {
      if (ok) run();
      else {
        // ذخیرهٔ محلی انجام شده؛ بعداً بی‌صدا دوباره تلاش می‌شود
        if (interactive) toast('برای ذخیره در گوگل دوباره ثبت را بزن');
        finish();
      }
    }, interactive === true);
    return;
  }
  run();
}

export function googleSyncOk() {
  return tokenAlive();
}

export function renderSyncCard() {
  if (gUser && tokenAlive()) return '';
  if (gUser) {
    return (
      '<div class="card"><h3>☁️ اتصال به گوگل</h3>' +
      '<div class="small muted" style="margin-bottom:12px">اتصال همگام‌سازی در دسترس نیست.</div>' +
      '<button class="btn primary block" onclick="googleSignIn()">اتصال دوباره</button></div>'
    );
  }
  return (
    '<div class="card"><h3>☁️ همگام‌سازی ابری</h3>' +
    '<div class="small muted" style="margin-bottom:12px">با حساب گوگل وارد شو تا داده‌هایت خودکار در Google Drive ذخیره شود و از هر دستگاهی در دسترس باشد.</div>' +
    '<button class="btn primary block" onclick="googleSignIn()">ورود با گوگل</button></div>'
  );
}

export function initGoogleOnLoad() {
  if (typeof google === 'undefined' || !google.accounts) return;
  const u = store.get('g_user');
  if (u) {
    try {
      gUser = JSON.parse(u);
    } catch (e) {}
  }
  loadSavedToken();
  google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredential });
  if (store.get('g_signed') === '1') {
    // اول تلاشِ بی‌صدا؛ اگر سشن گوگل زنده باشد کاربر هیچ صفحهٔ لاگینی نمی‌بیند
    requestAccessToken(function (ok) {
      if (ok) {
        loadFromDrive(function () {
          render();
        }, false, true);
      } else {
        render();
      }
    }, false);
  }
  render();
}

loadSavedToken();

export function refreshFromDrive() {
  if (!gUser || pullInFlight || pushInFlight || pendingLocalSave) return;
  if (Date.now() - lastPullAt < 30000) return;
  const done = function () {
    render();
  };
  requestAccessToken(function (ok) {
    if (ok) loadFromDrive(done, false, true);
  }, false);
}

let pageSyncTimer = null;
export function syncOnPageChange() {
  if (!gUser) return;
  if (pushInFlight || pullInFlight) return;
  clearTimeout(pageSyncTimer);
  pageSyncTimer = setTimeout(function () {
    if (pushInFlight || pullInFlight) return;
    if (pendingLocalSave) {
      pushToDrive(false);
      return;
    }
    loadFromDrive(
      function () {
        render();
      },
      false,
      true
    );
  }, 350);
}
