from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from detector import predict
from predict import load_model


class PredictRequest(BaseModel):
    text: str = ""


class PredictResponse(BaseModel):
    score: float = Field(ge=0, le=1)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    load_model()
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
