@echo off
title SIMEM Explorer - Detener

echo.
echo  ============================================
echo   SIMEM Explorer - Deteniendo...
echo  ============================================
echo.

:: Buscar y matar el proceso que usa el puerto 5000
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000"') do (
    set PID=%%a
)

if defined PID (
    echo  Deteniendo proceso en puerto 5000 (PID: %PID%)...
    taskkill /F /PID %PID% >nul 2>nul
    echo  Servidor detenido correctamente.
) else (
    echo  No hay ningun servidor corriendo en el puerto 5000.
)

echo.
pause
