param(
  [string]$Root = "."
)

$repoRoot = (Resolve-Path $Root).Path
$faviconPath = Join-Path $repoRoot "img/favicon.png"

if (-not (Test-Path $faviconPath)) {
  throw "favicon not found: $faviconPath"
}

$htmlFiles = Get-ChildItem -Path $repoRoot -Recurse -Filter *.html -File
foreach ($file in $htmlFiles) {
  $raw = Get-Content -Path $file.FullName -Raw

  if ($raw -match 'rel="icon"[^>]*favicon\.png') {
    continue
  }

  $relativeHref = [System.IO.Path]::GetRelativePath($file.DirectoryName, $faviconPath).Replace('\', '/')
  $linkTag = "<link rel=""icon"" type=""image/png"" href=""$relativeHref"" />"

  $updated = $raw
  if ($raw -match '<meta name="viewport"[^>]*>') {
    $updated = [regex]::Replace(
      $raw,
      '(<meta name="viewport"[^>]*>)',
      "`$1`r`n  $linkTag",
      1
    )
  } elseif ($raw -match '<meta charset="[^"]*"[^>]*>') {
    $updated = [regex]::Replace(
      $raw,
      '(<meta charset="[^"]*"[^>]*>)',
      "`$1`r`n  $linkTag",
      1
    )
  } else {
    $updated = [regex]::Replace(
      $raw,
      '(<head>)',
      "`$1`r`n  $linkTag",
      1
    )
  }

  Set-Content -Path $file.FullName -Value $updated -Encoding utf8 -NoNewline
}

Write-Host "favicon tags ensured for $($htmlFiles.Count) HTML file(s)."
