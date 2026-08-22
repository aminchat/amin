#!/usr/bin/env python3
# -*- coding: utf-8 -*-
#
# NetMon GUI - Windows network monitor with a browser interface
# --------------------------------------------------------------
# - Shows which program is connected to which server (IP, port, country)
# - Block / unblock a program's internet access (Windows Firewall rules)
# - Kill a process from the UI
# - Zero dependencies: Python 3 standard library only
# - Run:  python netmon-gui.py        then open http://127.0.0.1:8124
#   (browser opens automatically; block/kill need "Run as administrator")
#

import argparse
import ctypes
import json
import os
import re
import socket
import struct
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "1.2"
RULE_PREFIX = "NetMonGUI-Block-"

IS_WINDOWS = (sys.platform == "win32")

DEMO = False  # set by --demo

# ---------------- caches / locks ----------------

_proc_lock = threading.Lock()
_proc_cache = {"ts": 0.0, "map": {}}          # pid -> {"name":..., "path":...}

_geo_lock = threading.Lock()
_geo_cache = {}                                # ip -> "City, Country" or "?"

_demo_lock = threading.Lock()
_demo_state = {
    "rules": [                                 # sample blocked apps (demo mode)
        {"name": RULE_PREFIX + "OneDrive.exe", "program": r"C:\Users\Admin\AppData\local\Microsoft\OneDrive\OneDrive.exe", "enabled": True},
    ],
    "killed": [],
}

SERVICES = {
    "80": "HTTP", "443": "HTTPS", "8080": "HTTP-Alt", "53": "DNS",
    "22": "SSH", "23": "Telnet", "21": "FTP", "25": "SMTP", "110": "POP3",
    "143": "IMAP", "587": "SMTP-TLS", "993": "IMAPS", "995": "POP3S",
    "5228": "Push (GCM)", "5222": "XMPP", "5223": "XMPP-TLS",
    "3478": "STUN/VoIP", "1935": "RTMP", "1080": "SOCKS", "8883": "MQTT",
    "9418": "Git", "3306": "MySQL", "27017": "MongoDB",
}

# ---------------- helpers ----------------

def run_cmd(args, timeout=20):
    """run a command, return stdout as text ('' on failure)."""
    try:
        p = subprocess.run(args, capture_output=True, timeout=timeout)
        return p.stdout.decode("utf-8", errors="replace")
    except Exception:
        return ""


def is_admin():
    if not IS_WINDOWS:
        return True
    try:
        import ctypes
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def ps_quote(s):
    """escape a string for a PowerShell single-quoted literal."""
    return s.replace("'", "''")


def ps_json(command):
    """run PowerShell, return parsed JSON (list or dict or None)."""
    out = run_cmd(["powershell", "-NoProfile", "-Command", command])
    out = out.strip()
    if not out:
        return None
    try:
        return json.loads(out)
    except Exception:
        return None


def relaunch_elevated():
    """restart this script with admin rights (Windows UAC)."""
    if not IS_WINDOWS:
        return False
    try:
        import ctypes
        if getattr(sys, "frozen", False):          # standalone exe (PyInstaller)
            params = '"{}"'.format(sys.executable)
        else:
            params = '"{}" "{}"'.format(sys.executable, os.path.abspath(__file__))
        ret = ctypes.windll.shell32.ShellExecuteW(None, "runas", sys.executable, params, None, 1)
        return int(ret) > 32
    except Exception:
        return False


# ---------------- process table ----------------

def get_processes(force=False):
    """pid -> {name, path}; cached ~8 seconds."""
    with _proc_lock:
        if not force and (time.time() - _proc_cache["ts"]) < 8 and _proc_cache["map"]:
            return _proc_cache["map"]
    # ConvertTo-Json escapes non-ASCII, so output is ASCII-safe
    data = ps_json(
        "Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path } | "
        "Select-Object Id,ProcessName,Path | ConvertTo-Json -Compress"
    )
    mapping = {}
    if isinstance(data, dict):
        data = [data]
    if isinstance(data, list):
        for row in data:
            try:
                mapping[int(row["Id"])] = {
                    "name": str(row.get("ProcessName") or "?"),
                    "path": str(row.get("Path") or ""),
                }
            except Exception:
                pass
    if not mapping and IS_WINDOWS:
        # fallback: tasklist (names only, no paths)
        out = run_cmd(["tasklist", "/fo", "csv", "/nh"])
        for line in out.splitlines():
            parts = [p.strip('"') for p in line.split('","')]
            if len(parts) >= 2:
                try:
                    mapping[int(parts[1])] = {"name": parts[0], "path": ""}
                except Exception:
                    pass
    with _proc_lock:
        _proc_cache["ts"] = time.time()
        _proc_cache["map"] = mapping
    return mapping


# ---------------- connections ----------------

def is_private_ip(ip):
    ip = ip.strip("[]")
    if ip.lower().startswith("::ffff:"):
        ip = ip[7:]
    if ":" in ip:  # IPv6
        low = ip.lower()
        return low.startswith("::1") or low.startswith("fe80") or \
               low.startswith("fc") or low.startswith("fd") or low == "::"
    parts = ip.split(".")
    if len(parts) != 4:
        return True
    try:
        a, b = int(parts[0]), int(parts[1])
    except Exception:
        return True
    if a == 10 or a == 127 or a == 0:
        return True
    if a == 172 and 16 <= b <= 31:
        return True
    if a == 192 and b == 168:
        return True
    if a == 169 and b == 254:
        return True
    return False


KEEP_STATES = {"ESTABLISHED", "CLOSE_WAIT", "TIME_WAIT", "FIN_WAIT_1",
               "FIN_WAIT_2", "SYN_SENT", "SYN_RECEIVED", "CLOSING"}


def parse_addr(token):
    """'1.2.3.4:443' or '[::1]:443' -> (host, port)."""
    token = token.strip()
    if token.startswith("["):                       # IPv6 [addr]:port
        host, _, port = token[1:].partition("]:")
        return host, port
    host, _, port = token.rpartition(":")
    return host, port


def get_connections(include_private=False):
    """list of connection dicts via netstat -ano (Windows)."""
    if not IS_WINDOWS:
        return []
    out = run_cmd(["netstat", "-ano", "-p", "tcp"], timeout=15)
    procs = get_processes()
    items = []
    rx = re.compile(r"^\s*TCP\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)\s*$", re.I)
    for line in out.splitlines():
        m = rx.match(line)
        if not m:
            continue
        laddr, raddr, state, pid = m.group(1), m.group(2), m.group(3).upper(), int(m.group(4))
        if state not in KEEP_STATES:
            continue
        rip, rport = parse_addr(raddr)
        if rport == "0" or rip in ("0.0.0.0", "::"):
            continue
        if not include_private and is_private_ip(rip):
            continue
        p = procs.get(pid)
        items.append({
            "pid": pid,
            "name": (p["name"] if p else ("System" if pid <= 4 else "PID %d" % pid)),
            "path": (p["path"] if p else ""),
            "local": laddr,
            "rip": rip,
            "rport": rport,
            "service": SERVICES.get(rport, ""),
            "state": state,
        })
    return items


