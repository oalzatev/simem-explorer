@echo off
title SIMEM Explorer

echo.
echo  ============================================
echo   SIMEM Explorer - Iniciando...
echo  ============================================
echo.

:: Verificar que npm está instalado
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo  ERROR: npm no encontrado. Instala Node.js desde https://nodejs.org
    pause
    exit /b 1
)

:: Instalar dependencias si node_modules no existe
if not exist "node_modules\" (
    echo  [1/3] Instalando dependencias...
    npm install
    if %errorlevel% neq 0 (
        echo  ERROR al instalar dependencias.
        pause
        exit /b 1
    )
) else (
    echo  [1/3] Dependencias OK
)

:: Crear tablas si la base de datos no existe
if not exist "data.db" (
    echo  [2/3] Creando base de datos...
    npx drizzle-kit push
    if %errorlevel% neq 0 (
        echo  ERROR al crear la base de datos.
        pause
        exit /b 1
    )
) else (
    echo  [2/3] Base de datos OK
)

:: Iniciar la aplicación
echo  [3/3] Iniciando servidor...
echo.
echo  ============================================
echo   Abre tu navegador en: http://localhost:5000
echo   Presiona Ctrl+C para detener
echo  ============================================
echo.

npm run dev
