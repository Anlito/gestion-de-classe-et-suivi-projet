@echo off
setlocal
cd /d "%~dp0"
set "PP_PYTHON=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
if exist "%PP_PYTHON%" (
  "%PP_PYTHON%" essayer-suivi-pp.py
) else (
  py -3 essayer-suivi-pp.py
)
if errorlevel 1 pause
endlocal
