$f = 'c:\Users\merco\OneDrive\Desktop\syn0.0.90\src\game\fisch.ts'
$c = [System.IO.File]::ReadAllText($f)
$lines = $c -split "`n"
$lines[608] = "  return `${inZone ? '🎯 Solid pull!' : '💦 Slipped away.'}\n\n${renderReelBar(session, fish)}`;"
[System.IO.File]::WriteAllText($f, ($lines -join "`n"))
Write-Host "Fixed line 609 (0-indexed 608)"
Write-Host $lines[608]