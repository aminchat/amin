# ==========================================================
#  Network-Monitor.ps1  |  Windows network monitor
#  Shows:
#    - which process connects to which server
#    - per-adapter speed and total traffic
#    - top traffic apps
#    - optional: destination country + hostname
#
#  Run:
#    powershell -ExecutionPolicy Bypass -File .\Network-Monitor.ps1
#  Tip: run as Administrator to see ALL connections
#  Requires: Windows 10/11 / Server 2012+ (built-in PowerShell)
# ==========================================================

[CmdletBinding()]
param(
    [switch]$Connections,      # لیست اتصال‌های زنده (عمل پیش‌فرض)
    [switch]$Top,              # پرترافیک‌ترین پروسه‌ها بر اساس تعداد اتصال
    [switch]$Interfaces,       # سرعت و حجم کل هر کارت شبکه
    [switch]$Watch,            # داشبورد زنده (هر $Refresh ثانیه رفرش می‌شود)
    [int]$Refresh = 3,         # فاصله رفرش داشبورد زنده (ثانیه)
    [switch]$Geo,              # کشور مقصد اتصال‌ها (نیاز به اینترنت دارد)
    [switch]$ResolveHosts,     # تبدیل IP مقصد به دامنه (مثلاً cdn.telegram.org)
    [switch]$IncludeLocal,     # نمایش اتصال‌های localhost/لوکال هم
    [string]$Process = '',     # فقط اتصال‌های یک برنامه (مثلاً chrome)
    [int]$TopN = 15,           # تعداد ردیف‌ها در نمای Top
    [int]$MaxRows = 80         # حداکثر ردیف در لیست اتصال‌ها
)

# --- پشتیبانی از حروف فارسی در کنسول ---
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}
$OutputEncoding = [System.Text.Encoding]::UTF8

$script:geoCache  = @{}   # کش کشورها (تا به ip-api فشار نیاید)
$script:hostCache = @{}   # کش دامنه‌ها

