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

export const GOOGLE_CLIENT_ID = '802769209005-v1jiuetctp8u8lr5su697fafdqhe80oc.apps.googleusercontent.com';
export const APP_VERSION = '1.1.0';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FILENAME = 'capital-app-data.json';
const DRIVE_FILE_KEY = 'capital_app_drive_file_id';

export let gUser = null;
let gToken = null;
let tokenClient = null;
let tokenWaiters = [];
let tokenRequesting = false;
let syncTimer = null;
let pushInFlight = false;
let pullInFlight = false;
let pendingLocalSave = false;
let lastPullAt = 0;

function decodeJWT(tok) {
  const b64 = tok.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64 + '==='.slice((b64.length + 3) % 4);
  const bytes = Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function setSignedIn(u) {
  gUser = u;
  store.set('g_user', JSON.stringify(u));
  store.set('g_signed', '1');
}

function clearSignedIn() {
  gUser = null;
  gToken = null;
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
  if (gToken && gToken.exp > Date.now() + 60000) {
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
      gToken = {
        token: resp.access_token,
        exp: Date.now() + (resp.expires_in || 3600) * 1000,
      };
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
  if (google.accounts.id && typeof google.accounts.id.prompt === 'function') {
    google.accounts.id.prompt((notification) => {
      if (notification && (notification.isNotDisplayed() || notification.isSkippedMoment())) {
        requestDriveSignIn();
      }
    });
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
      '</span></div><button class="btn primary block" onclick="closeModal();loadFromDrive(function(){render();toast(\'دریافت از گوگل انجام شد ✓\');},true)">دریافت آخرین اطلاعات از گوگل</button><button class="btn danger block" style="margin-top:8px" onclick="closeModal();googleSignOut()">خروج از حساب گوگل</button>'
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
      gToken = null;
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
  return driveFetch('https://www.googleapis.com/upload/drive/v3/files/' + id + '?uploadType=media', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: content,
  }).then(function (r) {
    if (!r.ok) throw new Error('Drive upload ' + r.status);
    return r;
  });
}

function hasRemoteData(r) {
  return (
    (r.accounts && r.accounts.length) ||
    (r.transactions && r.transactions.length) ||
    (r.investments && r.investments.length) ||
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

export function loadFromDrive(cb, interactive) {
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
          return driveCreate(JSON.stringify(state)).then(function () {
            pendingLocalSave = false;
            toast('اطلاعات در Google Drive ذخیره شد ✓');
          });
        }
        return driveRead(f.id).then(function (text) {
          let remote;
          try {
            remote = JSON.parse(text);
          } catch (e) {
            return;
          }
          const decision = decideSync(state, remote);
          if (decision.action === 'pull') {
            replaceState(decision.next);
          } else if (decision.action === 'push') {
            replaceState(decision.next);
            persistLocal();
            return driveUpdate(f.id, JSON.stringify(state));
          }
        });
      })
      .then(function () {
        lastPullAt = Date.now();
      })
      .catch(function () {
        toast('خطا در دریافت از درایو؛ دوباره مجوز را تأیید کن');
      })
      .then(function () {
        pullInFlight = false;
        cb();
      });
  };

  if (!gToken) {
    requestAccessToken(function (ok) {
      if (ok) run();
      else {
        toast('مجوز Google Drive داده نشد');
        cb();
      }
    }, !!interactive);
    return;
  }
  run();
}

export function scheduleSync() {
  if (!gUser && !gToken) return;
  pendingLocalSave = true;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushToDrive, 1500);
}

export function pushToDrive() {
  const finish = function () {
    pushInFlight = false;
  };
  const run = function () {
    if (pullInFlight) {
      syncTimer = setTimeout(pushToDrive, 800);
      return;
    }
    pushInFlight = true;
    const content = JSON.stringify(state);
    driveFindFile()
      .then(function (f) {
        if (f) return driveUpdate(f.id, content);
        return driveCreate(content);
      })
      .then(function () {
        pendingLocalSave = false;
        toast('در Google Drive ذخیره شد ✓');
      })
      .catch(function () {
        toast('ذخیره در Google Drive ناموفق بود');
        syncTimer = setTimeout(pushToDrive, 8000);
      })
      .then(finish);
  };

  if (!gToken) {
    requestAccessToken(function (ok) {
      if (ok) run();
      else {
        toast('مجوز Google Drive داده نشد');
        finish();
      }
    }, false);
    return;
  }
  run();
}

export function renderSyncCard() {
  if (gUser) {
    const avatar = gUser.picture
      ? '<img src="' +
        esc(gUser.picture) +
        '" style="width:30px;height:30px;border-radius:50%;object-fit:cover" alt="">'
      : '<div style="width:30px;height:30px;border-radius:50%;background:rgba(61,139,253,.18);display:flex;align-items:center;justify-content:center">👤</div>';
    return (
      '<button onclick="openProfileMenu()" title="حساب کاربری" style="display:flex;align-items:center;justify-content:flex-start;gap:8px;margin:0 0 12px;padding:3px 7px;background:transparent;color:var(--muted);font:inherit;font-size:11px;direction:rtl;text-align:right">' +
      avatar +
      '<div><div style="color:var(--text);font-size:12px;font-weight:600">' +
      esc(gUser.name) +
      '</div>' +
      '<div style="color:var(--green);font-size:10px">همگام‌سازی خودکار فعال ✓ · نسخه ' +
      APP_VERSION +
      '</div></div></button>'
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
  google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleCredential });
  if (store.get('g_signed') === '1') {
    requestAccessToken(function (ok) {
      if (ok)
        loadFromDrive(function () {
          render();
        });
    }, false);
  }
  render();
}

export function refreshFromDrive() {
  if (!gUser || pullInFlight || pushInFlight || pendingLocalSave) return;
  if (Date.now() - lastPullAt < 30000) return;
  const done = function () {
    render();
  };
  if (gToken) loadFromDrive(done);
  else
    requestAccessToken(function (ok) {
      if (ok) loadFromDrive(done);
    }, false);
}
