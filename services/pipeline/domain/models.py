import hashlib
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator
from .enums import JobSource, Modality

class JobListing(BaseModel):
    id: Optional[str] = None
    source: JobSource
    title: str = Field(..., min_length=2, description="Título del puesto")
    company: str = Field(default="Confidencial / No especificado", description="Empresa ofertante")
    location: str = Field(default="Lima, Perú", description="Ubicación o distrito")
    modality: Modality = Field(default=Modality.DESCONOCIDO)
    url: str = Field(..., description="Enlace directo a la oferta")
    raw_description: str = Field(..., description="Texto completo de la vacante")
    salary: Optional[str] = Field(default=None, description="Remuneración si está disponible")
    published_at: Optional[str] = Field(default=None, description="Fecha de publicación")
    company_logo_url: Optional[str] = Field(default=None, description="URL oficial del logo de la empresa ofertante")
    deduplication_hash: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def compute_hash(self) -> str:
        """
        Genera un hash SHA-256 único basado en la empresa y el título normalizado.
        Evita duplicados cruzados entre diferentes plataformas.
        """
        norm_company = "".join(self.company.lower().split())
        norm_title = "".join(self.title.lower().split())
        key = f"{norm_company}:{norm_title}"
        self.deduplication_hash = hashlib.sha256(key.encode("utf-8")).hexdigest()
        return self.deduplication_hash

    @field_validator("title", "company", mode="before")
    @classmethod
    def clean_text(cls, v: str) -> str:
        if isinstance(v, str):
            return " ".join(v.split()).strip()
        return v

class ReasoningChain(BaseModel):
    """
    Cadena de razonamiento (Chain-of-Thought) explícita y auditable.
    Se genera ANTES de los veredictos numéricos para que el puntaje sea consecuencia del análisis.
    """
    academic_eligibility: str = Field(
        ...,
        description="Paso 1: ¿Qué nivel académico exige la oferta (ciclo, egresado, bachiller)? ¿Encaja con un estudiante de 8vo ciclo?",
    )
    experience_requirements: str = Field(
        ...,
        description="Paso 2: ¿Cuánta experiencia formal pide? ¿Es realista para un practicante o es una oferta trampa?",
    )
    tech_stack_overlap: str = Field(
        ...,
        description="Paso 3: Tecnologías y conocimientos pedidos que el candidato SÍ domina, citando su experiencia o proyectos.",
    )
    gaps_and_risks: str = Field(
        ...,
        description="Paso 4: Requisitos que el candidato NO cubre y qué tan críticos son para el puesto.",
    )
    score_rationale: str = Field(
        ...,
        description="Paso 5: Conclusión que justifica el puntaje técnico a partir de los pasos anteriores.",
    )


class LLMJobAssessment(BaseModel):
    """
    Esquema de salida estructurada que se pide a Gemini.
    El orden de los campos es deliberado: primero `reasoning` (CoT), después las decisiones.
    Modalidad, ubicación y ranking final NO los decide el LLM: se calculan de forma determinista.
    """
    reasoning: ReasoningChain
    is_pre_professional: bool = Field(
        ..., description="True solo si la oferta es apta para un estudiante universitario activo (no egresado)."
    )
    is_unrealistic_or_smoke: bool = Field(
        ..., description="True si es oferta trampa: sin remuneración, o exige experiencia/conocimientos de nivel senior."
    )
    technical_match_score: float = Field(
        ..., ge=0.0, le=1.0, description="Afinidad técnica 0.0-1.0, coherente con `reasoning.score_rationale`."
    )
    matching_skills: List[str] = Field(default_factory=list, description="Habilidades del candidato que la oferta pide.")
    missing_skills: List[str] = Field(default_factory=list, description="Requisitos que el candidato no menciona.")
    verdict_summary: str = Field(..., description="Síntesis de 2 a 3 líneas: conviene o no postular y por qué.")


class JobEvaluation(BaseModel):
    reasoning: Optional[ReasoningChain] = Field(
        default=None,
        description="Cadena de razonamiento paso a paso que justifica la evaluación.",
    )
    engine: str = Field(default="heuristic", description="Motor que produjo la evaluación: 'gemini-cot' o 'heuristic'.")
    is_pre_professional: bool = Field(
        ..., 
        description="True si es una práctica preprofesional válida para estudiante universitario, False si pide experiencia de titulado o senior."
    )
    is_unrealistic_or_smoke: bool = Field(
        ...,
        description="True si es oferta trampa/humo (ej. pide 2+ años de experiencia o no remunera legalmente)."
    )
    technical_match_score: float = Field(
        ..., 
        ge=0.0, 
        le=1.0, 
        description="Afinidad técnica con el perfil del estudiante (0.0 a 1.0)."
    )
    modality_score: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Puntuación por modalidad (Híbrido > Presencial > Remoto)."
    )
    location_score: float = Field(
        default=0.0,
        ge=0.0,
        le=1.0,
        description="Puntuación por cercanía a Ate / Lima Centro-Este (1.0 para Lima Centro/Este, 0.7 otros Lima, 0.5 remoto)."
    )
    final_ranking_score: float = Field(
        default=0.0,
        ge=0.0,
        le=100.0,
        description="Puntuación final ponderada de 0 a 100."
    )
    matching_skills: List[str] = Field(
        default_factory=list, 
        description="Habilidades que el candidato sí cumple para esta vacante."
    )
    missing_skills: List[str] = Field(
        default_factory=list, 
        description="Requisitos deseables o técnicos que el candidato no menciona en su CV."
    )
    verdict_summary: str = Field(
        ..., 
        description="Síntesis de 2 a 3 líneas explicando por qué conviene o no postular."
    )
    pitch_recommendation: str = Field(
        default="",
        description="(Obsoleto) Se mantiene vacío por compatibilidad con la columna existente en la base de datos.",
    )
