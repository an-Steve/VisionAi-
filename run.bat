@echo off
chcp 65001 > nul
title VisionAI Studio - Ollama Web App

echo ============================================================
echo   🚀 Lancement de VisionAI Studio (Ollama + Flask)
echo ============================================================
echo.

REM Verifier si python est installe
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERREUR] Python n'est pas installe ou pas dans le PATH.
    pause
    exit /b
)

REM Verifier si Ollama est installe
ollama --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ATTENTION] Ollama n'est pas detecte dans le PATH.
    echo Assurez-vous qu'Ollama est installe et demarre sur http://localhost:11434.
    echo.
)

REM Ouvrir le navigateur automatiquement
start http://localhost:5000

REM Demarrer le serveur Flask
echo [INFO] Demarrage du serveur Flask sur http://localhost:5000...
echo Appuyez sur Ctrl+C pour arreter le serveur.
echo.
python app.py

pause
