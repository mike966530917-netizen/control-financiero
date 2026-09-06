@echo off
title Finanzas Pro PWA - Servidor Python
echo ============================================================
echo   INICIANDO PWA FINANCIERA CON PYTHON
echo ============================================================
echo.
cd /d "%~dp0"
python servidor.py
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo No se pudo ejecutar 'python'. Intentando con 'py'...
    py servidor.py
)
pause
