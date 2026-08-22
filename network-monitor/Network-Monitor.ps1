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
    [switch]$Connections,      # list live connections (default action)
    [switch]$Top,              # top processes by connection count
    [switch]$Interfaces,       # per-adapter speed and total traffic
    [switch]$Watch,            # live dashboard (refreshes every $Refresh s)
    [int]$Refresh = 3,         # dashboard refresh interval (seconds)
    [switch]$Geo,              # show destination country (needs internet)
    [switch]$ResolveHosts,     # resolve remote IP to hostname
    [switch]$IncludeLocal,     # also show localhost/private connections
    [string]$Process = '',     # filter: only connections of this process (e.g. chrome)
    [int]$TopN = 15,           # rows in Top view
    [int]$MaxRows = 80         # max rows in connection list
)

$script:geoCache  = @{}   # country cache (avoids hammering ip-api.com)
$script:hostCache = @{}   # hostname cache

# --- elevated? ---
$isAdmin = $false
try {
    $win = [Security.Principal.WindowsIdentity]::GetCurrent()
    $pr  = New-Object Security.Principal.WindowsPrincipal($win)
    $isAdmin = $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
} catch {}

if (-not $isAdmin) {
    Write-Host 'Note: not elevated. Connections of services/other users are hidden.' -ForegroundColor Yellow
    Write-Host 'Run as Administrator to see everything.' -ForegroundColor Yellow
}

# ---------- helpers ----------

function Test-PrivateIP {
    # true if the IP is private/local (loopback, 10.x, 172.16-31, 192.168, ...)
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
    # human readable bytes
    param([double]$bytes)
    if ($bytes -ge 1GB)  { '{0:N2} GB' -f ($bytes / 1GB) }
    elseif ($bytes -ge 1MB) { '{0:N2} MB' -f ($bytes / 1MB) }
    elseif ($bytes -ge 1KB) { '{0:N1} KB' -f ($bytes / 1KB) }
    else { '{0:N0} B' -f $bytes }
}

function Get-ServiceName {
    # guess service from destination port
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
    # reverse DNS with cache
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
    # country/city/ISP of destination IPs via free ip-api.com (no key)
    param([string[]]$ips)
    $public = @($ips | Where-Object { -not (Test-PrivateIP $_) } | Select-Object -Unique)
    if ($public.Count -eq 0) { return }
    $todo = @($public | Where-Object { -not $script:geoCache.ContainsKey($_) })
    if ($todo.Count -eq 0) { return }

    Write-Host ('Looking up country for {0} address(es) ...' -f $todo.Count) -ForegroundColor DarkGray
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
    # collect network connections with owning process name
    $states = @('Established','TimeWait','CloseWait','FinWait1','FinWait2','SynSent','SynReceived')
    $conns = @(Get-NetTCPConnection -ErrorAction SilentlyContinue | Where-Object { $_.State -in $states })

    $procMap = @{}
    Get-Process -ErrorAction SilentlyContinue | ForEach-Object { $procMap[$_.Id] = $_.ProcessName }

    $out = @()
    foreach ($c in $conns) {
        $remote = "$($c.RemoteAddress)"

        # skip local/private unless -IncludeLocal
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
    # per-adapter current speed + cumulative traffic (1-second sample)
    $s1 = @(Get-NetAdapterStatistics -ErrorAction SilentlyContinue)
    if ($s1.Count -eq 0) { Write-Host 'No adapters found (maybe need Administrator).' -ForegroundColor Yellow; return }
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
            Name        = $x.Name
            Description = $x.InterfaceDescription
            'Download'  = (Format-Size $down) + '/s'
            'Upload'    = (Format-Size $up) + '/s'
            'Total DL'  = Format-Size $x.ReceivedBytes
            'Total UL'  = Format-Size $x.SentBytes
        }
    }
}

function Show-TopProcesses {
    param([object[]]$conns)
    $groups = @($conns | Group-Object Process | Sort-Object Count -Descending | Select-Object -First $TopN)
    $rows = foreach ($g in $groups) {
        $servers = @($g.Group | ForEach-Object { $_.RemoteIP } | Select-Object -Unique).Count
        [pscustomobject][ordered]@{
            Process        = $g.Name
            Connections    = $g.Count
            'Remote hosts' = $servers
        }
    }
    $rows | Format-Table -AutoSize
}

