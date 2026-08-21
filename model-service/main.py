from contextlib import asynccontextmanager
import logging
import os

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from detector import predict
from hf_classifier import get_backend, init_classifier, predict_ai_score
from predict_tfidf_logreg import load_model
from sentence_split import split_sentences

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

MAX_SENTENCES = int(os.getenv("MAX_SENTENCES") or "40")


class PredictRequest(BaseModel):
    text: str = ""


class PredictResponse(BaseModel):
    score: float = Field(ge=0, le=1)
    backend: str | None = None


class SentenceScore(BaseModel):
    id: int
    text: str
    start: int
    end: int
    score: float = Field(ge=0, le=1)


class SentencesPredictResponse(BaseModel):
    overallScore: float = Field(ge=0, le=1)
    backend: str
    sentences: list[SentenceScore]


class BatchPredictRequest(BaseModel):
    texts: list[str] = Field(default_factory=list)


class BatchPredictResponse(BaseModel):
    scores: list[float]
    backend: str


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Starting model service")
    load_model()
    backend = init_classifier()
    logger.info("Model service ready (detector=%s)", backend)
    yield


app = FastAPI(title="AI Detector Model Service", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok", "detector": get_backend()}


@app.post("/predict", response_model=PredictResponse)
def predict_endpoint(request: PredictRequest):
    try:
        # Prefer the active sentence detector backend for consistency.
        score = predict_ai_score(request.text)
        return PredictResponse(score=score, backend=get_backend())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/predict/sentences", response_model=SentencesPredictResponse)
def predict_sentences_endpoint(request: PredictRequest):
    try:
        spans = split_sentences(request.text, max_sentences=MAX_SENTENCES)
        sentences: list[SentenceScore] = []
        for index, span in enumerate(spans, start=1):
            score = predict_ai_score(span.text)
            sentences.append(
                SentenceScore(
                    id=index,
                    text=span.text,
                    start=span.start,
                    end=span.end,
                    score=score,
                )
            )

        overall = predict_ai_score(request.text) if request.text.strip() else 0.0
        return SentencesPredictResponse(
            overallScore=overall,
            backend=get_backend(),
            sentences=sentences,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/predict/batch", response_model=BatchPredictResponse)
def predict_batch_endpoint(request: BatchPredictRequest):
    try:
        scores = [predict_ai_score(text) for text in request.texts]
        return BatchPredictResponse(scores=scores, backend=get_backend())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
