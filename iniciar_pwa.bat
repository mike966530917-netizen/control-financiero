@echo off
title Finanzas Pro PWA - Servidor Local
echo ============================================================
echo   INICIANDO PWA FINANCIERA (CONTROL DE GASTOS Y TARJETAS)
echo ============================================================
echo.
powershell -ExecutionPolicy Bypass -File "%~dp0servidor_local.ps1"
pause
