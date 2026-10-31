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

class JobEvaluation(BaseModel):
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
        ..., 
        description="Un elevator pitch personalizado de 1 párrafo para postular a esta vacante resaltando su experiencia relevante."
    )
