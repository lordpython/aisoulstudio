$root = "C:\Users\noone\Documents\Projects\aisoulstudio"
$output = "C:\Users\noone\Documents\Projects\aisoulstudio\codebase-export.md"

$exclude = @('node_modules', 'dist', 'build', '.git', '.vscode', '.cursor', '.kiro', '.kilocode', '.kombai', '.trae', '.claude', 'docs', 'plans', 'last-run', 'pnpm-lock.yaml', 'project-export.json', 'codebase-map.html')

$excludeExt = @('.png', '.ico', '.jpg', '.jpeg', '.gif', '.webp', '.wav', '.mp4', '.mp3', '.woff', '.woff2', '.ttf', '.eot', '.bin', '.zip')

"# Codebase Export`n`nGenerated: $(Get-Date)`n" | Out-File -Encoding utf8 $output

Get-ChildItem -Path $root -Recurse -File |
Where-Object {
    $path = $_.FullName
    $ext = $_.Extension.ToLower()
    -not ($exclude | Where-Object { $path -match "\\$_\\" -or $path -match "\\$_$" }) -and
    $ext -notin $excludeExt
} |
ForEach-Object {
    $relativePath = $_.FullName -replace [regex]::Escape($root + "\"), ''
    $ext = $_.Extension.TrimStart('.')
    
    "`n---`n## ``$relativePath```n" | Out-File -Encoding utf8 -Append $output
    "``````$ext" | Out-File -Encoding utf8 -Append $output
    Get-Content $_.FullName -Raw -Encoding utf8 | Out-File -Encoding utf8 -Append $output
    "``````" | Out-File -Encoding utf8 -Append $output
}

Write-Host "Done! Output: $output"