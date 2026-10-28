@echo off
rem Mantem o servidor da app de Distribuicao sempre ligado (reinicia se parar).
cd /d "%~dp0.."
if not exist logs mkdir logs
:loop
echo [%date% %time%] A iniciar servidor >> logs\servidor.log
"C:\Program Files\nodejs\node.exe" --disable-warning=ExperimentalWarning server.js >> logs\servidor.log 2>&1
echo [%date% %time%] Servidor parou (codigo %errorlevel%), a reiniciar em 5 s >> logs\servidor.log
timeout /t 5 /nobreak > nul
goto loop
