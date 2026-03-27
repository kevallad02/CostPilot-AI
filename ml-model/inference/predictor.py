"""
Inference module for construction cost query parser.
Loads fine-tuned flan-t5-small and returns structured JSON.
Falls back to rule-based parser if model output is invalid JSON.
"""

import json
import re
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# Lazy-loaded globals (loaded once on first call)
_tokenizer = None
_model = None

MODEL_DIR = Path(__file__).parent.parent / "models" / "cost-parser"
FALLBACK_MODEL_NAME = "google/flan-t5-small"  # used if fine-tuned model not found

MAX_INPUT_LENGTH = 128
MAX_TARGET_LENGTH = 128

# ─────────────────────────────── Unit aliases ──────────────────────────────
UNIT_MAP = {
    "cubic meter": "m3",
    "cubic metres": "m3",
    "cubic metre": "m3",
    "m3": "m3",
    "cu m": "m3",
    "cu meter": "m3",
    "kilogram": "kg",
    "kilograms": "kg",
    "kg": "kg",
    "tonne": "tonnes",
    "tonnes": "tonnes",
    "ton": "tonnes",
    "tons": "tonnes",
    "bag": "bags",
    "bags": "bags",
    "square meter": "sq_m",
    "square meters": "sq_m",
    "sq meter": "sq_m",
    "sq m": "sq_m",
    "sq_m": "sq_m",
    "sqm": "sq_m",
    "m2": "sq_m",
    "piece": "pieces",
    "pieces": "pieces",
    "pcs": "pieces",
    "liter": "liters",
    "liters": "liters",
    "litre": "liters",
    "litres": "liters",
    "l": "liters",
}

ITEM_ALIASES = {
    "concretes": "concrete",
    "steels": "steel",
    "bricks": "brick",
    "sands": "sand",
    "gravels": "gravel",
    "cements": "cement",
    "woods": "wood",
    "wood flooring": "wood",
    "tileing": "tiles",
    "tile": "tiles",
    "glasses": "glass",
    "paints": "paint",
}


# ─────────────────────────────── Model loader ──────────────────────────────
def _load_model():
    global _tokenizer, _model
    if _model is not None:
        return

    from transformers import T5ForConditionalGeneration, T5Tokenizer

    model_path = MODEL_DIR if MODEL_DIR.exists() else FALLBACK_MODEL_NAME
    logger.info("Loading model from: %s", model_path)

    _tokenizer = T5Tokenizer.from_pretrained(str(model_path))
    _model = T5ForConditionalGeneration.from_pretrained(
        str(model_path),
        tie_word_embeddings=False,  # suppress tied-weights warning
    )
    _model.eval()
    logger.info("Model loaded successfully.")


# ─────────────────────────────── ML Inference ──────────────────────────────
def _ml_predict(text: str) -> Optional[dict]:
    try:
        _load_model()
        import torch

        prompt = f"Parse construction query: {text}"
        enc = _tokenizer(
            prompt,
            return_tensors="pt",
            max_length=MAX_INPUT_LENGTH,
            truncation=True,
        )
        with torch.no_grad():
            out = _model.generate(
                **enc,
                max_new_tokens=MAX_TARGET_LENGTH,
                max_length=None,       # override generation_config.json (default=20)
                num_beams=4,
                early_stopping=True,
            )
        decoded = _tokenizer.decode(out[0], skip_special_tokens=True).strip()
        logger.debug("ML raw output: %s", decoded)
        return _parse_json_safe(decoded)
    except Exception as e:
        logger.warning("ML inference failed: %s", e)
        return None


# ─────────────────────────────── Rule-based fallback ───────────────────────
def _rule_based_predict(text: str) -> dict:
    """Deterministic regex-based parser as fallback."""
    lower = text.lower().strip()

    # Detect action
    action = _detect_action(lower)

    if action in ("total", "summary"):
        return {"action": action, "item": None, "quantity": None, "unit": None}

    # Extract quantity (first number in string)
    quantity = None
    qty_match = re.search(r"\b(\d+(?:\.\d+)?)\b", lower)
    if qty_match:
        quantity = float(qty_match.group(1))
        if quantity == int(quantity):
            quantity = int(quantity)

    # Extract unit
    unit = _detect_unit(lower)

    # Extract item
    item = _detect_item(lower, unit)

    return {
        "action": action,
        "item": item,
        "quantity": quantity,
        "unit": unit,
    }


def _detect_action(text: str) -> str:
    estimate_keywords = ["estimate", "cost for", "price for", "how much", "what will", "give cost", "price estimate"]
    add_keywords = ["add", "include", "insert"]
    total_keywords = ["total", "how much do i owe", "current total", "show total", "total amount"]
    summary_keywords = ["summary", "breakdown", "show me everything", "added so far", "project summary"]

    for kw in summary_keywords:
        if kw in text:
            return "summary"
    for kw in total_keywords:
        if kw in text:
            return "total"
    for kw in add_keywords:
        if kw in text:
            return "add"
    for kw in estimate_keywords:
        if kw in text:
            return "estimate"
    return "estimate"  # default


def _detect_unit(text: str) -> Optional[str]:
    # Sort by length desc so "cubic meter" matches before "meter"
    for alias in sorted(UNIT_MAP.keys(), key=len, reverse=True):
        if alias in text:
            return UNIT_MAP[alias]
    return None


def _detect_item(text: str, detected_unit: Optional[str]) -> Optional[str]:
    known_items = [
        "concrete", "steel", "brick", "sand", "gravel",
        "cement", "wood", "tiles", "glass", "paint",
    ]
    # Normalize aliases first
    for alias, canonical in ITEM_ALIASES.items():
        text = text.replace(alias, canonical)

    for item in known_items:
        if item in text:
            return item
    return None


# ─────────────────────────────── JSON utils ────────────────────────────────
def _parse_json_safe(text: str) -> Optional[dict]:
    """Try to parse JSON; return None if malformed."""
    try:
        # Some models wrap output in markdown code blocks
        text = re.sub(r"```json\s*|\s*```", "", text).strip()
        parsed = json.loads(text)
        _validate_output(parsed)
        return parsed
    except (json.JSONDecodeError, ValueError) as e:
        logger.debug("JSON parse failed: %s | text: %s", e, text)
        return None


def _validate_output(data: dict) -> None:
    """Raise ValueError if required fields are missing or invalid."""
    valid_actions = {"estimate", "add", "total", "summary"}
    if "action" not in data:
        raise ValueError("Missing 'action' field")
    if data["action"] not in valid_actions:
        raise ValueError(f"Invalid action: {data['action']}")
    if data["action"] in ("estimate", "add"):
        if not data.get("item"):
            raise ValueError("Missing 'item' for estimate/add action")
        if data.get("quantity") is None:
            raise ValueError("Missing 'quantity' for estimate/add action")


# ─────────────────────────────── Public API ────────────────────────────────
def predict(text: str) -> dict:
    """
    Parse a natural language construction query into structured JSON.
    Tries ML model first, falls back to rule-based parser.
    """
    result = _ml_predict(text)
    used_fallback = False

    if result is None:
        logger.info("Using rule-based fallback for: %s", text)
        result = _rule_based_predict(text)
        used_fallback = True

    result["_fallback"] = used_fallback
    return result
