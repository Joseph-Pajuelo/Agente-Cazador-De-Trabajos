"""
Orquestación del flujo de evaluación con LangGraph (StateGraph).

    START
      │
      ▼
  prefilter ──(no es preprofesional / es humo)──────────────────────────► finalize ─► END
      │ (apta)
      ├──(Gemini disponible y circuito cerrado)──► cot_reasoning ──(ok)──► score ──► finalize
      │                                               │ (timeout / error: abre el Circuit Breaker)
      └──(sin LLM)────────────────────────────────────┴────────────────► heuristic_fallback ─► finalize

- prefilter: reglas deterministas (0 tokens) para descartar egresados y ofertas trampa.
- cot_reasoning: Gemini genera primero la cadena de razonamiento y luego las decisiones (Chain-of-Thought).
- score: modalidad, ubicación y ranking final se calculan de forma determinista (no los decide el LLM).
- heuristic_fallback: degradación elegante cuando no hay API key o el Circuit Breaker está abierto.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, Optional, TypedDict, TYPE_CHECKING

from domain.models import JobListing, JobEvaluation, LLMJobAssessment

if TYPE_CHECKING:
    from .matcher import JobMatcherAI

logger = logging.getLogger(__name__)

try:
    from langgraph.graph import StateGraph, START, END
    LANGGRAPH_AVAILABLE = True
except ImportError:  # pragma: no cover - solo si falta la dependencia en el entorno
    LANGGRAPH_AVAILABLE = False


class EvaluationState(TypedDict, total=False):
    listing: JobListing
    profile: Dict[str, Any]
    heuristic: JobEvaluation
    llm_assessment: Optional[LLMJobAssessment]
    evaluation: JobEvaluation
    route: str
    trace: list[str]


def _append_trace(state: EvaluationState, step: str) -> list[str]:
    return [*state.get("trace", []), step]


def build_evaluation_graph(matcher: "JobMatcherAI"):
    """Construye y compila el grafo de evaluación ligado a una instancia de JobMatcherAI."""
    if not LANGGRAPH_AVAILABLE:
        raise ImportError("langgraph no está instalado")

    # ---------------- Nodos ----------------
    def prefilter(state: EvaluationState) -> EvaluationState:
        heuristic = matcher._evaluate_heuristic(state["listing"], state["profile"])
        if not heuristic.is_pre_professional or heuristic.is_unrealistic_or_smoke:
            route = "discard"
        elif matcher.llm_available:
            route = "llm"
        else:
            route = "fallback"
        return {"heuristic": heuristic, "route": route, "trace": _append_trace(state, f"prefilter:{route}")}

    def cot_reasoning(state: EvaluationState) -> EvaluationState:
        try:
            assessment = matcher.assess_with_gemini(state["listing"], state["profile"])
            return {"llm_assessment": assessment, "trace": _append_trace(state, "cot_reasoning:ok")}
        except Exception as exc:  # timeout, cuota (429/503), JSON inválido...
            matcher.open_circuit(type(exc).__name__)
            return {"llm_assessment": None, "trace": _append_trace(state, f"cot_reasoning:{type(exc).__name__}")}

    def score(state: EvaluationState) -> EvaluationState:
        a = state["llm_assessment"]
        evaluation = JobEvaluation(
            reasoning=a.reasoning,
            engine="gemini-cot",
            is_pre_professional=a.is_pre_professional,
            is_unrealistic_or_smoke=a.is_unrealistic_or_smoke,
            technical_match_score=a.technical_match_score,
            matching_skills=a.matching_skills,
            missing_skills=a.missing_skills,
            verdict_summary=a.verdict_summary,
        )
        evaluation = matcher.apply_deterministic_scores(evaluation, state["listing"])
        return {"evaluation": evaluation, "trace": _append_trace(state, "score")}

    def heuristic_fallback(state: EvaluationState) -> EvaluationState:
        return {"evaluation": state["heuristic"], "trace": _append_trace(state, "heuristic_fallback")}

    def finalize(state: EvaluationState) -> EvaluationState:
        evaluation = state.get("evaluation") or state["heuristic"]
        return {"evaluation": evaluation, "trace": _append_trace(state, "finalize")}

    # ---------------- Aristas condicionales ----------------
    def route_after_prefilter(state: EvaluationState) -> str:
        return {"discard": "finalize", "llm": "cot_reasoning"}.get(state["route"], "heuristic_fallback")

    def route_after_cot(state: EvaluationState) -> str:
        return "score" if state.get("llm_assessment") is not None else "heuristic_fallback"

    graph = StateGraph(EvaluationState)
    graph.add_node("prefilter", prefilter)
    graph.add_node("cot_reasoning", cot_reasoning)
    graph.add_node("score", score)
    graph.add_node("heuristic_fallback", heuristic_fallback)
    graph.add_node("finalize", finalize)

    graph.add_edge(START, "prefilter")
    graph.add_conditional_edges(
        "prefilter", route_after_prefilter,
        {"finalize": "finalize", "cot_reasoning": "cot_reasoning", "heuristic_fallback": "heuristic_fallback"},
    )
    graph.add_conditional_edges(
        "cot_reasoning", route_after_cot,
        {"score": "score", "heuristic_fallback": "heuristic_fallback"},
    )
    graph.add_edge("score", "finalize")
    graph.add_edge("heuristic_fallback", "finalize")
    graph.add_edge("finalize", END)
    return graph.compile()


def evaluate_with_graph(matcher: "JobMatcherAI", listing: JobListing, profile: Dict[str, Any]) -> JobEvaluation:
    """Ejecuta el grafo (compilado una sola vez por matcher) y devuelve la evaluación final."""
    if not LANGGRAPH_AVAILABLE:
        # Ruta de seguridad equivalente al grafo si la dependencia no está instalada
        heuristic = matcher._evaluate_heuristic(listing, profile)
        return heuristic

    compiled = getattr(matcher, "_compiled_graph", None)
    if compiled is None:
        compiled = build_evaluation_graph(matcher)
        matcher._compiled_graph = compiled

    result = compiled.invoke({"listing": listing, "profile": profile, "trace": []})
    logger.debug(f"Traza del grafo: {' -> '.join(result.get('trace', []))}")
    return result["evaluation"]
