$ErrorActionPreference = "Stop"

$ips = @()

try {
    $defaultRoutes = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" |
        Sort-Object RouteMetric, InterfaceMetric

    foreach ($route in $defaultRoutes) {
        $candidateIps = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.ifIndex -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPAddress -and
                $_.IPAddress -notlike "127.*" -and
                $_.IPAddress -notlike "169.254.*"
            } |
            Select-Object -ExpandProperty IPAddress

        foreach ($ip in $candidateIps) {
            if (
                $ip.StartsWith("10.") -or
                $ip.StartsWith("192.168.") -or
                ($ip -match '^172\.(1[6-9]|2\d|3[0-1])\.')
            ) {
                $ips += $ip
            }
        }
    }
} catch {
}

$ips = $ips | Sort-Object -Unique
if ($ips.Count -gt 0) {
    Write-Output ([string]::Join(",", $ips))
}
