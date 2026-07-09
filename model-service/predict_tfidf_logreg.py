"""Predict Human vs AI text using TF-IDF + OneVsRest(LogisticRegression)."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.multiclass import OneVsRestClassifier
from sklearn.pipeline import Pipeline

PROJECT_ROOT = Path(os.environ.get("BUGPROJECT_ROOT", ".")).expanduser().resolve()
DEFAULT_MODEL_DIR = PROJECT_ROOT / "models" / "tfidf_ovr_logreg"
DEFAULT_DATASET_CSV = PROJECT_ROOT / "data" / "ai-detector" / "ai_detector_dataset.csv"
DEFAULT_RANDOM_STATE = 42

_pipe = None
_labels: list[str] | None = None


@dataclass(frozen=True)
class Prediction:
    probability_ai: float
    probability_human: float

    @property
    def label(self) -> str:
        return "AI" if self.probability_ai >= self.probability_human else "Human"


def _resolve_model_dir(model_dir: Path | str | None) -> Path:
    return Path(model_dir or DEFAULT_MODEL_DIR).expanduser().resolve()


def _resolve_dataset_csv(dataset_csv: Path | str | None) -> Path:
    if dataset_csv is not None:
        path = Path(dataset_csv).expanduser().resolve()
        if not path.is_file():
            raise FileNotFoundError(f"Dataset CSV not found: {path}")
        return path

    env_path = os.environ.get("DATASET_CSV")
    if env_path and Path(env_path).is_file():
        return Path(env_path).expanduser().resolve()

    if DEFAULT_DATASET_CSV.is_file():
        return DEFAULT_DATASET_CSV

    try:
        import kagglehub
    except ImportError as exc:
        raise FileNotFoundError(
            f"No dataset found at {DEFAULT_DATASET_CSV}. "
            "Install kagglehub, set DATASET_CSV, or copy ai_detector_dataset.csv there."
        ) from exc

    dataset_path = Path(kagglehub.dataset_download("matejkore/ai-detector-dataset"))
    csv_path = dataset_path / "ai_detector_dataset.csv"
    if not csv_path.is_file():
        raise FileNotFoundError(f"Expected CSV missing after download: {csv_path}")
    return csv_path


def _load_training_data(
    dataset_csv: Path | str | None = None,
    sample_size: int | None = None,
    random_state: int = DEFAULT_RANDOM_STATE,
) -> tuple[pd.Series, pd.Series, Path, int]:
    csv_path = _resolve_dataset_csv(dataset_csv)
    df = pd.read_csv(csv_path)
    raw_rows = len(df)

    if sample_size and len(df) > sample_size:
        df, _ = train_test_split(
            df,
            train_size=sample_size,
            stratify=df["label"],
            random_state=random_state,
        )
        df = df.reset_index(drop=True)

    for column in ("text", "label"):
        df[column] = df[column].astype(str).str.strip()

    bad_values = {"nan", "none", "null", "<na>"}
    df = df[df["label"].ne("") & df["text"].ne("")].copy()
    df = df[
        ~df["label"].str.lower().isin(bad_values)
        & ~df["text"].str.lower().isin(bad_values)
    ].copy()
    df = df.drop_duplicates(keep="first").reset_index(drop=True)

    return df["text"].astype(str), df["label"].astype(str), csv_path, raw_rows


def _build_pipeline(max_features: int, min_df: int) -> Pipeline:
    return Pipeline(
        [
            (
                "vec",
                TfidfVectorizer(
                    lowercase=False,
                    token_pattern=r"(?u)\b\w+\b",
                    ngram_range=(1, 2),
                    min_df=min_df,
                    max_features=max_features,
                ),
            ),
            (
                "clf",
                OneVsRestClassifier(
                    LogisticRegression(
                        max_iter=4000,
                        solver="liblinear",
                        class_weight="balanced",
                    )
                ),
            ),
        ]
    )


def train_model(
    model_dir: Path | str | None = None,
    dataset_csv: Path | str | None = None,
    sample_size: int | None = None,
    random_state: int = DEFAULT_RANDOM_STATE,
) -> Path:
    """Train TF-IDF + OneVsRest(LogReg) and save pipeline.joblib + model_meta.json."""
    path = _resolve_model_dir(model_dir)
    path.mkdir(parents=True, exist_ok=True)

    x_text, y, csv_path, raw_rows = _load_training_data(
        dataset_csv=dataset_csv,
        sample_size=sample_size,
        random_state=random_state,
    )

    max_features = 20_000 if sample_size is not None else 200_000
    min_df = 2

    pipe = _build_pipeline(max_features=max_features, min_df=min_df)
    pipe.fit(x_text, y)

    labels = sorted(y.unique().tolist())
    meta = {
        "model_name": "TF-IDF + OneVsRest(LogReg)",
        "labels": labels,
        "dataset_csv": str(csv_path),
        "dataset_rows_raw": raw_rows,
        "training_rows": len(x_text),
        "sample_size": sample_size,
        "vectorizer": {
            "type": "TfidfVectorizer",
            "ngram_range": [1, 2],
            "max_features": max_features,
            "min_df": min_df,
        },
    }

    joblib.dump(pipe, path / "pipeline.joblib")
    (path / "model_meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Dataset: {csv_path} ({raw_rows:,} rows in file)")
    print(f"Trained on {len(x_text):,} rows and saved model to {path}")
    return path


def _ensure_model(model_dir: Path | str | None = None) -> Path:
    path = _resolve_model_dir(model_dir)
    if not (path / "pipeline.joblib").is_file():
        print(f"Model not found at {path / 'pipeline.joblib'}; training a new one...")
        train_model(model_dir=path)
    return path


def load_model(model_dir: Path | str | None = None) -> None:
    """Load the sklearn pipeline into memory (called automatically on first predict)."""
    global _pipe, _labels

    path = _ensure_model(model_dir)
    _pipe = joblib.load(path / "pipeline.joblib")

    meta_path = path / "model_meta.json"
    if meta_path.is_file():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        _labels = [str(lab) for lab in meta.get("labels", ["AI", "Human"])]
    else:
        _labels = ["AI", "Human"]


def predict_proba(text: str, model_dir: Path | str | None = None) -> Prediction:
    """
    Classify text and return AI / Human probabilities.

    Returns
    -------
    Prediction
        probability_ai: P(AI | text)
        probability_human: P(Human | text)
    """
    global _pipe, _labels

    if _pipe is None:
        load_model(model_dir)

    probs = _pipe.predict_proba([str(text)])[0]
    classes = list(getattr(_pipe, "classes_", _labels))
    by_label = {str(cls): float(prob) for cls, prob in zip(classes, probs)}

    return Prediction(
        probability_ai=by_label.get("AI", 0.0),
        probability_human=by_label.get("Human", 0.0),
    )


def main() -> None:
    import argparse

    parser = argparse.ArgumentParser(
        description="Predict AI vs Human text (TF-IDF + OneVsRest LogReg)."
    )
    parser.add_argument("text", nargs="?", help="Text to classify")
    parser.add_argument(
        "--model-dir",
        type=Path,
        default=None,
        help=f"Path to saved pipeline folder (default: {DEFAULT_MODEL_DIR})",
    )
    parser.add_argument(
        "--train",
        action="store_true",
        help="Train (or retrain) the model and exit",
    )
    parser.add_argument(
        "--dataset-csv",
        type=Path,
        default=None,
        help="Training CSV with text,label columns",
    )
    parser.add_argument(
        "--sample-size",
        type=int,
        default=0,
        help="Optional stratified subsample size (default: 0 = train on full CSV)",
    )
    args = parser.parse_args()

    sample_size = None if args.sample_size <= 0 else args.sample_size

    if args.train:
        train_model(
            model_dir=args.model_dir,
            dataset_csv=args.dataset_csv,
            sample_size=sample_size,
        )
        return

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
