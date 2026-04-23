@echo off
title MultiViewer

REM Pruefen ob Node.js installiert ist
node --version >nul 2>&1
if not errorlevel 1 goto :install

echo Node.js nicht gefunden.
echo Installiere Node.js via winget...
winget install --id OpenJS.NodeJS.LTS --source winget --silent --accept-package-agreements --accept-source-agreements

if errorlevel 1 (
    echo.
    echo Automatische Installation fehlgeschlagen.
    echo Bitte Node.js manuell installieren: https://nodejs.org/
    echo Nach der Installation dieses Fenster neu starten.
    pause
    exit /b 1
)

echo Node.js wurde installiert. Bitte run.bat erneut starten.
pause
exit /b 0

:install
echo Installiere Pakete (beim ersten Mal ca. 200MB)...
call npm install --loglevel=error

if errorlevel 1 (
    echo Fehler beim Installieren der Pakete.
    pause
    exit /b 1
)

echo Starte MultiViewer...
call npm start

if errorlevel 1 (
    echo.
    echo Fehler beim Starten. Details oben pruefen.
    pause
)
