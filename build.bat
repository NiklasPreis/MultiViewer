@echo off
title MultiViewer – Build

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
echo Die EXE liegt in: dist\MultiViewer-win32-x64\MultiViewer.exe
echo.
echo Tipp: Den ganzen Ordner dist\MultiViewer-win32-x64\ weitergeben
echo       oder als ZIP packen. Die EXE benoetigt den Ordner.
echo.
start explorer dist\MultiViewer-win32-x64
pause
