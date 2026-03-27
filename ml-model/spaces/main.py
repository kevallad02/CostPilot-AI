"""
CostPilot AI – US Construction ML Inference Server
FastAPI · HuggingFace Spaces · flan-t5-small
"""

import logging
import os
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
import uvicorn

from predictor import predict_us, _load_model

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Warming up US ML model...")
    _load_model()
    logger.info("ML model ready.")
    yield


app = FastAPI(
    title="CostPilot US ML Inference API",
    description="Parses US construction queries into structured JSON (US units)",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ── Schemas ───────────────────────────────────────────────────────────────────
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


class ActionItem(BaseModel):
    action: str
    item: Optional[str]     = None
    quantity: Optional[float] = None
    unit: Optional[str]     = None


class ParseResponse(BaseModel):
    actions: list[ActionItem]
    fallback_used: bool


# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "service": "costpilot-us-inference", "version": "2.0.0"}


@app.post("/parse-input", response_model=ParseResponse)
def parse_input(req: ParseRequest):
    logger.info("Parsing: %s", req.text)
    try:
        result = predict_us(req.text)
    except Exception as e:
        logger.error("Prediction error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Inference failed")

    actions = [
        ActionItem(
            action=a.get("action"),
            item=a.get("item"),
            quantity=a.get("quantity"),
            unit=a.get("unit"),
        )
        for a in result.get("actions", [])
    ]

    return ParseResponse(actions=actions, fallback_used=result.get("_fallback", False))


# ── Entry ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False, workers=1)
