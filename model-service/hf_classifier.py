"""AI-vs-human scoring via Hugging Face Inference API, with TF-IDF fallback."""

from __future__ import annotations

import logging
import os
from typing import Literal

from detector import predict as tfidf_predict

logger = logging.getLogger(__name__)

DEFAULT_HF_MODEL = "Hello-SimpleAI/chatgpt-detector-roberta"

_backend: Literal["hf", "tfidf"] | None = None
_hf_client = None
_hf_model = DEFAULT_HF_MODEL


def _configured_backend() -> str:
    return (os.getenv("DETECTOR_BACKEND") or "auto").strip().lower()


def _ai_score_from_hf_labels(results: list[dict]) -> float:
    """Map text-classification outputs to P(AI)."""
    if not results:
        return 0.0

    by_label = {
        str(item.get("label", "")).strip().lower(): float(item.get("score", 0.0))
        for item in results
    }

    for ai_label in ("fake", "ai", "gpt", "generated", "label_1", "1"):
        if ai_label in by_label:
            return by_label[ai_label]

    for human_label in ("real", "human", "label_0", "0"):
        if human_label in by_label:
            return 1.0 - by_label[human_label]

    # Fall back to the top label heuristic.
    top = max(results, key=lambda item: float(item.get("score", 0.0)))
    label = str(top.get("label", "")).lower()
    score = float(top.get("score", 0.0))
    if any(token in label for token in ("fake", "ai", "gpt", "generated")):
        return score
    if any(token in label for token in ("real", "human")):
        return 1.0 - score
    return score


def init_classifier() -> str:
    """Initialize scoring backend. Returns 'hf' or 'tfidf'."""
    global _backend, _hf_client, _hf_model

    preferred = _configured_backend()
    _hf_model = os.getenv("HF_DETECTOR_MODEL") or DEFAULT_HF_MODEL
    token = os.getenv("HF_TOKEN") or os.getenv("HUGGINGFACE_HUB_TOKEN")

    if preferred == "tfidf":
        _backend = "tfidf"
        logger.info("Detector backend: tfidf (forced)")
        return _backend

    if preferred in {"auto", "hf"} and token:
        try:
            from huggingface_hub import InferenceClient

            _hf_client = InferenceClient(token=token)
            # Warmup / validate with a tiny request is optional; defer to first call.
            _backend = "hf"
            logger.info(
                "Detector backend: Hugging Face Inference (%s)",
                _hf_model,
            )
            return _backend
        except Exception as exc:  # noqa: BLE001
            logger.warning("HF Inference init failed (%s); falling back to tfidf", exc)

    if preferred == "hf" and not token:
        logger.warning("DETECTOR_BACKEND=hf but HF_TOKEN missing; using tfidf")

    _backend = "tfidf"
    logger.info("Detector backend: tfidf")
    return _backend


def get_backend() -> str:
    if _backend is None:
        return init_classifier()
    return _backend


def predict_ai_score(text: str) -> float:
    if not (text or "").strip():
        return 0.0

    backend = get_backend()
    if backend == "hf" and _hf_client is not None:
        try:
            results = _hf_client.text_classification(
                text,
                model=_hf_model,
            )
            # huggingface_hub may return list[dict] or nested structures
            if results and isinstance(results[0], list):
                results = results[0]
            return max(0.0, min(1.0, _ai_score_from_hf_labels(list(results))))
        except Exception as exc:  # noqa: BLE001
            logger.warning("HF scoring failed (%s); using tfidf for this text", exc)

    return float(tfidf_predict(text))
