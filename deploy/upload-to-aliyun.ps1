param(
  [string]$HostName = "8.163.113.5",
  [string]$UserName = "root",
  [string]$RemotePath = "/algrism_platform",
  [string]$NginxConfigPath = "/etc/nginx/conf.d/sciencehelper.conf"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$indexPath = Join-Path $projectRoot "index.html"
$nginxPath = Join-Path $PSScriptRoot "nginx-sciencehelper.conf"

if (-not (Test-Path -LiteralPath $indexPath)) { throw "index.html not found: $indexPath" }
if (-not (Test-Path -LiteralPath $nginxPath)) { throw "nginx config not found: $nginxPath" }

$target = "${UserName}@${HostName}"
Write-Host "Uploading ScienceHelper to ${target}:$RemotePath"
& ssh $target "mkdir -p '$RemotePath'"
if ($LASTEXITCODE -ne 0) { throw "Cannot create remote directory. Check SSH credentials." }

& scp $indexPath "${target}:$RemotePath/index.html"
if ($LASTEXITCODE -ne 0) { throw "Upload failed." }
& scp $nginxPath "${target}:/tmp/sciencehelper.conf"
if ($LASTEXITCODE -ne 0) { throw "Nginx config upload failed." }

& ssh $target "if [ -f '$NginxConfigPath' ]; then cp '$NginxConfigPath' '$NginxConfigPath.bak'; fi; install -m 0644 /tmp/sciencehelper.conf '$NginxConfigPath'; (chown -R nginx:nginx '$RemotePath' 2>/dev/null || chown -R www-data:www-data '$RemotePath'); nginx -t && systemctl reload nginx"
if ($LASTEXITCODE -ne 0) { throw "Remote Nginx validation/reload failed. Existing site was not intentionally removed." }

Write-Host "Deployment completed. Verify: http://www.sciencehelper.cn"