function Show-Dashboard {
    Clear-Host
    $time = Get-Date -Format 'HH:mm:ss'
    Write-Host ("===== NETWORK DASHBOARD  ($time) =====") -ForegroundColor Green
    Write-Host 'Press Ctrl+C to exit' -ForegroundColor DarkGray

    Write-Host ''
    Write-Host '-- Adapters --' -ForegroundColor Cyan
    $ifs = @(Get-InterfaceStats)
    if ($ifs) { $ifs | Format-Table -AutoSize }

    Write-Host '-- Top processes (by connection count) --' -ForegroundColor Cyan
    $conns = @(Get-Connections)
    if ($conns.Count -eq 0) {
        Write-Host 'No connections found.' -ForegroundColor Yellow
    } else {
        Show-TopProcesses -conns $conns
        $procs = @($conns | Select-Object -ExpandProperty Process -Unique).Count
        Write-Host ('Total: {0} connections from {1} processes' -f $conns.Count, $procs) -ForegroundColor DarkGray
    }
}

function Show-Connections {
    $conns = @(Get-Connections)
    if ($conns.Count -eq 0) {
        Write-Host 'No external connections found. (Use -IncludeLocal and run as Administrator to see all.)' -ForegroundColor Yellow
        return
    }

    # destination country (optional)
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
            Process   = $c.Process
            PID       = $c.PID
            RemoteIP  = $c.RemoteIP
            Port      = $c.RemotePort
            Service   = $c.Service
            State     = $c.State
            LocalPort = $c.LocalPort
        }
        if ($ResolveHosts) { $item['RemoteHost'] = $remoteHost }
        if ($Geo)          { $item['Country']   = $country }
        [pscustomobject]$item
    }

    $rows = @($rows | Sort-Object Process, RemoteIP | Select-Object -First $MaxRows)
    $rows | Format-Table -AutoSize

    # most frequent remote servers
    Write-Host '-- Most frequent remote servers --' -ForegroundColor Cyan
    $conns | Group-Object RemoteIP | Sort-Object Count -Descending | Select-Object -First 10 |
        ForEach-Object {
            $remoteHost = ''
            if ($ResolveHosts) { $remoteHost = '  (' + (Resolve-HostName -ip $_.Name) + ')' }
            Write-Host ('  {0,4}  {1}{2}' -f $_.Count, $_.Name, $remoteHost) -ForegroundColor White
        }
    Write-Host ''
    Write-Host ('Total: {0} connections from {1} processes' -f $conns.Count, (@($conns | Select-Object -ExpandProperty Process -Unique).Count)) -ForegroundColor DarkGray
}

# ---------- main ----------

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
    Write-Host '-- Network adapters (current speed + total traffic) --' -ForegroundColor Green
    Get-InterfaceStats | Format-Table -AutoSize
    Write-Host ''
    Write-Host 'Download = receive speed, Upload = send speed, Total DL/UL = cumulative since boot.' -ForegroundColor DarkGray
    Write-Host 'Numbers are sampled over 1 second; use -Watch for smoother values.' -ForegroundColor DarkGray
    return
}

if ($Top) {
    Write-Host '-- Top processes (by connection count) --' -ForegroundColor Green
    $conns = @(Get-Connections)
    if ($conns.Count -eq 0) {
        Write-Host 'No connections found.' -ForegroundColor Yellow
    } else {
        Show-TopProcesses -conns $conns
        Write-Host ''
        Write-Host 'Note: more connections usually means downloading/streaming.' -ForegroundColor DarkGray
        Write-Host 'For exact per-app speed use NetLimiter or GlassWire.' -ForegroundColor DarkGray
    }
    return
}

# default: connection list
Write-Host '-- Active connections (which app connects where) --' -ForegroundColor Green
Write-Host 'Columns: RemoteIP = destination server, Port = destination port, Service = guessed service (443 = HTTPS, ...)' -ForegroundColor DarkGray
if ($Process) { Write-Host ('Filter: only processes matching "' + $Process + '"') -ForegroundColor DarkGray }
Show-Connections