# ---------------- geo ----------------

def geo_lookup(ips):
    """fill cache for public ips: ip-api.com batch -> ipwho.is fallback."""
    todo = []
    with _geo_lock:
        for ip in ips:
            if ip in _geo_cache:
                continue
            if is_private_ip(ip):
                _geo_cache[ip] = ""
                continue
            todo.append(ip)
    if not todo:
        return
    todo = todo[:40]
    ok_any = False
    try:
        body = json.dumps(todo).encode()
        req = urllib.request.Request(
            "http://ip-api.com/batch?fields=status,query,country,city",
            data=body, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=8) as r:
            for row in json.loads(r.read().decode("utf-8", "replace")):
                if row.get("status") == "success" and row.get("query"):
                    with _geo_lock:
                        _geo_cache[row["query"]] = "{}, {}".format(row.get("city", ""), row.get("country", ""))
                    ok_any = True
                elif row.get("query"):
                    with _geo_lock:
                        _geo_cache.setdefault(row["query"], "?")
    except Exception:
        pass
    if not ok_any:                                  # HTTPS fallback
        fails = 0
        for ip in todo:
            if fails >= 3:
                break
            try:
                with urllib.request.urlopen("https://ipwho.is/" + ip, timeout=5) as r:
                    row = json.loads(r.read().decode("utf-8", "replace"))
                if row.get("success"):
                    with _geo_lock:
                        _geo_cache[ip] = "{}, {}".format(row.get("city", ""), row.get("country", ""))
                else:
                    fails += 1
            except Exception:
                fails += 1
    with _geo_lock:
        for ip in todo:
            _geo_cache.setdefault(ip, "?")


def geo_get(ip):
    with _geo_lock:
        return _geo_cache.get(ip, "")


# ---------------- firewall management ----------------

def rule_name_for(process_name):
    safe = re.sub(r"[^A-Za-z0-9_.-]", "", process_name) or "app"
    return RULE_PREFIX + safe


def firewall_block(path, process_name):
    if not IS_WINDOWS:
        return False, "firewall is only available on Windows"
    name = rule_name_for(process_name)
    cmd = ("New-NetFirewallRule -DisplayName '{}' -Description 'created by NetMon GUI' "
           "-Direction Outbound -Program '{}' -Action Block | Out-Null").format(
        ps_quote(name), ps_quote(path))
    ps_json(cmd)
    ok = any(r.get("name") == name for r in firewall_rules())
    return (ok, "blocked") if ok else (False, "PowerShell firewall command failed")


def firewall_unblock(process_name):
    if not IS_WINDOWS:
        return False, "firewall is only available on Windows"
    name = rule_name_for(process_name)
    ps_json("Remove-NetFirewallRule -DisplayName '{}' -ErrorAction SilentlyContinue".format(ps_quote(name)))
    return True, "unblocked"


def firewall_rules():
    """list our block rules: [{name, program, enabled}]"""
    if not IS_WINDOWS:
        return []
    cmd = ("Get-NetFirewallRule -DisplayName '{}' -ErrorAction SilentlyContinue | "
           "ForEach-Object {{ $p = ($_ | Get-NetFirewallApplicationFilter).Program; "
           "[pscustomobject]@{{ Name=$_.DisplayName; Program=$p; Enabled=[string]$_.Enabled }} }} | "
           "ConvertTo-Json -Compress").format(ps_quote(RULE_PREFIX + "*"))
    data = ps_json(cmd)
    rules = []
    if isinstance(data, dict):
        data = [data]
    if isinstance(data, list):
        for r in data:
            if isinstance(r, dict):
                rules.append({
                    "name": str(r.get("Name") or r.get("name") or ""),
                    "program": str(r.get("Program") or r.get("program") or ""),
                    "enabled": str(r.get("Enabled") or r.get("enabled") or "True") == "True",
                })
    return rules


def kill_process(pid):
    if not IS_WINDOWS:
        return False, "kill is only available on Windows"
    out = run_cmd(["taskkill", "/PID", str(int(pid)), "/F"], timeout=15)
    ok = ("SUCCESS" in out.upper()) or (run_cmd(["tasklist", "/fi", "PID eq %d" % int(pid)]) == "" )
    return ok, "killed" if ok else out.strip() or "failed"


# ---------------- per-app traffic (TCP byte counters) ----------------
# Uses the Windows IP Helper API (GetPerTcpConnectionEstats) to read
# cumulative sent/received bytes of every TCP connection, then attributes
# the deltas to the owning process. Needs Administrator rights.

TCP_TABLE_OWNER_PID_ALL = 5
ESTATS_DATA = 1


class _TcpRow(ctypes.Structure):
    _fields_ = [("state", ctypes.c_ulong), ("local_addr", ctypes.c_ulong),
                ("local_port", ctypes.c_ulong), ("remote_addr", ctypes.c_ulong),
                ("remote_port", ctypes.c_ulong), ("pid", ctypes.c_ulong)]


class _EstatsDataRw(ctypes.Structure):
    _fields_ = [("enable", ctypes.c_ubyte)]


class _EstatsDataRod(ctypes.Structure):
    _fields_ = [("bytes_in", ctypes.c_ulong), ("bytes_out", ctypes.c_ulong)]


