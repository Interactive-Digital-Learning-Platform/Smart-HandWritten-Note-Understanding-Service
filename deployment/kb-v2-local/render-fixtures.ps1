# Render only the synthetic strings in our checked-in test harness.
$ErrorActionPreference = 'Stop'
$notesRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$exportScript = @'
const fs=require('fs'),crypto=require('crypto');
const text=fs.readFileSync(process.argv[1],'utf8');
const literal=text.match(/const samples = ([\s\S]*?);\r?\nconst report/)[1];
const samples=Function('return '+literal)();
console.log(JSON.stringify(samples.flatMap(sample=>sample.pages.map(lines=>({
  name:crypto.createHash('sha256').update(lines.join('\n')).digest('hex').slice(0,12)+'.png',lines
})))));
'@
$pages = (& node -e $exportScript (Join-Path $PSScriptRoot 'verify-upload.cjs')) | ConvertFrom-Json
if ($LASTEXITCODE -ne 0) { throw 'Could not read synthetic fixture text.' }
Add-Type -AssemblyName System.Drawing
$fixtureDir = Join-Path $notesRoot 'tmp/kb-v2-local/fixtures'
New-Item -ItemType Directory -Path $fixtureDir -Force | Out-Null
foreach ($page in $pages) {
    $bitmap = [System.Drawing.Bitmap]::new(1900,1000)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $font = [System.Drawing.Font]::new('Arial',27)
    try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
        for ($index=0; $index -lt $page.lines.Count; $index++) {
            $graphics.DrawString([string]$page.lines[$index],$font,[System.Drawing.Brushes]::Black,55,(65+$index*110))
        }
        $bitmap.Save((Join-Path $fixtureDir $page.name),[System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $font.Dispose(); $graphics.Dispose(); $bitmap.Dispose() }
}
Write-Host "Synthetic PNG fixtures ready in $fixtureDir"
