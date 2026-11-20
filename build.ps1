param(
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'dist'),
    [string]$WebView2Installer = ''
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (-not (Test-Path (Join-Path $root 'web/node_modules'))) {
    & npm.cmd --prefix (Join-Path $root 'web') ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
}
& npm.cmd --prefix (Join-Path $root 'web') run build
if ($LASTEXITCODE -ne 0) { throw 'UI build failed' }
Compress-Archive -Path (Join-Path $root 'web/dist/*') -DestinationPath (Join-Path $root 'desktop/OfflineWeb.zip') -Force
& dotnet publish (Join-Path $root 'desktop/ParentTree.Desktop.csproj') -c Release -r win-x64 -o $OutputDirectory --nologo
if ($LASTEXITCODE -ne 0) { throw 'Publish failed' }
Copy-Item -LiteralPath (Join-Path $root 'examples/Ивановы.fam') -Destination (Join-Path $OutputDirectory 'Демонстрационное древо.fam') -Force
Copy-Item -LiteralPath (Join-Path $root 'docs/QUICKSTART.txt') -Destination (Join-Path $OutputDirectory 'README.txt') -Force
if (Test-Path (Join-Path $root 'LICENSE')) {
    Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination $OutputDirectory -Force
}
Copy-Item -LiteralPath (Join-Path $root 'THIRD_PARTY_NOTICES.md') -Destination $OutputDirectory -Force
Copy-Item -LiteralPath (Join-Path $root 'licenses') -Destination $OutputDirectory -Recurse -Force
if ($WebView2Installer) {
    $installer = (Resolve-Path -LiteralPath $WebView2Installer).Path
    $signature = Get-AuthenticodeSignature -LiteralPath $installer
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'CN=Microsoft Corporation,') { throw 'A valid Microsoft-signed installer is required' }
    if ((Get-Item $installer).Length -lt 10MB) { throw 'Use the standalone offline installer, not the bootstrapper' }
    Compress-Archive -LiteralPath $installer,(Join-Path $root 'docs/WEBVIEW2.txt') -DestinationPath (Join-Path $OutputDirectory 'WebView2-Win10-x64.zip') -Force
}
Write-Host "Built: $OutputDirectory/ParentTreeDesktop.exe"
