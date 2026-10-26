# Safaeewala Booking CRM - Containerized Deployment Script
# Usage: .\deploy.ps1

Write-Host "🔨 Building Safaeewala CRM production bundle..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Local build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "📤 Syncing project and Docker files to VPS (/var/www/safaeewala)..." -ForegroundColor Cyan
$sshKey = "$env:USERPROFILE\.ssh\id_rsa"
ssh -i "$sshKey" -o StrictHostKeyChecking=no root@187.77.116.14 "mkdir -p /var/www/safaeewala/data"
scp -i "$sshKey" -o StrictHostKeyChecking=no -r "dist" "Dockerfile" "nginx.conf" "docker-compose.yml" "webhookServer.cjs" "entrypoint.sh" "root@187.77.116.14:/var/www/safaeewala/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ File transfer failed!" -ForegroundColor Red
    exit 1
}

Write-Host "🐳 Building and starting isolated Docker container on VPS..." -ForegroundColor Cyan
ssh -i "$sshKey" -o StrictHostKeyChecking=no root@187.77.116.14 "systemctl stop nginx 2>/dev/null; systemctl disable nginx 2>/dev/null; cd /var/www/safaeewala && docker compose up -d --build && docker ps --filter name=safaeewala-booking-crm"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Container startup failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Safaeewala CRM Docker container is live and isolated!" -ForegroundColor Green
Write-Host "🌐 App URL: http://187.77.116.14:8080/" -ForegroundColor Green
