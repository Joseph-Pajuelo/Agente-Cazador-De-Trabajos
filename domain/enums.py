from enum import Enum

class JobSource(str, Enum):
    PRACTICAS_PE = "practicas_pe"
    BUMERAN = "bumeran"
    COMPUTRABAJO = "computrabajo"
    LINKEDIN = "linkedin"
    CVMATCHER = "cvmatcher"

class Modality(str, Enum):
    HIBRIDO = "Híbrido"
    PRESENCIAL = "Presencial"
    REMOTO = "Remoto"
    DESCONOCIDO = "No especificado"

class ModalityPriority:
    """
    Regla de negocio:
    1. Híbrido (100 pts)
    2. Presencial (80 pts)
    3. Remoto (60 pts)
    4. Desconocido (40 pts)
    """
    PRIORITY_WEIGHTS = {
        Modality.HIBRIDO: 1.0,
        Modality.PRESENCIAL: 0.8,
        Modality.REMOTO: 0.6,
        Modality.DESCONOCIDO: 0.4
    }

    @classmethod
    def get_weight(cls, modality: Modality) -> float:
        return cls.PRIORITY_WEIGHTS.get(modality, 0.4)
