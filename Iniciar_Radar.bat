@echo off
title Radar de Practicas Preprofesionales - Joseph Pajuelo
cd /d "C:\Users\josep\.gemini\antigravity\scratch\job_hunter_agent"
echo ====================================================================
echo   Iniciando Radar de Practicas Preprofesionales (http://localhost:8501)
echo ====================================================================
streamlit run app.py --server.port 8501
pause
