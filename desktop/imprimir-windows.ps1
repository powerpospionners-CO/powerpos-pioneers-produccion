param(
  [Parameter(Mandatory=$true)][string]$PrinterName,
  [Parameter(Mandatory=$true)][string]$DocumentPath
)
$ErrorActionPreference = 'Stop'
$inicioEnvio = $false
$printerHandle = [IntPtr]::Zero
$documentoAbierto = $false
$paginaAbierta = $false
try {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class PowerPOSRawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
  public class DocInfo {
    [MarshalAs(UnmanagedType.LPWStr)] public string Name = "PowerPOS";
    [MarshalAs(UnmanagedType.LPWStr)] public string OutputFile = null;
    [MarshalAs(UnmanagedType.LPWStr)] public string DataType = "RAW";
  }
  [DllImport("winspool.drv", EntryPoint="OpenPrinterW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", EntryPoint="StartDocPrinterW", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern int StartDocPrinter(IntPtr handle, int level, [In] DocInfo doc);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv", SetLastError=true)] public static extern bool ClosePrinter(IntPtr handle);
}
'@
  $bytes = [System.IO.File]::ReadAllBytes($DocumentPath)
  if ($bytes.Length -eq 0 -or $bytes.Length -gt 10485760) { throw 'Documento no valido' }
  if (-not [PowerPOSRawPrinter]::OpenPrinter($PrinterName, [ref]$printerHandle, [IntPtr]::Zero)) { throw 'No se pudo abrir la impresora de Windows' }
  $doc = New-Object PowerPOSRawPrinter+DocInfo
  if ([PowerPOSRawPrinter]::StartDocPrinter($printerHandle, 1, $doc) -le 0) { throw 'No se pudo crear el trabajo de impresion' }
  $documentoAbierto = $true
  if (-not [PowerPOSRawPrinter]::StartPagePrinter($printerHandle)) { throw 'No se pudo iniciar la pagina' }
  $paginaAbierta = $true
  $written = 0
  $inicioEnvio = $true
  if (-not [PowerPOSRawPrinter]::WritePrinter($printerHandle, $bytes, $bytes.Length, [ref]$written) -or $written -ne $bytes.Length) { throw 'No se confirmo el envio completo. Revisa el papel antes de reimprimir' }
  if (-not [PowerPOSRawPrinter]::EndPagePrinter($printerHandle)) { throw 'No se confirmo el final de la pagina' }
  $paginaAbierta = $false
  if (-not [PowerPOSRawPrinter]::EndDocPrinter($printerHandle)) { throw 'No se confirmo el final del trabajo' }
  $documentoAbierto = $false
  @{ enviado = $true } | ConvertTo-Json -Compress
} catch {
  @{ enviado = $false; antesDeEnviar = (-not $inicioEnvio); motivo = $_.Exception.Message } | ConvertTo-Json -Compress
  exit 1
} finally {
  if ($printerHandle -ne [IntPtr]::Zero) {
    if ($paginaAbierta) { [void][PowerPOSRawPrinter]::EndPagePrinter($printerHandle) }
    if ($documentoAbierto) { [void][PowerPOSRawPrinter]::EndDocPrinter($printerHandle) }
    [void][PowerPOSRawPrinter]::ClosePrinter($printerHandle)
  }
}