class TrafficMonitor(object):

    def __init__(self):
        self.lock = threading.Lock()
        self.prev = {}            # conn key -> (bytes_in, bytes_out) last reading
        self.apps = {}            # pid -> {"name","dl","ul","dl_rate","ul_rate"}
        self.system = {"dl_rate": 0.0, "ul_rate": 0.0, "dl_total": 0, "ul_total": 0}
        self.estats_ok = IS_WINDOWS
        self.estats_err = 0
        self.diag = {"rows": 0, "enabled": 0, "enable_rc": None, "read_rc": None}
        self._enabled = set()
        self._tries = {}
        self._fail = 0
        self._last_poll = 0.0
        self._ad_prev = None      # (ts, rx, tx) adapter totals
        self._demo_last = 0.0

    # ---- low level (Windows IP Helper) ----
    def _rows(self):
        iph = ctypes.windll.iphlpapi
        size = ctypes.c_ulong(0)
        iph.GetExtendedTcpTable(None, ctypes.byref(size), 0, 2, TCP_TABLE_OWNER_PID_ALL, 0)
        buf = ctypes.create_string_buffer(max(size.value, 4))
        rc = iph.GetExtendedTcpTable(buf, ctypes.byref(size), 0, 2, TCP_TABLE_OWNER_PID_ALL, 0)
        if rc != 0:
            raise OSError("GetExtendedTcpTable rc=%d" % rc)
        n = ctypes.cast(buf, ctypes.POINTER(ctypes.c_ulong)).contents.value
        out = []
        if n <= 0 or n > 5000:
            return out
        arr = ctypes.cast(ctypes.addressof(buf) + 4,
                          ctypes.POINTER(_TcpRow * n)).contents
        for i in range(n):
            r = arr[i]
            lport = ((r.local_port & 0xFF) << 8) | ((r.local_port >> 8) & 0xFF)
            rport = ((r.remote_port & 0xFF) << 8) | ((r.remote_port >> 8) & 0xFF)
            lip = socket.inet_ntoa(struct.pack("<I", r.local_addr & 0xFFFFFFFF))
            rip = socket.inet_ntoa(struct.pack("<I", r.remote_addr & 0xFFFFFFFF))
            out.append(("%s:%d" % (lip, lport), "%s:%d" % (rip, rport), int(r.pid),
                        _TcpRow.from_buffer_copy(bytes(r))))
        return out

    def _enable(self, key, row):
        if key in self._enabled:
            return True
        t = self._tries.get(key, 0)
        if t >= 3:
            return False
        self._tries[key] = t + 1
        rw = _EstatsDataRw()
        rw.enable = 1
        # NOTE: 5 parameters (Row, Type, Rw, RwVersion, RwSize)
        rc = ctypes.windll.iphlpapi.SetPerTcpConnectionEstats(
            ctypes.byref(row), ESTATS_DATA, ctypes.byref(rw), 0, ctypes.sizeof(rw))
        if rc != 0:
            if self.diag["enable_rc"] is None:
                self.diag["enable_rc"] = rc
            self.estats_err = self.estats_err or rc
            self._fail += 1
            return False
        self._enabled.add(key)
        self.diag["enabled"] += 1
        return True

    def _read(self, row):
        rod = _EstatsDataRod()
        # NOTE: 11 parameters (Row, Type, Rw+v+s, Ros+v+s, Rod+v+s)
        rc = ctypes.windll.iphlpapi.GetPerTcpConnectionEstats(
            ctypes.byref(row), ESTATS_DATA,
            None, 0, 0,              # Rw  (out, optional)
            None, 0, 0,              # Ros (out, optional)
            ctypes.byref(rod), 0, ctypes.sizeof(rod))
        if rc != 0:
            if self.diag["read_rc"] is None:
                self.diag["read_rc"] = rc
            raise OSError("GetPerTcpConnectionEstats rc=%d" % rc)
        return int(rod.bytes_in), int(rod.bytes_out)

    # ---- polling ----
    def poll_conns(self):
        rows = self._rows()
        self.diag["rows"] = len(rows)
        procs = get_processes()
        now = time.time()
        cur = {}
        for local, remote, pid, row in rows:
            if pid <= 4:
                continue
            key = (local, remote, pid)
            try:
                if not self._enable(key, row):
                    continue
                cur[key] = (self._read(row) + (pid,))
            except Exception:
                self._fail += 1
        interval = max(0.2, now - self._last_poll) if self._last_poll else 2.0
        self._last_poll = now
        per_pid = {}
        with self.lock:
            for key, val in cur.items():
                bi, bo, pid = val
                prev = self.prev.get(key)
                if prev is None:              # first time seen -> baseline only
                    self.prev[key] = (bi, bo)
                    continue
                dib = max(0, bi - prev[0])
                dob = max(0, bo - prev[1])
                self.prev[key] = (bi, bo)
                d = per_pid.setdefault(pid, [0, 0])
                d[0] += dib
                d[1] += dob
            self.prev = {k: v for k, v in self.prev.items() if k in cur}
            for pid, (dib, dob) in per_pid.items():
                a = self.apps.setdefault(pid, {"name": "", "dl": 0, "ul": 0,
                                               "dl_rate": 0.0, "ul_rate": 0.0})
                a["dl"] += dib
                a["ul"] += dob
                a["dl_rate"] = dib / interval
                a["ul_rate"] = dob / interval
                p = procs.get(pid)
                if p:
                    a["name"] = p["name"]
                elif not a["name"]:
                    a["name"] = "PID %d" % pid

    def poll_adapters(self):
        """system-wide rates from NIC statistics (works without admin)."""
        data = ps_json("Get-NetAdapterStatistics | Select-Object ReceivedBytes,SentBytes | "
                       "ConvertTo-Json -Compress")
        if data is None:
            return
        rows = data if isinstance(data, list) else [data]
        rx = sum(int(r.get("ReceivedBytes") or 0) for r in rows if isinstance(r, dict))
        tx = sum(int(r.get("SentBytes") or 0) for r in rows if isinstance(r, dict))
        now = time.time()
        with self.lock:
            if self._ad_prev:
                dt = max(0.2, now - self._ad_prev[0])
                self.system["dl_rate"] = max(0.0, (rx - self._ad_prev[1]) / dt)
                self.system["ul_rate"] = max(0.0, (tx - self._ad_prev[2]) / dt)
            self._ad_prev = (now, rx, tx)
            self.system["dl_total"] = rx
            self.system["ul_total"] = tx

    def poll_demo(self):
        import random
        now = time.time()
        dt = (now - self._demo_last) if self._demo_last else 2.0
        self._demo_last = now
        rates = [(15436, "chrome", 250 * 1024), (8288, "telegram", 60 * 1024),
                 (9460, "steam", 30 * 1024)]
        with _demo_lock:
            blocked = any(r["name"].endswith("OneDrive.exe") for r in _demo_state["rules"])
            killed = list(_demo_state["killed"])
        if not blocked:
            rates.append((9764, "OneDrive", 500 * 1024))
        with self.lock:
            for pid, name, rate in rates:
                if pid in killed:
                    continue
                a = self.apps.setdefault(pid, {"name": name, "dl": 0, "ul": 0,
                                               "dl_rate": 0.0, "ul_rate": 0.0})
                dib = int(rate * dt * (0.7 + random.random() * 0.6))
                dob = int(rate * 0.08 * dt)
                a["dl"] += dib
                a["ul"] += dob
                a["dl_rate"] = dib / dt
                a["ul_rate"] = dob / dt
            self.system = {
                "dl_rate": sum(a["dl_rate"] for a in self.apps.values()),
                "ul_rate": sum(a["ul_rate"] for a in self.apps.values()),
                "dl_total": sum(a["dl"] for a in self.apps.values()),
                "ul_total": sum(a["ul"] for a in self.apps.values()),
            }

    def poll(self):
        if DEMO:
            self.estats_ok = True
            self.poll_demo()
            return
        if not IS_WINDOWS:
            return
        try:
            self.poll_conns()
        except Exception:
            self._fail += 1
        if self._fail >= 3 and self.estats_ok:
            self.estats_ok = False
            print("[traffic] per-app counters FAILED - rows=%(rows)s enable_rc=%(enable_rc)s read_rc=%(read_rc)s"
                  % self.diag)
        try:
            self.poll_adapters()
        except Exception:
            pass


