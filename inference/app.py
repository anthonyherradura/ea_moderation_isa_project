"""Inference service: self-hosted unitary/toxic-bert behind POST /predict.

Run:  uvicorn app:app --port 8000   (from this folder)

MODEL_DIR can point at a local copy of the model files (for the self-hosting
demo); otherwise the model is downloaded from Hugging Face on first start.
"""
import os

from fastapi import FastAPI
from pydantic import BaseModel, Field
from transformers import pipeline

MODEL = os.environ.get("MODEL_DIR", "unitary/toxic-bert")

# Loaded once at startup, not per request. toxic-bert is multi-label, so each
# label gets its own sigmoid score (they do not sum to 1).
classifier = pipeline("text-classification", model=MODEL, top_k=None, function_to_apply="sigmoid")

app = FastAPI(title="toxic-bert inference")


class PredictIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL}


@app.post("/predict")
def predict(body: PredictIn):
    results = classifier([body.text], truncation=True)[0]
    return {"scores": {r["label"]: float(r["score"]) for r in results}}
