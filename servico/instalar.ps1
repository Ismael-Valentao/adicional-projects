# Instala o arranque automático da app "Distribuição" (corre ao iniciar sessão no Windows)
# Uso:  powershell -ExecutionPolicy Bypass -File instalar.ps1           -> instala e arranca
#       powershell -ExecutionPolicy Bypass -File instalar.ps1 -Remover  -> desinstala
param([switch]$Remover)
$nome = 'Distribuicao Insumos - Servidor'
$pasta = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $pasta 'iniciar-oculto.vbs'
$atalho = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Distribuição.url'

if ($Remover) {
  Stop-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $nome -Confirm:$false -ErrorAction SilentlyContinue
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe' OR Name='node.exe'" | Where-Object { $_.CommandLine -match 'executar\.cmd|distribuicao-insumos.*server\.js|--disable-warning=ExperimentalWarning server\.js' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Remove-Item $atalho -ErrorAction SilentlyContinue
  Write-Output 'Arranque automático removido.'
  return
}

$acao = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbs`"" -WorkingDirectory $pasta
$gatilho = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$defs = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Settings $defs -Description 'Mantém a app de Controlo de Distribuição a correr em http://localhost:3060' -Force | Out-Null
Start-ScheduledTask -TaskName $nome

Set-Content -Path $atalho -Encoding ASCII -Value "[InternetShortcut]`r`nURL=http://localhost:3060/`r`nIconFile=C:\Windows\System32\shell32.dll`r`nIconIndex=13`r`n"
Write-Output "Instalado. Tarefa: '$nome'. Atalho no Ambiente de Trabalho: Distribuição."
