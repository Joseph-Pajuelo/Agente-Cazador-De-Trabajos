"""
Perfil Maestro del Candidato (Joseph Pajuelo Cárdenas).
Fuente: CV verificado y parámetros de búsqueda definidos.
"""

from typing import List, Dict

CANDIDATE_PROFILE: Dict = {
    "name": "Joseph Pajuelo Cárdenas",
    "headline": "Estudiante de 8vo ciclo de Ingeniería de Sistemas e Informática (UTP)",
    "education": {
        "institution": "Universidad Tecnológica del Perú (UTP)",
        "degree": "Ingeniería de Sistemas e Informática",
        "current_cycle": "8vo ciclo",
        "period": "03/2023 - Presente"
    },
    "location_base": {
        "district": "Ate Vitarte",
        "city": "Lima",
        "preferred_districts": [
            "Ate", "Ate Vitarte", "La Molina", "Santiago de Surco", "Surco", 
            "San Isidro", "La Victoria", "San Borja", "Miraflores", "Lince", "Jesús María", "Lima Centro"
        ]
    },
    "preferences": {
        "role_level": "Practicante Pre Profesional",
        "target_areas": [
            "Sistemas", "Informática", "Análisis de Datos", "Business Intelligence (BI)",
            "Inteligencia Artificial", "Desarrollo de Software / Backend", 
            "Finanzas / Banca (TI)", "Operaciones / Gestión TI"
        ],
        "modality_priority": ["Híbrido", "Presencial", "Remoto"],
        "must_be_paid": True
    },
    "technical_skills": {
        "programming_languages": ["Python", "Java 17", "TypeScript", "JavaScript", "SQL"],
        "frameworks_and_tools": ["Spring Boot", "React", "LangGraph", "FastAPI / REST APIs", "Git / GitHub"],
        "databases": ["PostgreSQL", "MongoDB", "SQL Server", "Modelado relacional y NoSQL"],
        "data_and_bi": ["Power BI", "Microsoft Excel Avanzado/Intermedio", "Modelado de KPIs", "ETL"],
        "ai_engineering": ["Prompt Engineering", "Chain-of-Thought", "Agentes Autónomos", "Integración de LLMs"],
        "architecture_and_practices": ["Arquitectura MVC", "Patrones DTO/DAO", "Control de Concurrencia", "Código Limpio"]
    },
    "certifications": [
        "Python (Nivel Intermedio) - Universidad Nacional de Ingeniería (UNI)",
        "Power BI (Nivel Intermedio) - Universidad Nacional de Ingeniería (UNI)",
        "Microsoft Excel (Nivel Intermedio) - Universidad Nacional Mayor de San Marcos (UNMSM)"
    ],
    "work_experience": [
        {
            "company": "Clevtronix",
            "role": "Asistente de Desarrollo IA",
            "period": "04/2025 - 12/2025",
            "highlights": [
                "Implementación de endpoints y consumo de APIs en Python.",
                "Diseño y despliegue de agentes de IA autónomos con LangGraph y Python.",
                "Dashboards interactivos para monitoreo de latencia, tasa de error y llamadas a la API."
            ]
        },
        {
            "company": "Papa John's",
            "role": "Master Trainer (Ascendido desde Team Member)",
            "period": "08/2025 - 07/2026",
            "highlights": [
                "Liderazgo operativo en turnos de alta demanda.",
                "Capacitación y supervisión de nuevos colaboradores.",
                "Gestión de auditorías internas y control de estándares de calidad."
            ]
        }
    ],
    "featured_projects": [
        {
            "name": "Sistema de Gestión Hotelera y Reservas",
            "stack": ["Java", "Spring Boot", "PostgreSQL", "React", "TypeScript", "Git"],
            "highlights": [
                "Esquema relacional normalizado y consultas SQL avanzadas para KPIs de ocupación y facturación.",
                "API REST modular bajo patrones MVC y DTO/DAO.",
                "Transacciones atómicas y control de concurrencia en base de datos para evitar overbooking.",
                "Frontend en React integrado para digitalizar operaciones y reservas."
            ]
        }
    ],
    "languages": {
        "Spanish": "Nativo",
        "English": "Intermedio"
    }
}
