from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from detector import predict
from predict_tfidf_logreg import load_model

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


class PredictRequest(BaseModel):
    text: str = ""


class PredictResponse(BaseModel):
    score: float = Field(ge=0, le=1)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Starting model service")
    load_model()
    logger.info("Model service ready")
    yield


app = FastAPI(title="AI Detector Model Service", lifespan=lifespan)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/predict", response_model=PredictResponse)
def predict_endpoint(request: PredictRequest):
    try:
        score = predict(request.text)
        return PredictResponse(score=score)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
