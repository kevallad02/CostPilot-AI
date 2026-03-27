"""
FastAPI ML inference server.
Exposes POST /parse-input → structured JSON for construction queries.
"""

import logging
import os
import sys
from pathlib import Path
from typing import Optional

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
import uvicorn

# Allow importing predictor from sibling directory
sys.path.insert(0, str(Path(__file__).parent.parent))
from inference.predictor import predict, _load_model


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Warm up: load model at startup so the first request isn't slow
    logger.info("Warming up ML model...")
    _load_model()
    logger.info("ML model ready.")
    yield

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="CostPilot ML Inference API",
    description="Parses natural language construction queries into structured JSON",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ─────────────────────────────── Schemas ───────────────────────────────────
class ParseRequest(BaseModel):
    text: str

    @field_validator("text")
    @classmethod
    def text_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("text must not be empty")
        if len(v) > 500:
            raise ValueError("text exceeds 500 character limit")
        return v


class ParseResponse(BaseModel):
    action: str
    item: Optional[str]
    quantity: Optional[float]
    unit: Optional[str]
    fallback_used: bool


# ─────────────────────────────── Routes ────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "service": "ml-inference"}


@app.post("/parse-input", response_model=ParseResponse)
def parse_input(req: ParseRequest):
    logger.info("Parsing: %s", req.text)
    try:
        result = predict(req.text)
    except Exception as e:
        logger.error("Prediction error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Inference failed")

    return ParseResponse(
        action=result.get("action", "estimate"),
        item=result.get("item"),
        quantity=result.get("quantity"),
        unit=result.get("unit"),
        fallback_used=result.get("_fallback", False),
    )


# ─────────────────────────────── Entry ─────────────────────────────────────
if __name__ == "__main__":
    # HF Spaces requires port 7860; local dev uses 8001
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False, workers=1)
