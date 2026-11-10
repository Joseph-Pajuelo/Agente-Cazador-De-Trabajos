@echo off
title Radar de Practicas Preprofesionales - Joseph Pajuelo
cd /d "%~dp0"
echo ====================================================================
echo   Iniciando Radar de Practicas Preprofesionales (http://localhost:8501)
echo ====================================================================
streamlit run app.py --server.port 8501
pause
