import sys
from pathlib import Path

# Agregar raíz del proyecto a sys.path para pytest
project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))
