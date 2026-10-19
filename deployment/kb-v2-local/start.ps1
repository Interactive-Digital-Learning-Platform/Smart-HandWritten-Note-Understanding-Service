param([switch]$WithWorker)
$ErrorActionPreference = 'Stop'
$notesRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$ingestionRoot = Join-Path (Split-Path $notesRoot) 'PDF-Ingestion-Backend-Service-v2-local'
$python = Join-Path $ingestionRoot '.venv/Scripts/python.exe'
if (!(Test-Path -LiteralPath $python)) { throw 'The isolated v2 Python environment is missing. See README.md.' }
$logRoot = Join-Path $ingestionRoot '.local/logs'
New-Item -ItemType Directory -Force -Path $logRoot | Out-Null
docker compose --env-file "$PSScriptRoot/.env.local" -f "$PSScriptRoot/compose.yaml" up -d
if ($LASTEXITCODE -ne 0) { throw 'Local v2 infrastructure did not start.' }
$env:OMP_NUM_THREADS = '4'
$env:MKL_NUM_THREADS = '4'
$env:TOKENIZERS_PARALLELISM = 'false'
$env:HF_HUB_DISABLE_TELEMETRY = '1'
$apiListening = Get-NetTCPConnection -LocalPort 8011 -State Listen -ErrorAction SilentlyContinue
if (!$apiListening) {
    Start-Process -FilePath $python -WorkingDirectory $ingestionRoot -WindowStyle Hidden `
        -ArgumentList @('-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', '8011') `
        -RedirectStandardOutput "$logRoot/api.out.log" -RedirectStandardError "$logRoot/api.err.log"
}
if ($WithWorker) {
    $existingWorker = Get-CimInstance Win32_Process | Where-Object {
        $_.Name -eq 'python.exe' -and $_.CommandLine -like "*$ingestionRoot*" -and
        $_.CommandLine -like '*celery*worker*'
    }
    if (!$existingWorker) {
        Start-Process -FilePath $python -WorkingDirectory $ingestionRoot -WindowStyle Hidden `
            -ArgumentList @('-m', 'celery', '-A', 'app.workers.celery_app', 'worker', '--loglevel=info', '--pool=solo', '--concurrency=1', '-Q', 'ingestion,webhooks') `
            -RedirectStandardOutput "$logRoot/worker.out.log" -RedirectStandardError "$logRoot/worker.err.log"
    }
}
$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $response = Invoke-WebRequest -Uri 'http://127.0.0.1:8011/openapi.json' -TimeoutSec 2 -UseBasicParsing
        if ($response.StatusCode -eq 200) { $ready = $true; break }
    } catch { Start-Sleep -Seconds 1 }
}
if (!$ready) { throw "Local ingestion API did not become ready. Check $logRoot/api.err.log" }
Write-Host 'Local v2 ingestion API ready: http://127.0.0.1:8011/docs'
Write-Host 'Existing textbooks can be retrieved without the worker. Use -WithWorker before uploading new PDFs.'