TRAFFIC_M = TrafficMonitor()


def traffic_loop():
    while True:
        try:
            TRAFFIC_M.poll()
        except Exception:
            pass
        time.sleep(2)


# ---------------- demo mode (sample data) ----------------

def demo_connections():
    base = [
        {"pid": 15436, "name": "chrome", "path": r"C:\Program Files\Google\Chrome\Application\chrome.exe",
         "local": "192.168.1.20:58778", "rip": "142.250.151.94", "rport": "443", "service": "HTTPS", "state": "ESTABLISHED"},
        {"pid": 15436, "name": "chrome", "path": r"C:\Program Files\Google\Chrome\Application\chrome.exe",
         "local": "192.168.1.20:58754", "rip": "78.38.239.18", "rport": "443", "service": "HTTPS", "state": "ESTABLISHED"},
        {"pid": 15436, "name": "chrome", "path": r"C:\Program Files\Google\Chrome\Application\chrome.exe",
         "local": "192.168.1.20:58002", "rip": "64.233.184.188", "rport": "5228", "service": "Push (GCM)", "state": "ESTABLISHED"},
        {"pid": 8288, "name": "telegram", "path": r"C:\Users\Admin\AppData\Roaming\Telegram Desktop\Telegram.exe",
         "local": "192.168.1.20:58793", "rip": "149.154.167.50", "rport": "443", "service": "HTTPS", "state": "ESTABLISHED"},
        {"pid": 8288, "name": "telegram", "path": r"C:\Users\Admin\AppData\Roaming\Telegram Desktop\Telegram.exe",
         "local": "192.168.1.20:58293", "rip": "149.154.175.50", "rport": "443", "service": "HTTPS", "state": "ESTABLISHED"},
        {"pid": 9460, "name": "steam", "path": r"C:\Program Files (x86)\Steam\steam.exe",
         "local": "192.168.1.20:58787", "rip": "185.199.108.133", "rport": "443", "service": "HTTPS", "state": "ESTABLISHED"},
        {"pid": 9764, "name": "OneDrive", "path": r"C:\Users\Admin\AppData\local\Microsoft\OneDrive\OneDrive.exe",
         "local": "192.168.1.20:58151", "rip": "52.98.243.18", "rport": "443", "service": "HTTPS", "state": "CLOSE_WAIT"},
        {"pid": 4, "name": "System", "path": "",
         "local": "192.168.1.20:58714", "rip": "82.178.158.25", "rport": "80", "service": "HTTP", "state": "TIME_WAIT"},
    ]
    demo_geo = {
        "142.250.151.94": "Mountain View, United States",
        "78.38.239.18": "Tehran, Iran",
        "64.233.184.188": "Mountain View, United States",
        "149.154.167.50": "Amsterdam, Netherlands",
        "149.154.175.50": "Amsterdam, Netherlands",
        "185.199.108.133": "Frankfurt, Germany",
        "52.98.243.18": "Dublin, Ireland",
        "82.178.158.25": "Shiraz, Iran",
    }
    with _geo_lock:
        _geo_cache.update(demo_geo)
    with _demo_lock:
        killed = _demo_state["killed"]
    return [dict(c) for c in base if c["pid"] not in killed]


# ---------------- HTTP server ----------------

