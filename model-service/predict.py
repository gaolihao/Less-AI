"""Predict Human vs AI text using the fine-tuned DistilBERT + LoRA model."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

import torch
import torch.nn.functional as F
from peft import AutoPeftModelForSequenceClassification
from transformers import AutoTokenizer

DEFAULT_MODEL_DIR = (
    Path(os.environ.get("BUGPROJECT_ROOT", ".")).expanduser().resolve()
    / "models"
    / "distilbert_lora_finetuned"
)
MAX_LENGTH = 384  # match LORA_MAX_LENGTH in ai-detector-ml.ipynb
DEFAULT_LABELS = ("AI", "Human")  # sorted order used during training


@dataclass(frozen=True)
class Prediction:
    probability_ai: float
    probability_human: float

    @property
    def label(self) -> str:
        return "AI" if self.probability_ai >= self.probability_human else "Human"


_model = None
_tokenizer = None
_device = None
_label_for_id: dict[int, str] | None = None


def _resolve_model_dir(model_dir: Path | str | None) -> Path:
    path = Path(model_dir or DEFAULT_MODEL_DIR).expanduser().resolve()
    if not path.is_dir():
        raise FileNotFoundError(
            f"Model folder not found: {path}. "
            "Train with ai-detector-ml.ipynb (RUN_DISTIL_LORA=True) first."
        )
    return path


def _label_map_from_config(config) -> dict[int, str]:
    raw = getattr(config, "id2label", None) or {}
    mapping = {int(k): str(v) for k, v in raw.items()}

    if len(mapping) == 2 and all(v.startswith("LABEL_") for v in mapping.values()):
        return {i: DEFAULT_LABELS[i] for i in range(2)}

    normalized: dict[int, str] = {}
    for idx, name in mapping.items():
        upper = name.upper()
        if upper == "AI":
            normalized[idx] = "AI"
        elif upper == "HUMAN":
            normalized[idx] = "Human"
        else:
            normalized[idx] = name
    return normalized or {i: DEFAULT_LABELS[i] for i in range(2)}


def load_model(model_dir: Path | str | None = None) -> None:
    """Load model and tokenizer into memory (called automatically on first predict)."""
    global _model, _tokenizer, _device, _label_for_id

    path = _resolve_model_dir(model_dir)
    _device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    _tokenizer = AutoTokenizer.from_pretrained(path)
    _model = AutoPeftModelForSequenceClassification.from_pretrained(path)
    _model.to(_device)
    _model.eval()
    _label_for_id = _label_map_from_config(_model.config)


def predict_proba(text: str, model_dir: Path | str | None = None) -> Prediction:
    """
    Classify text and return AI / Human probabilities.

    Returns
    -------
    Prediction
        probability_ai: P(AI | text)
        probability_human: P(Human | text)
    """
    global _model, _tokenizer, _device, _label_for_id

    if _model is None or _tokenizer is None:
        load_model(model_dir)

    inputs = _tokenizer(
        str(text),
        truncation=True,
        max_length=MAX_LENGTH,
        return_tensors="pt",
    )
    inputs = {k: v.to(_device) for k, v in inputs.items()}

    with torch.no_grad():
        logits = _model(**inputs).logits
        probs = F.softmax(logits, dim=-1).squeeze(0).cpu().tolist()

    by_label = {_label_for_id[i]: float(probs[i]) for i in range(len(probs))}
    return Prediction(
        probability_ai=by_label.get("AI", 0.0),
        probability_human=by_label.get("Human", 0.0),
    )


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(description="Predict AI vs Human text.")
    parser.add_argument("text", nargs="?", help="Text to classify")
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=None,
        help=f"Path to saved adapter (default: {DEFAULT_MODEL_DIR})",
    )
    args = parser.parse_args()

    text = args.text
    if not text:
        text = input("Enter text to classify: ").strip()
    if not text:
        raise SystemExit("No text provided.")

    result = predict_proba(text, model_dir=args.model_dir)
    print(f"probability_ai:    {result.probability_ai:.4f}")
    print(f"probability_human: {result.probability_human:.4f}")
    print(f"label:             {result.label}")


if __name__ == "__main__":
    main()
