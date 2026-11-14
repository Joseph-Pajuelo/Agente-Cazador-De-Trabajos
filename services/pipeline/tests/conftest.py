import sys
from pathlib import Path

# Agregar raíz de pipeline y raíz del repositorio a sys.path para pytest
pipeline_root = Path(__file__).resolve().parent.parent
repo_root = pipeline_root.parent.parent

for p in (repo_root, pipeline_root):
    p_str = str(p)
    if p_str in sys.path:
        sys.path.remove(p_str)
    sys.path.insert(0, p_str)
