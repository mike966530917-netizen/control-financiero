# Servidor HTTP Local en PowerShell para Finanzas PWA
param([int]$Port = 8080)

$root = "c:\PROYECTOS\frontend"
if (-not (Test-Path $root)) {
    Write-Error "No se encontró el directorio frontend en $root"
    exit 1
}

# Obtener IP local para acceder desde el celular en la misma red Wi-Fi
$localIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { 
    $_.InterfaceAlias -notmatch 'Loopback|vEthernet|Virtual' -and $_.IPAddress -notmatch '^169\.' 
} | Select-Object -First 1).IPAddress

$prefix = "http://localhost:$Port/"
$prefixAll = "http://*:$Port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "Iniciando en puerto alternativo 8081..."
    $Port = 8081
    $prefix = "http://localhost:$Port/"
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add($prefix)
    $listener.Start()
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "🚀 PWA FINANCIERA EN EJECUCIÓN (SERVIDOR LOCAL ACTIVO)" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "💻 En tu Computadora:" -ForegroundColor Yellow
Write-Host "   -> http://localhost:$Port" -ForegroundColor White
Write-Host ""
if ($localIp) {
    Write-Host "📱 En tu Celular (misma red Wi-Fi):" -ForegroundColor Yellow
    Write-Host "   -> http://${localIp}:$Port" -ForegroundColor White
    Write-Host ""
}
Write-Host "Presiona Ctrl + C en esta ventana para detener el servidor." -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Abrir en el navegador automáticamente
Start-Process "http://localhost:$Port"

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".ico"  = "image/x-icon"
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $urlPath = $request.Url.LocalPath
        if ($urlPath -eq "/" -or $urlPath -eq "") {
            $urlPath = "/index.html"
        }

        $filePath = Join-Path $root ($urlPath.TrimStart('/').Replace('/', '\'))

        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = $mimeTypes[$ext]
            if (-not $mime) { $mime = "application/octet-stream" }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $mime
            $response.ContentLength64 = $bytes.Length
            $response.StatusCode = 200
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 No encontrado: $urlPath")
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }

        $response.Close()
    } catch {
        # Si se cancela el listener
        break
    }
}
