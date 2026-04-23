@echo off
title MultiViewer � Build

echo Installiere Build-Abhaengigkeiten...
call npm install --loglevel=error
if errorlevel 1 ( echo Fehler bei npm install. & pause & exit /b 1 )

echo.
echo Erstelle Windows-EXE...
call npm run build

if errorlevel 1 (
    echo.
    echo Build fehlgeschlagen. Details oben pruefen.
    pause
    exit /b 1
)

echo.
echo Fertig!
echo Die EXE liegt in: ..\builds\MultiViewer-win32-x64\MultiViewer.exe
echo.
echo Tipp: Den ganzen Ordner ..\builds\MultiViewer-win32-x64\ als ZIP packen
echo       und in releases\ ablegen.
echo.
start explorer ..\builds\MultiViewer-win32-x64
pause
