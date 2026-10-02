# OCR con cajas: una línea por renglón «texto<TAB>x<TAB>y<TAB>w<TAB>h» en píxeles de la captura completa.
#   powershell -NoProfile -File tools/ocr_win.ps1 captura.png [x y w h]   (recorte opcional, en píxeles)
param([string]$png, [int]$x = 0, [int]$y = 0, [int]$w = 0, [int]$h = 0, [switch]$palabras)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime]
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.RandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime]
function Await($task, $type) {
  $asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' })[0]
  $t = $asTask.MakeGenericMethod($type).Invoke($null, @($task)); $t.Wait(-1) | Out-Null; $t.Result
}
$src = (Resolve-Path $png).Path
if ($w -gt 0) {   # recortar con System.Drawing a un PNG temporal
  Add-Type -AssemblyName System.Drawing
  $bmp = [System.Drawing.Bitmap]::FromFile($src); $crop = $bmp.Clone((New-Object System.Drawing.Rectangle $x, $y, $w, $h), $bmp.PixelFormat)
  $tmp = [System.IO.Path]::Combine([System.IO.Path]::GetTempPath(), "ocr_crop_" + [guid]::NewGuid().ToString() + ".png"); $crop.Save($tmp); $bmp.Dispose(); $crop.Dispose(); $src = $tmp
}
$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($src)) ([Windows.Storage.StorageFile])
$stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
$decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
$bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
$result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
if ($palabras) { foreach ($line in $result.Lines) { foreach ($wd in $line.Words) { $b = $wd.BoundingRect; "{0}`t{1}`t{2}`t{3}`t{4}" -f $wd.Text, [int]($b.X + $x), [int]($b.Y + $y), [int]$b.Width, [int]$b.Height } }; exit }
foreach ($line in $result.Lines) { $ws = $line.Words; $x0 = ($ws | ForEach-Object { $_.BoundingRect.X } | Measure-Object -Minimum).Minimum; $y0 = ($ws | ForEach-Object { $_.BoundingRect.Y } | Measure-Object -Minimum).Minimum; $x1 = ($ws | ForEach-Object { $_.BoundingRect.X + $_.BoundingRect.Width } | Measure-Object -Maximum).Maximum; $y1 = ($ws | ForEach-Object { $_.BoundingRect.Y + $_.BoundingRect.Height } | Measure-Object -Maximum).Maximum; "{0}`t{1}`t{2}`t{3}`t{4}" -f $line.Text, [int]($x0 + $x), [int]($y0 + $y), [int]($x1 - $x0), [int]($y1 - $y0) }
