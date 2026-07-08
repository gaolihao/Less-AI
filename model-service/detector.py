from predict import load_model, predict_proba


def predict(text: str) -> float:
    if not text.strip():
        return 0.0

    result = predict_proba(text)
    return result.probability_ai
