"""
US Construction Cost Query Parser – v2
ML model inference + strict validation layer.
No rule-based fallback. Invalid output → error schema.
"""

import logging
import os
from pathlib import Path

from validator import validate  # validation layer

logger = logging.getLogger(__name__)

_tokenizer = None
_model     = None

MODEL_DIR     = Path(__file__).parent / "models" / "cost-parser-v2"
HF_MODEL_REPO = os.environ.get("HF_MODEL_REPO", "kevallad/costpilot-cost-parser-v2")
MAX_INPUT     = 192
MAX_TARGET    = 320
PREFIX        = "Parse US construction query: "


def _load_model():
    global _tokenizer, _model
    if _model is not None:
        return

    from transformers import T5ForConditionalGeneration, T5Tokenizer

    path     = str(MODEL_DIR) if MODEL_DIR.exists() else HF_MODEL_REPO
    hf_token = os.environ.get("HF_TOKEN") or None

    logger.info("Loading model from: %s", path)
    _tokenizer = T5Tokenizer.from_pretrained(path, token=hf_token)
    _model     = T5ForConditionalGeneration.from_pretrained(
        path, tie_word_embeddings=False, token=hf_token
    )
    _model.eval()
    logger.info("Model ready.")


def predict_us(text: str) -> dict:
    """
    Parse a US construction query.
    Returns validated JSON dict – never raises.
    """
    _load_model()

    import torch
    prompt = PREFIX + text.strip()
    enc = _tokenizer(prompt, return_tensors="pt", max_length=MAX_INPUT, truncation=True)

    with torch.no_grad():
        out = _model.generate(
            **enc,
            max_new_tokens=MAX_TARGET,
            max_length=None,
            num_beams=4,
            early_stopping=True,
        )

    raw = _tokenizer.decode(out[0], skip_special_tokens=True).strip()
    logger.debug("Raw model output: %s", raw)

    result = validate(raw)
    result["_raw"] = raw
    return result
