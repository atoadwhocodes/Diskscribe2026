@echo off
REM Quick setup script for offline translation
REM Run this once to set up Ollama and translation model

echo ========================================
echo Diskscribe2026 - Offline Translation Setup
echo ========================================
echo.

REM Check if Ollama is installed
where ollama >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [1/3] Installing Ollama...
    echo.
    echo Downloading Ollama installer...
    powershell -Command "& {Invoke-WebRequest -Uri 'https://ollama.com/download/OllamaSetup.exe' -OutFile '%TEMP%\OllamaSetup.exe'}"
    
    echo Running installer...
    powershell -Command "& { $sig = Get-AuthenticodeSignature '%TEMP%\OllamaSetup.exe'; if ($sig.Status -ne 'Valid') { Write-Host 'Installer signature validation failed:' $sig.Status; exit 1 } }"
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo Error: The downloaded Ollama installer failed signature verification.
        echo Aborting setup to avoid running an untrusted installer.
        pause
        exit /b 1
    )

    echo.
    echo The Ollama installer was downloaded from the internet and its signature was validated.
    choice /M "Do you want to run the installer now"
    if %ERRORLEVEL% NEQ 1 (
        echo Installer execution cancelled by user.
        exit /b 1
    )

    echo Running installer...
    start /wait "%TEMP%\OllamaSetup.exe"
    
    echo.
    echo Ollama installed! Please restart this script.
    pause
    exit /b 0
) else (
    echo [1/3] Ollama is already installed
)

echo.
echo [2/3] Checking translation model...

REM Check if model exists
ollama list | findstr "gemma2:9b" >nul
if %ERRORLEVEL% NEQ 0 (
    echo Downloading translation model (9GB, 15-30 min)...
    echo This is a one-time download.
    echo.
    ollama pull gemma2:9b
    
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo Error downloading model! Check your internet connection.
        pause
        exit /b 1
    )
) else (
    echo Translation model already downloaded
)

echo.
echo [3/3] Testing translation...
echo Hello > test.txt
ollama run gemma2:9b "Translate to Japanese (one word): Hello" > test_output.txt 2>&1
del test.txt test_output.txt >nul 2>nul

echo.
echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo Translation is ready and will work offline.
echo.
echo To translate your game:
echo   node translate-offline.js
echo.
echo System info:
ollama list
echo.
pause