# آیا admin هستیم؟
$isAdmin = $false
try {
    $win = [Security.Principal.WindowsIdentity]::GetCurrent()
    $pr  = New-Object Security.Principal.WindowsPrincipal($win)
    $isAdmin = $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch {}

if (-not $isAdmin) {
    Write-Host 'توجه: بدون Administrator بعضی از اتصال‌های سرویس‌ها/برنامه‌های دیگر دیده نمی‌شود.' -ForegroundColor Yellow
}

# ---------- توابع کمکی ----------

function Test-PrivateIP {
    # true اگر IP خصوصی/لوکال باشد (loopback, 10.x, 172.16-31, 192.168, ...)
    param([string]$ip)
    $a = $null
    if (-not [System.Net.IPAddress]::TryParse($ip, [ref]$a)) { return $true }
    if ($a.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetworkV6) {
        if ($a -eq [System.Net.IPAddress]::IPv6Loopback) { return $true }
        if ($a.IsIPv6LinkLocal -or $a.IsIPv6SiteLocal -or $a.IsIPv6Multicast) { return $true }
        $b = $a.GetAddressBytes()
        if (($b[0] -band 0xFE) -eq 0xFC) { return $true }  # fc00::/7
        return $false
    }
    $b = $a.GetAddressBytes()
    $b0 = $b[0]
    if ($b0 -eq 0) { return $true }                                   # 0.0.0.0
    if ($b0 -eq 10) { return $true }                                  # 10.0.0.0/8
    if ($b0 -eq 127) { return $true }                                 # loopback
    if ($b0 -eq 169 -and $b[1] -eq 254) { return $true }              # APIPA
    if ($b0 -eq 172 -and $b[1] -ge 16 -and $b[1] -le 31) { return $true } # 172.16/12
    if ($b0 -eq 192 -and $b[1] -eq 168) { return $true }              # 192.168/16
    if ($b0 -ge 224) { return $true }                                 # multicast
    return $false
}

function Format-Size {
    # تبدیل بایت به واحد خوانا
    param([double]$bytes)
    if ($bytes -ge 1GB)  { '{0:N2} GB' -f ($bytes / 1GB) }
    elseif ($bytes -ge 1MB) { '{0:N2} MB' -f ($bytes / 1MB) }
    elseif ($bytes -ge 1KB) { '{0:N1} KB' -f ($bytes / 1KB) }
    else { '{0:N0} B' -f $bytes }
}

function Get-ServiceName {
    # حدس سرویس بر اساس پورت مقصد
    param([int]$port)
    if ($port -ge 27015 -and $port -le 27050) { return 'Steam' }
    $map = @{
        21='FTP'; 22='SSH'; 25='SMTP'; 53='DNS'; 80='HTTP'; 110='POP3'; 123='NTP'
        143='IMAP'; 443='HTTPS'; 445='SMB'; 465='SMTPS'; 587='SMTP'; 993='IMAPS'
        995='POP3S'; 1935='RTMP'; 3074='Xbox'; 3389='RDP'; 5222='XMPP'; 5223='ApplePush'
        5228='GooglePush'; 5900='VNC'; 8080='HTTP-Alt'; 8443='HTTPS-Alt'; 25565='Minecraft'
    }
    if ($map.ContainsKey($port)) { return $map[$port] }
    return ''
}

function Resolve-HostName {
    # تبدیل IP به دامنه (با کش)
    param([string]$ip)
    if ($script:hostCache.ContainsKey($ip)) { return $script:hostCache[$ip] }
    if (Test-PrivateIP $ip) { $script:hostCache[$ip] = $ip; return $ip }
    try {
        $h = [System.Net.Dns]::GetHostEntry($ip).HostName
        if (-not $h -or $h -eq $ip) { $script:hostCache[$ip] = $ip }
        else { $script:hostCache[$ip] = $h }
    } catch {
        $script:hostCache[$ip] = $ip
    }
    return $script:hostCache[$ip]
}

function Get-GeoInfo {
    # کشور/شهر/ISP آدرس‌های مقصد — با API رایگان ip-api.com (بدون کلید)
    param([string[]]$ips)
    $public = @($ips | Where-Object { -not (Test-PrivateIP $_) } | Select-Object -Unique)
    if ($public.Count -eq 0) { return }
    $todo = @($public | Where-Object { -not $script:geoCache.ContainsKey($_) })
    if ($todo.Count -eq 0) { return }

    Write-Host ('در حال دریافت کشور مقصد برای {0} آدرس ...' -f $todo.Count) -ForegroundColor DarkGray
    for ($i = 0; $i -lt $todo.Count; $i += 100) {
        $last = [Math]::Min($i + 99, $todo.Count - 1)
        $chunk = @($todo[$i..$last])
        $body = @($chunk | ForEach-Object { @{ query = $_ } }) | ConvertTo-Json -Depth 3
        try {
            $resp = @(Invoke-RestMethod -Uri 'http://ip-api.com/batch?fields=status,message,query,country,city,isp' `
                                       -Method Post -Body $body -ContentType 'application/json' -TimeoutSec 10)
            foreach ($r in $resp) {
                if ($r.status -eq 'success' -and $r.query) {
                    $script:geoCache[$r.query] = "$($r.city), $($r.country)"
                } else {
                    $script:geoCache[$r.query] = '?'
                }
            }
        } catch {
            foreach ($ip in $chunk) { $script:geoCache[$ip] = '?' }
        }
    }
}

function Get-Connections {
    # جمع‌آوری اتصال‌های شبکه همراه با نام پروسه
    $states = @('Established','TimeWait','CloseWait','FinWait1','FinWait2','SynSent','SynReceived')
    $conns = @(Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $_.State -in $states })

    $procMap = @{}
    Get-Process -ErrorAction SilentlyContinue | ForEach-Object { $procMap[$_.Id] = $_.ProcessName }

    $out = @()
    foreach ($c in $conns) {
        $remote = "$($c.RemoteAddress)"

        # حذف اتصال‌های لوکال مگر اینکه -IncludeLocal داده شده باشد
        if (-not $IncludeLocal -and (Test-PrivateIP $remote)) { continue }

        $pidId = $c.OwningProcess
        if ($procMap.ContainsKey($pidId)) { $pname = $procMap[$pidId] }
        elseif ($pidId -eq 0) { $pname = 'System' }
        else { $pname = "PID $pidId" }

        if ($Process -and ($pname -notlike "*$Process*")) { continue }

        $out += [pscustomobject][ordered]@{
            Process    = $pname
            PID        = $pidId
            RemoteIP   = $remote
            RemotePort = $c.RemotePort
            LocalPort  = $c.LocalPort
            State      = $c.State
            Service    = Get-ServiceName -port $c.RemotePort
        }
    }
    return $out
}

function Get-InterfaceStats {
    # سرعت و حجم کل هر کارت شبکه (نمونه‌گیری ۱ ثانیه‌ای)
    $s1 = @(Get-NetAdapterStatistics -ErrorAction SilentlyContinue)
    if ($s1.Count -eq 0) { Write-Host 'کارت شبکه‌ای پیدا نشد (احتمالاً باید Administrator باشید).' -ForegroundColor Yellow; return }
    Start-Sleep -Seconds 1
    $s2 = @(Get-NetAdapterStatistics -ErrorAction SilentlyContinue)

    $map1 = @{}
    foreach ($x in $s1) { $map1[$x.Name] = $x }

    foreach ($x in $s2) {
        if (-not $map1.ContainsKey($x.Name)) { continue }
        $a = $map1[$x.Name]
        $down = $x.ReceivedBytes - $a.ReceivedBytes
        $up   = $x.SentBytes - $a.SentBytes
        if ($down -lt 0) { $down = 0 }
        if ($up -lt 0)   { $up = 0 }
        [pscustomobject][ordered]@{
            Name         = $x.Name
            Description  = $x.InterfaceDescription
            '↓ دانلود'   = (Format-Size $down) + '/s'
            '↑ آپلود'    = (Format-Size $up) + '/s'
            '↓ کل'       = Format-Size $x.ReceivedBytes
            '↑ کل'       = Format-Size $x.SentBytes
        }
    }
}

function Show-TopProcesses {
    param([object[]]$conns)
    $groups = @($conns | Group-Object Process | Sort-Object Count -Descending | Select-Object -First $TopN)
    $rows = foreach ($g in $groups) {
        $hosts = @($g.Group | ForEach-Object { $_.RemoteIP } | Select-Object -Unique).Count
        [pscustomobject][ordered]@{
            Process    = $g.Name
            اتصال      = $g.Count
            'سرورهای مقصد' = $hosts
        }
    }
    $rows | Format-Table -AutoSize
}

function Show-Dashboard {
    Clear-Host
    $time = Get-Date -Format 'HH:mm:ss'
    Write-Host ('═══════════ داشبورد شبکه — {0} ═══════════' -f $time) -ForegroundColor Green
    Write-Host 'برای خروج: Ctrl+C' -ForegroundColor DarkGray

    Write-Host '' 
    Write-Host '── کارت‌های شبکه ──' -ForegroundColor Cyan
    $ifs = @(Get-InterfaceStats)
    if ($ifs) { $ifs | Format-Table -AutoSize }

    Write-Host '── پرترافیک‌ترین برنامه‌ها (بر اساس تعداد اتصال) ──' -ForegroundColor Cyan
    $conns = @(Get-Connections)
    if ($conns.Count -eq 0) {
        Write-Host 'اتصالی پیدا نشد.' -ForegroundColor Yellow
    } else {
        Show-TopProcesses -conns $conns
        $procs = @($conns | Select-Object -ExpandProperty Process -Unique).Count
        Write-Host ('جمع: {0} اتصال از {1} برنامه' -f $conns.Count, $procs) -ForegroundColor DarkGray
    }
}

function Show-Connections {
    $conns = @(Get-Connections)
    if ($conns.Count -eq 0) {
        Write-Host 'اتصال خارجی‌ای پیدا نشد. (برای دیدن همه اتصال‌ها از -IncludeLocal و اجرا با Administrator استفاده کنید)' -ForegroundColor Yellow
        return
    }

    # کشور مقصد (اختیاری)
    if ($Geo) {
        $uniqueIps = @($conns | ForEach-Object { $_.RemoteIP } | Select-Object -Unique)
        Get-GeoInfo -ips $uniqueIps
    }

    $rows = foreach ($c in $conns) {
        $remoteHost = ''
        $country = ''
        if ($ResolveHosts) { $remoteHost = Resolve-HostName -ip $c.RemoteIP }
        if ($Geo -and $script:geoCache.ContainsKey($c.RemoteIP)) { $country = $script:geoCache[$c.RemoteIP] }
        $item = [ordered]@{
            Process    = $c.Process
            PID        = $c.PID
            RemoteIP   = $c.RemoteIP
            Port       = $c.RemotePort
            Service    = $c.Service
            State      = $c.State
            LocalPort  = $c.LocalPort
        }
        if ($ResolveHosts) { $item['RemoteHost'] = $remoteHost }
        if ($Geo)          { $item['Country']   = $country }
        [pscustomobject]$item
    }

    $rows = @($rows | Sort-Object Process, RemoteIP | Select-Object -First $MaxRows)
    $rows | Format-Table -AutoSize

    # پرتکرارترین سرورهای مقصد
    Write-Host '── پرتکرارترین سرورهای مقصد ──' -ForegroundColor Cyan
    $conns | Group-Object RemoteIP | Sort-Object Count -Descending | Select-Object -First 10 |
        ForEach-Object {
            $remoteHost = ''
            if ($ResolveHosts) { $remoteHost = '  (' + (Resolve-HostName -ip $_.Name) + ')' }
            Write-Host ('  {0,4}  {1}{2}' -f $_.Count, $_.Name, $remoteHost) -ForegroundColor White
        }
    Write-Host ''
    Write-Host ('جمع: {0} اتصال از {1} برنامه' -f $conns.Count, (@($conns | Select-Object -ExpandProperty Process -Unique).Count)) -ForegroundColor DarkGray
}

# ---------- اجرای اصلی ----------

if ($Watch) {
    try {
        while ($true) {
            Show-Dashboard
            Start-Sleep -Seconds $Refresh
        }
    } catch {
        # Ctrl+C
    }
    return
}

if ($Interfaces) {
    Write-Host '── کارت‌های شبکه (سرعت لحظه‌ای + حجم کل) ──' -ForegroundColor Green
    Get-InterfaceStats | Format-Table -AutoSize
    Write-Host ''
    Write-Host 'معنی ستون‌ها: ↓ دانلود = سرعت دریافت، ↑ آپلود = سرعت ارسال، ↓/↑ کل = حجم تجمعی از زمان روشن بودن سیستم' -ForegroundColor DarkGray
    Write-Host 'نکته: اعداد با یک نمونه‌گیری ۱ ثانیه‌ای محاسبه می‌شوند؛ برای سرعت دقیق‌تر از -Watch استفاده کنید.' -ForegroundColor DarkGray
    return
}

if ($Top) {
    Write-Host '── پرترافیک‌ترین برنامه‌ها (بر اساس تعداد اتصال) ──' -ForegroundColor Green
    $conns = @(Get-Connections)
    if ($conns.Count -eq 0) {
        Write-Host 'اتصالی پیدا نشد.' -ForegroundColor Yellow
    } else {
        Show-TopProcesses -conns $conns
        Write-Host ''
        Write-Host 'نکته: هرچه تعداد اتصال‌های یک برنامه بیشتر باشد احتمال دانلود/استریم بودنش بیشتر است؛' -ForegroundColor DarkGray
        Write-Host 'برای سرعت لحظه‌ای واقعی هر برنامه از ابزارهایی مثل NetLimiter یا GlassWire استفاده کنید.' -ForegroundColor DarkGray
    }
    return
}

# پیش‌فرض: لیست اتصال‌ها
Write-Host '── اتصال‌های شبکه (از اینجا مشخص می‌شود چه برنامه‌ای به کجا وصل است) ──' -ForegroundColor Green
Write-Host 'معنی ستون‌ها: RemoteIP = آدرس سرور مقصد، Port = پورت مقصد، Service = سرویس احتمالی (443 = HTTPS و ...)' -ForegroundColor DarkGray
if ($Process) { Write-Host ('فیلتر: فقط برنامه‌هایی که شامل "' + $Process + '" هستند') -ForegroundColor DarkGray }
Show-Connections