HTML_PAGE = r"""<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NetMon - Network Monitor</title>
<style>
:root{
  --bg:#0d1117; --panel:#161b22; --panel2:#1c2330; --border:#30363d;
  --text:#e6edf3; --muted:#8b949e; --accent:#3fb950; --danger:#f85149;
  --warn:#d29922; --info:#58a6ff;
}
*{box-sizing:border-box; margin:0; padding:0}
body{background:var(--bg); color:var(--text);
  font-family:Vazirmatn,Tahoma,'Segoe UI',sans-serif; font-size:14px; padding:16px}
a{color:var(--info); text-decoration:none}
header{display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:14px}
header h1{font-size:20px; font-weight:700}
.badge{display:inline-block; padding:3px 10px; border-radius:20px; font-size:12px; border:1px solid var(--border)}
.badge.ok{color:var(--accent); border-color:var(--accent)}
.badge.bad{color:var(--danger); border-color:var(--danger)}
.badge.warn{color:var(--warn); border-color:var(--warn)}
.badge.info{color:var(--info); border-color:var(--info)}
.spacer{flex:1}
.cards{display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-bottom:14px}
.card{background:var(--panel); border:1px solid var(--border); border-radius:10px; padding:12px}
.card .num{font-size:24px; font-weight:700}
.card .lbl{color:var(--muted); font-size:12px; margin-top:2px}
.controls{display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:12px}
input[type=text]{background:var(--panel2); border:1px solid var(--border); color:var(--text);
  border-radius:8px; padding:8px 12px; width:260px; font-family:inherit; font-size:13px}
input[type=text]:focus{outline:1px solid var(--info)}
label.chk{display:flex; align-items:center; gap:5px; color:var(--muted); font-size:13px; cursor:pointer}
button{background:var(--panel2); color:var(--text); border:1px solid var(--border);
  border-radius:8px; padding:8px 14px; cursor:pointer; font-family:inherit; font-size:13px}
button:hover{border-color:var(--info)}
button.primary{background:#1f6feb; border-color:#1f6feb; color:#fff}
button.danger{background:var(--danger); border-color:var(--danger); color:#fff}
button.small{padding:3px 9px; font-size:12px; border-radius:6px}
.panel{background:var(--panel); border:1px solid var(--border); border-radius:10px;
  margin-bottom:14px; overflow:hidden}
.panel h2{font-size:14px; padding:10px 14px; border-bottom:1px solid var(--border); color:var(--muted)}
.scroll{overflow-x:auto; max-height:60vh; overflow-y:auto}
table{width:100%; border-collapse:collapse; font-size:13px; min-width:820px}
th{position:sticky; top:0; background:var(--panel2); color:var(--muted); font-weight:400;
  text-align:right; padding:8px 10px; border-bottom:1px solid var(--border); white-space:nowrap}
td{padding:7px 10px; border-bottom:1px solid #21262d; white-space:nowrap}
tr:hover td{background:#1c2330}
.proc{font-weight:700}
.pid{color:var(--muted); font-size:11px; direction:ltr; display:inline-block}
.mono{direction:ltr; display:inline-block; font-family:Consolas,monospace; font-size:12px}
.st-E{color:var(--accent)} .st-C{color:var(--warn)} .st-T{color:var(--muted)} .st-S{color:var(--info)} .st-F{color:var(--muted)}
.blocked{background:#3d1c1c; color:var(--danger); border-radius:6px; padding:1px 8px; font-size:11px; margin-inline-start:6px}
.tip{color:var(--muted); font-size:12px; padding:10px 14px}
.topbar{display:flex; align-items:center; gap:8px; padding:6px 14px; border-bottom:1px solid #21262d}
.bar{height:8px; border-radius:6px; background:var(--info); min-width:2px}
#toast{position:fixed; bottom:18px; left:18px; z-index:99; display:flex; flex-direction:column; gap:8px}
.toast{background:var(--panel2); border:1px solid var(--border); border-right:3px solid var(--info);
  border-radius:8px; padding:10px 16px; font-size:13px; box-shadow:0 4px 14px rgba(0,0,0,.4)}
.toast.err{border-right-color:var(--danger)} .toast.ok{border-right-color:var(--accent)}
#adminbar{display:none; background:#3d2e00; border:1px solid var(--warn); color:var(--warn);
  border-radius:10px; padding:12px 14px; margin-bottom:12px; font-size:13px; line-height:2}
</style>
</head>
<body>

<header>
  <h1>🛰 NetMon</h1>
  <span class="badge info" id="b-ver">v?</span>
  <span class="badge" id="b-admin">?</span>
  <span class="badge" id="b-demo" style="display:none">حالت نمایشی - داده‌ی نمونه</span>
  <span class="spacer"></span>
  <button class="primary" onclick="loadAll(true)">↻ بروزرسانی</button>
</header>

<div id="adminbar">
  ⚠ برای <b>بلاک کردن</b> و <b>پایان دادن به برنامه‌ها</b> باید برنامه با دسترسی Administrator اجرا شود.
  <button class="danger small" onclick="elevate()">ری‌استارت با دسترسی Administrator</button>
</div>

<div class="cards">
  <div class="card"><div class="num" id="c-conns">0</div><div class="lbl">اتصال فعال</div></div>
  <div class="card"><div class="num" id="c-apps">0</div><div class="lbl">برنامه‌ی متصل</div></div>
  <div class="card"><div class="num" id="c-blocked">0</div><div class="lbl">برنامه‌ی بلاک‌شده</div></div>
  <div class="card"><div class="num" id="c-geo">-</div><div class="lbl">وضعیت تشخیص کشور</div></div>
  <div class="card"><div class="num" id="c-dl" style="color:var(--accent)">-</div><div class="lbl" id="c-dl-lbl">دانلود کل سیستم</div></div>
  <div class="card"><div class="num" id="c-ul" style="color:var(--info)">-</div><div class="lbl" id="c-ul-lbl">آپلود کل سیستم</div></div>
</div>

<div class="controls">
  <input type="text" id="q" placeholder="جستجو: اسم برنامه، آی‌پی، پورت..." oninput="render()">
  <label class="chk"><input type="checkbox" id="auto" checked> بروزرسانی خودکار</label>
  <label class="chk"><input type="checkbox" id="priv"> نمایش اتصال داخلی/لوکال</label>
  <span class="spacer"></span>
  <span style="color:var(--muted);font-size:12px" id="updated"></span>
</div>

<div class="panel">
  <h2>🖥 بیشترین اتصال به تفکیک برنامه</h2>
  <div id="tops" style="padding:8px 14px 12px"></div>
</div>

<div class="panel">
  <h2>📊 مصرف اینترنت هر برنامه — از لحظه‌ی شروع مانیتور</h2>
  <div class="scroll">
  <table>
    <thead><tr>
      <th>برنامه</th><th>⬇ دانلود</th><th>⬆ آپلود</th>
      <th>سرعت دانلود</th><th>سرعت آپلود</th><th>عمل</th>
    </tr></thead>
    <tbody id="trows"></tbody>
  </table>
  </div>
  <div class="tip" id="traffic-tip">شمارش از لحظه‌ی شروع مانیتور و برای اتصال‌های TCP انجام می‌شود.</div>
</div>

<div class="panel">
  <h2>🌐 اتصال‌های فعال — کدام برنامه به کجا وصل است</h2>
  <div class="scroll">
  <table>
    <thead><tr>
      <th>برنامه</th><th>آی‌پی مقصد</th><th>پورت</th><th>سرویس</th>
      <th>وضعیت</th><th>مکان سرور</th><th>مدیریت</th>
    </tr></thead>
    <tbody id="rows"></tbody>
  </table>
  </div>
  <div class="tip">دکمه‌ی «🚫 بلاک» اینترنتِ همان برنامه را با قانون فایروال ویندوز قطع می‌کند (برنامه‌ی باز اجرا می‌ماند ولی اینترنت ندارد) — «✖ پایان» پروسه را می‌بندد.</div>
</div>

<div class="panel">
  <h2>⛔ برنامه‌های بلاک‌شده (قوانین فایروال ساخته‌شده توسط این برنامه)</h2>
  <div class="scroll">
  <table>
    <thead><tr><th>نام قانون</th><th>مسیر برنامه</th><th>وضعیت</th><th>عمل</th></tr></thead>
    <tbody id="rules"></tbody>
  </table>
  </div>
  <div class="tip" id="rules-tip">برنامه‌ای بلاک نشده است.</div>
</div>

<div class="tip">⚠ هرگز <span class="mono">svchost.exe</span> یا <span class="mono">System</span> را بلاک نکنید؛ اینترنت کل ویندوز قطع می‌شود.</div>

<div id="toast"></div>

<script>
let CONNS = [], RULES = [], ADMIN = false, GEO_OK = null, TIMER = null;

const stateCls = s => s.startsWith('ESTABLISHED') ? 'st-E'
  : s.startsWith('CLOSE') ? 'st-C'
  : s.startsWith('TIME') ? 'st-T'
  : s.startsWith('FIN') ? 'st-F' : 'st-S';
const stateFa = s => s.startsWith('ESTABLISHED') ? 'فعال'
  : s.startsWith('CLOSE') ? 'در حال بسته شدن'
  : s.startsWith('TIME') ? 'بسته (موقت)'
  : s.startsWith('FIN') ? 'بسته' : s.startsWith('SYN') ? 'در حال اتصال' : s;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function api(path, body){
  const opt = body ? {method:'POST', headers:{'Content-Type':'application/json'},
                      body: JSON.stringify(body)} : {};
  const r = await fetch(path, opt);
  const j = await r.json().catch(() => ({ok:false, msg:'bad response'}));
  if (!r.ok || j.ok === false) throw new Error(j.msg || ('HTTP ' + r.status));
  return j;
}

function toast(msg, cls){
  const d = document.createElement('div');
  d.className = 'toast ' + (cls || '');
  d.textContent = msg;
  document.getElementById('toast').appendChild(d);
  setTimeout(() => d.remove(), 5000);
}

async function loadStatus(){
  try{
    const s = await api('/api/status');
    document.getElementById('b-ver').textContent = 'v' + s.version;
    ADMIN = s.admin;
    const b = document.getElementById('b-admin');
    b.textContent = s.admin ? '✓ Administrator' : '✗ بدون دسترسی مدیر';
    b.className = 'badge ' + (s.admin ? 'ok' : 'bad');
    document.getElementById('adminbar').style.display = s.admin ? 'none' : 'block';
    document.getElementById('b-demo').style.display = s.demo ? 'inline-block' : 'none';
  }catch(e){ toast('خطا در دریافت وضعیت: ' + e.message, 'err'); }
}

async function loadConns(){
  const priv = document.getElementById('priv').checked ? 1 : 0;
  try{
    const j = await api('/api/connections?priv=' + priv);
    CONNS = j.items || []; GEO_OK = j.geo_ok;
    document.getElementById('c-conns').textContent = CONNS.length;
    document.getElementById('c-apps').textContent =
      new Set(CONNS.filter(c => c.pid > 4).map(c => c.pid)).size;
    const g = document.getElementById('c-geo');
    g.textContent = GEO_OK === null ? '-' : (GEO_OK ? '✓ فعال' : '✗ در دسترس نیست');
    g.style.color = GEO_OK ? 'var(--accent)' : 'var(--danger)';
    document.getElementById('updated').textContent =
      'آخرین بروزرسانی: ' + new Date().toLocaleTimeString('fa-IR');
    render();
  }catch(e){ toast('خطا: ' + e.message, 'err'); }
}

async function loadRules(){
  try{
    const j = await api('/api/rules');
    RULES = j.rules || [];
    document.getElementById('c-blocked').textContent = RULES.length;
    renderRules(); render();
  }catch(e){ /* ignore */ }
}

function blockedPathSet(){
  return new Set(RULES.map(r => (r.program || '').toLowerCase()));
}

function render(){
  const q = document.getElementById('q').value.trim().toLowerCase();
  const blocked = blockedPathSet();
  const view = CONNS.filter(c => !q ||
    (c.name||'').toLowerCase().includes(q) || (c.rip||'').includes(q) ||
    String(c.rport).includes(q) || (c.state||'').toLowerCase().includes(q));
  const rows = view.map(c => {
    const isBlocked = c.path && blocked.has(c.path.toLowerCase());
    return '<tr>' +
      '<td><span class="proc">' + esc(c.name) + '</span> <span class="pid">PID ' + c.pid + '</span>' +
        (isBlocked ? '<span class="blocked">بلاک شده</span>' : '') + '</td>' +
      '<td><span class="mono">' + esc(c.rip) + '</span>' +
        '<div style="color:var(--muted);font-size:10px" title="اتصال محلی">' + esc(c.local || '') + '</div></td>' +
      '<td class="mono">' + esc(c.rport) + '</td>' +
      '<td>' + esc(c.service || '-') + '</td>' +
      '<td class="' + stateCls(c.state) + '">' + stateFa(c.state) + '</td>' +
      '<td>' + esc(c.geo || '...') + '</td>' +
      '<td>' +
        (c.path && c.pid > 4
          ? '<button class="small ' + (isBlocked ? '' : 'danger') + '" onclick="blockApp(' + c.pid + ')">' +
              (isBlocked ? '🔓 آزادسازی' : '🚫 بلاک') + '</button> ' +
            '<button class="small" onclick="killApp(' + c.pid + ')">✖ پایان</button>'
          : '-') +
      '</td></tr>';
  }).join('');
  document.getElementById('rows').innerHTML = rows ||
    '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">' +
    'اتصالی یافت نشد.</td></tr>';
  renderTops(view);
}

function renderTops(view){
  const counts = {};
  view.forEach(c => { if (c.pid > 4) counts[c.name] = (counts[c.name] || 0) + 1; });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = top.length ? top[0][1] : 1;
  document.getElementById('tops').innerHTML = top.map(([name, n]) =>
    '<div class="topbar"><div style="width:130px;overflow:hidden;text-overflow:ellipsis" title="' +
    esc(name) + '">' + esc(name) + '</div>' +
    '<div class="bar" style="width:' + Math.round(n / max * 70) + '%"></div>' +
    '<div style="color:var(--muted)">' + n + '</div></div>').join('') ||
    '<div style="color:var(--muted);padding:4px">-</div>';
}

function renderRules(){
  const t = document.getElementById('rules');
  t.innerHTML = RULES.map(r => {
    const appName = (r.name || '').replace('NetMonGUI-Block-', '');
    return '<tr><td>' + esc(appName) + '</td>' +
      '<td><span class="mono">' + esc(r.program) + '</span></td>' +
      '<td>' + (r.enabled ? 'فعال' : 'غیرفعال') + '</td>' +
      '<td><button class="small danger" onclick="unblock(\'' + esc(appName).replace(/'/g, '') + '\')">حذف بلاک</button></td></tr>';
  }).join('');
  document.getElementById('rules-tip').textContent = RULES.length
    ? 'این برنامه‌ها به اینترنت دسترسی ندارند (قانون خروجی فایروال).'
    : 'برنامه‌ای بلاک نشده است.';
}

function findConn(pid){ return CONNS.find(c => c.pid === pid); }

async function blockApp(pid){
  const c = findConn(pid); if (!c) return;
  if (!confirm('اینترنتِ «' + c.name + '» بلاک شود؟\n' + c.path))
    return;
  try{
    const j = await api('/api/block', {name: c.name, path: c.path});
    toast('✓ ' + c.name + ' بلاک شد', 'ok');
    loadRules(); loadConns();
  }catch(e){ toast('خطا: ' + e.message, 'err'); }
}

async function unblock(name){
  if (!confirm('بلاکِ «' + name + '» برداشته شود؟')) return;
  try{
    await api('/api/unblock', {name: name});
    toast('✓ ' + name + ' آزاد شد', 'ok');
    loadRules(); loadConns();
  }catch(e){ toast('خطا: ' + e.message, 'err'); }
}

async function killApp(pid){
  const c = findConn(pid);
  const nm = c ? c.name : ('PID ' + pid);
  if (!confirm('پروسه‌ی «' + nm + '» (PID ' + pid + ') بسته شود؟')) return;
  try{
    await api('/api/kill', {pid: pid});
    toast('✓ بسته شد', 'ok');
    setTimeout(loadConns, 700);
  }catch(e){ toast('خطا: ' + e.message, 'err'); }
}

const fmtB = b => { b = Number(b) || 0; const u = ['B','KB','MB','GB','TB']; let i = 0;
  while (b >= 1024 && i < u.length - 1){ b /= 1024; i++; }
  return (i ? b.toFixed(1) : Math.round(b)) + ' ' + u[i]; };
const fmtR = b => fmtB(b) + '/s';

async function fetchTraffic(){
  try{
    const j = await api('/api/traffic');
    document.getElementById('c-dl').textContent = fmtR(j.system.dl_rate);
    document.getElementById('c-dl-lbl').textContent = 'دانلود کل — مجموع ' + fmtB(j.system.dl_total);
    document.getElementById('c-ul').textContent = fmtR(j.system.ul_rate);
    document.getElementById('c-ul-lbl').textContent = 'آپلود کل — مجموع ' + fmtB(j.system.ul_total);
    const rows = (j.apps || []).map(a =>
      '<tr><td><span class="proc">' + esc(a.name) + '</span> <span class="pid">PID ' + a.pid + '</span></td>' +
      '<td style="color:var(--accent)"><b>' + fmtB(a.dl) + '</b></td>' +
      '<td style="color:var(--info)">' + fmtB(a.ul) + '</td>' +
      '<td class="mono">' + fmtR(a.dl_rate) + '</td>' +
      '<td class="mono">' + fmtR(a.ul_rate) + '</td>' +
      '<td>' + (a.pid > 4 ? '<button class="small" onclick="killApp(' + a.pid + ')">✖ پایان</button>' : '-') + '</td></tr>'
    ).join('');
    document.getElementById('trows').innerHTML = rows ||
      '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:22px">هنوز ترافیکی ثبت نشده — کمی صبر کنید...</td></tr>';
    const tip = document.getElementById('traffic-tip');
    if (!j.estats_ok){
      tip.style.cssText = 'background:#3d1c1c;border:1px solid var(--danger);color:#ff9d97;border-radius:8px;padding:12px 14px;font-size:13px;line-height:2';
      tip.innerHTML = '⛔ شمارش حجم <b>هر برنامه</b> فعال نیست — کد خطای ویندوز: <b>' + (j.estats_err || '?') + '</b>' +
        (j.estats_err === 5
          ? '<br>یعنی: برنامه بدون دسترسی Administrator اجرا شده. آن را با <b>Start-NetMon.bat</b> اجرا کن (یا پاورشل را Run as administrator باز کن) — پنجره‌ی آبی UAC باید بیاید و Yes بزنی.'
          : '<br>این برنامه را ببند، دوباره با Start-NetMon.bat اجرا کن و اگر باز همین خطا بود، اسکرین‌شات این پیام را بفرست.') +
        '<br><span class="mono">(diag: rows=' + (j.diag ? j.diag.rows : '?') + ', enabled=' + (j.diag ? j.diag.enabled : '?') +
        ', enable_rc=' + (j.diag && j.diag.enable_rc != null ? j.diag.enable_rc : '-') +
        ', read_rc=' + (j.diag && j.diag.read_rc != null ? j.diag.read_rc : '-') + ')</span>' +
        '<br>(سرعت دانلود/آپلود کل سیستم که بالای صفحه است، بدون ادمین هم کار می‌کند.)';
    } else {
      tip.style.cssText = '';
      tip.textContent = 'شمارش از لحظه‌ی شروع مانیتور و برای اتصال‌های TCP انجام می‌شود. برای دیدن حجم‌ها اجازه بده چند ثانیه داده جمع شود — یک دانلود یا ویدیو باز کن تا عدد بیاید.';
    }
  }catch(e){ /* ignore */ }
}

async function elevate(){
  if (!confirm('برنامه با دسترسی Administrator دوباره اجرا شود؟ (پنجره‌ی UAC باز می‌شود)')) return;
  try{ await api('/api/elevate'); }
  catch(e){ toast('خطا: ' + e.message, 'err'); }
}

function loadAll(force){
  loadStatus(); loadConns(); loadRules();
}

loadAll();
fetchTraffic();
TIMER = setInterval(() => {
  if (document.getElementById('auto').checked && !document.hidden) loadConns();
}, 4000);
setInterval(() => { if (!document.hidden) fetchTraffic(); }, 2500);
setInterval(loadRules, 15000);
setInterval(loadStatus, 30000);
</script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    server_version = "NetMonGUI/" + VERSION

    def log_message(self, fmt, *args):
        pass  # keep console quiet

    # ---- helpers ----
    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except Exception:
            n = 0
        if n <= 0:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return {}

    def check_host(self):
        host = (self.headers.get("Host") or "").split(":")[0]
        if getattr(self.server, "bind_host", "127.0.0.1") == "127.0.0.1":
            if host not in ("127.0.0.1", "localhost"):
                self.send_json({"ok": False, "msg": "forbidden host"}, 403)
                return False
        return True

    # ---- routes ----
    def do_GET(self):
        path = self.path.split("?")[0]
        qs = self.path.split("?")[1] if "?" in self.path else ""

        if path in ("/", "/index.html"):
            body = HTML_PAGE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if path == "/favicon.ico":
            self.send_response(204)
            self.end_headers()
            return

        if path == "/api/status":
            self.send_json({
                "ok": True, "version": VERSION, "admin": is_admin(),
                "demo": DEMO, "platform": sys.platform,
                "firewall": IS_WINDOWS, "python": sys.version.split()[0],
            })
            return

        if path == "/api/connections":
            if not self.check_host():
                return
            include_private = "priv=1" in qs
            if DEMO:
                items = demo_connections()
                geo_ok = True
            else:
                items = get_connections(include_private=include_private)
                ips = list({c["rip"] for c in items if not is_private_ip(c["rip"])})
                if ips:
                    threading.Thread(target=geo_lookup, args=(ips,), daemon=True).start()
                    time.sleep(1.2 if any(geo_get(i) == "" for i in ips[:5]) else 0)
                for c in items:
                    c["geo"] = geo_get(c["rip"]) or "..."
                with _geo_lock:
                    geo_ok = any(v and v not in ("?", "") for v in _geo_cache.values()) or not ips
            for c in items:
                if DEMO:
                    c["geo"] = geo_get(c["rip"]) or ""
            self.send_json({"ok": True, "items": items, "geo_ok": geo_ok})
            return

        if path == "/api/traffic":
            with TRAFFIC_M.lock:
                apps = [{"pid": pid, "name": a["name"], "dl": a["dl"], "ul": a["ul"],
                         "dl_rate": round(a["dl_rate"], 1), "ul_rate": round(a["ul_rate"], 1)}
                        for pid, a in TRAFFIC_M.apps.items()]
                system = dict(TRAFFIC_M.system)
                estats_ok = TRAFFIC_M.estats_ok
                estats_err = TRAFFIC_M.estats_err
                diag = dict(TRAFFIC_M.diag)
            apps.sort(key=lambda x: -x["dl"])
            self.send_json({"ok": True, "estats_ok": estats_ok,
                            "estats_err": estats_err, "diag": diag,
                            "apps": apps, "system": system})
            return

        if path == "/api/rules":
            if DEMO:
                with _demo_lock:
                    rules = [dict(r) for r in _demo_state["rules"]]
            else:
                rules = firewall_rules()
            self.send_json({"ok": True, "rules": rules})
            return

        self.send_json({"ok": False, "msg": "not found"}, 404)

    def do_POST(self):
        if not self.check_host():
            return
        path = self.path.split("?")[0]
        body = self.read_body()

        if path == "/api/block":
            name = str(body.get("name") or "").strip()
            path_ = str(body.get("path") or "").strip()
            if not name or not path_:
                self.send_json({"ok": False, "msg": "name and path required"}, 400)
                return
            if DEMO:
                with _demo_lock:
                    _demo_state["rules"].append(
                        {"name": rule_name_for(name), "program": path_, "enabled": True})
                self.send_json({"ok": True})
                return
            if not is_admin():
                self.send_json({"ok": False,
                                "msg": "نیاز به دسترسی Administrator است - دکمه‌ی بالا را بزنید"}, 403)
                return
            ok, msg = firewall_block(path_, name)
            self.send_json({"ok": ok, "msg": msg}, 200 if ok else 500)
            return

        if path == "/api/unblock":
            name = str(body.get("name") or "").strip()
            if not name:
                self.send_json({"ok": False, "msg": "name required"}, 400)
                return
            if DEMO:
                with _demo_lock:
                    _demo_state["rules"] = [r for r in _demo_state["rules"]
                                            if not r["name"].endswith(name)]
                self.send_json({"ok": True})
                return
            if not is_admin():
                self.send_json({"ok": False,
                                "msg": "نیاز به دسترسی Administrator است"}, 403)
                return
            ok, msg = firewall_unblock(name)
            self.send_json({"ok": ok, "msg": msg}, 200 if ok else 500)
            return

        if path == "/api/kill":
            try:
                pid = int(body.get("pid") or 0)
            except Exception:
                pid = 0
            if pid <= 4:
                self.send_json({"ok": False, "msg": "پروسه‌های سیستمی را نمی‌توان بست"}, 400)
                return
            if DEMO:
                with _demo_lock:
                    _demo_state["killed"].append(pid)
                self.send_json({"ok": True})
                return
            if not is_admin():
                self.send_json({"ok": False,
                                "msg": "نیاز به دسترسی Administrator است"}, 403)
                return
            ok, msg = kill_process(pid)
            self.send_json({"ok": ok, "msg": msg}, 200 if ok else 500)
            return

        if path == "/api/elevate":
            if not IS_WINDOWS:
                self.send_json({"ok": False, "msg": "Windows only"}, 400)
                return
            if is_admin():
                self.send_json({"ok": True, "msg": "already admin"})
                return
            ok = relaunch_elevated()
            self.send_json({"ok": ok, "msg": "در حال اجرای مجدد..." if ok else "شکست خورد"},
                           200 if ok else 500)
            if ok:
                threading.Timer(1.5, lambda: os._exit(0)).start()
            return

        self.send_json({"ok": False, "msg": "not found"}, 404)


# ---------------- main ----------------

def pick_port(start):
    import socket
    for p in range(start, start + 10):
        try:
            s = socket.socket()
            s.bind(("127.0.0.1", p))
            s.close()
            return p
        except Exception:
            continue
    return start


def main():
    global DEMO
    ap = argparse.ArgumentParser(description="NetMon GUI - network monitor with browser UI")
    ap.add_argument("--host", default="127.0.0.1", help="bind host (default 127.0.0.1)")
    ap.add_argument("--port", type=int, default=8124, help="port (default 8124)")
    ap.add_argument("--demo", action="store_true", help="demo mode with sample data (no real data)")
    ap.add_argument("--no-browser", action="store_true", help="do not open the browser")
    ap.add_argument("--diag", action="store_true", help="run ESTATS self-test and exit")
    args = ap.parse_args()
    DEMO = args.demo

    if args.diag:
        print("=" * 50)
        print("  NetMon ESTATS self-test")
        print("  admin : %s   platform: %s" % (is_admin(), sys.platform))
        print("=" * 50)
        try:
            rows = TRAFFIC_M._rows()
            print("TCP rows found: %d" % len(rows))
            ok = 0
            for local, remote, pid, row in rows[:15]:
                if pid <= 4:
                    continue
                if TRAFFIC_M._enable((local, remote, pid), row):
                    bi, bo = TRAFFIC_M._read(row)
                    print("  OK  %-22s pid=%-6d in=%d out=%d" % (remote, pid, bi, bo))
                    ok += 1
                    if ok >= 3:
                        break
            if ok == 0:
                print("FAILED - enable_rc=%s read_rc=%s" %
                      (TRAFFIC_M.diag["enable_rc"], TRAFFIC_M.diag["read_rc"]))
            else:
                print("RESULT: per-app traffic counters WORK on this machine.")
        except Exception as e:
            print("ERROR: %r" % e)
        return

    host = args.host
    port = args.port if host != "127.0.0.1" else pick_port(args.port)

    Handler.DEMO = DEMO
    threading.Thread(target=traffic_loop, daemon=True).start()
    httpd = ThreadingHTTPServer((host, port), Handler)
    httpd.bind_host = host
    url = "http://127.0.0.1:%d" % port if host == "127.0.0.1" else "http://%s:%d" % (host, port)

    print("=" * 56)
    print("  NetMon GUI v%s  |  %s mode" % (VERSION, "DEMO" if DEMO else "live"))
    print("  Open in browser:  %s" % url)
    print("  Admin rights:     %s" % ("YES" if is_admin() else "NO (block/kill disabled)"))
    if not DEMO and not IS_WINDOWS:
        print("  NOTE: not running on Windows - connection list is empty.")
    print("  Press Ctrl+C to stop.")
    print("=" * 56)

    if not args.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nbye!")


if __name__ == "__main__":
    main()
