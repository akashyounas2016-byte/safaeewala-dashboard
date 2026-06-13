# Safaeewala Dashboard Deployment Script
# Usage: .\deploy.ps1

Write-Host "🔨 Building application..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "📤 Deploying to VPS..." -ForegroundColor Cyan
scp -r "dist/" root@187.77.116.14:/root/safaeewala-dashboard/
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Deployment failed!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host "🌐 App is live at: http://187.77.116.14:8080/" -ForegroundColor Green
