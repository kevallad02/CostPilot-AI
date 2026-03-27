"""
US Construction Cost Query Parser
Converts natural language → strict JSON with US units.
Tries fine-tuned flan-t5 model first; falls back to rule-based parser.
"""

import json
import os
import re
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

_tokenizer = None
_model     = None

MODEL_DIR        = Path(__file__).parent.parent / "models" / "cost-parser-us"
HF_MODEL_REPO    = os.environ.get("HF_MODEL_REPO_US", "")
FALLBACK_MODEL   = "google/flan-t5-small"
MAX_INPUT        = 192
MAX_TARGET       = 256

# ── Unit normalisation ────────────────────────────────────────────────────────
UNIT_MAP: dict[str, str] = {
    # Square feet
    "square feet": "square_feet", "square foot": "square_feet",
    "sq feet": "square_feet", "sq ft": "square_feet", "sq. ft.": "square_feet",
    "sqft": "square_feet", "sft": "square_feet", "ft2": "square_feet", "ft²": "square_feet",
    "square_feet": "square_feet",
    # Cubic yards
    "cubic yards": "cubic_yards", "cubic yard": "cubic_yards",
    "cu yd": "cubic_yards", "cu. yd.": "cubic_yards",
    "cy": "cubic_yards", "cubic_yards": "cubic_yards",
    # Linear feet
    "linear feet": "linear_feet", "linear foot": "linear_feet",
    "lineal feet": "linear_feet", "lineal foot": "linear_feet",
    "lin ft": "linear_feet", "lin. ft.": "linear_feet",
    "lf": "linear_feet", "linear_feet": "linear_feet",
    # Pounds
    "pounds": "pounds", "pound": "pounds", "lbs": "pounds", "lb": "pounds",
    # Tons
    "tons": "tons", "ton": "tons",
    # Gallons
    "gallons": "gallons", "gallon": "gallons", "gal": "gallons",
    # Pieces
    "pieces": "pieces", "piece": "pieces", "pcs": "pieces",
    "units": "pieces", "unit": "pieces", "each": "pieces", "ea": "pieces",
    "sheets": "pieces", "sheet": "pieces",
}

# ── Word → number ─────────────────────────────────────────────────────────────
WORD_NUMBERS: dict[str, int] = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
    "hundred": 100, "thousand": 1000,
}

# ── Known items ───────────────────────────────────────────────────────────────
KNOWN_ITEMS: list[str] = [
    "concrete", "cement", "steel rebar", "rebar", "drywall", "lumber",
    "plywood", "insulation", "roofing shingles", "asphalt", "tiles",
    "paint", "electrical wiring", "wiring", "plumbing pipes", "piping",
    "pipes", "HVAC", "flooring", "gravel", "sand", "structural steel",
]

ITEM_ALIASES: dict[str, str] = {
    "rebar": "steel rebar",
    "wiring": "electrical wiring",
    "piping": "plumbing pipes",
    "pipes": "plumbing pipes",
    "shingles": "roofing shingles",
    "hardwood flooring": "flooring",
    "vinyl flooring": "flooring",
    "ceramic tiles": "tiles",
    "copper piping": "plumbing pipes",
    "2x4 lumber": "lumber",
    "structural steel": "structural steel",
}


# ── Model loader ──────────────────────────────────────────────────────────────
def _load_model():
    global _tokenizer, _model
    if _model is not None:
        return

    from transformers import T5ForConditionalGeneration, T5Tokenizer

    if MODEL_DIR.exists():
        path = str(MODEL_DIR)
    elif HF_MODEL_REPO:
        path = HF_MODEL_REPO
    else:
        path = FALLBACK_MODEL

    logger.info("Loading US model from: %s", path)
    hf_token  = os.environ.get("HF_TOKEN") or None
    _tokenizer = T5Tokenizer.from_pretrained(path, token=hf_token)
    _model     = T5ForConditionalGeneration.from_pretrained(
        path, tie_word_embeddings=False, token=hf_token
    )
    _model.eval()
    logger.info("US model loaded.")


# ── Helpers ───────────────────────────────────────────────────────────────────
def _words_to_number(text: str) -> str:
    """Replace spelled-out numbers with digits."""
    for word, num in sorted(WORD_NUMBERS.items(), key=lambda x: -len(x[0])):
        text = re.sub(rf"\b{word}\b", str(num), text, flags=re.IGNORECASE)
    return text


def _normalise_unit(raw: str) -> Optional[str]:
    """Map raw unit string to canonical US unit."""
    cleaned = raw.strip().lower()
    return UNIT_MAP.get(cleaned)


def _canonical_item(raw: str) -> Optional[str]:
    """Normalise item name via alias map, then exact match."""
    lower = raw.strip().lower()
    for alias, canonical in ITEM_ALIASES.items():
        if alias.lower() in lower:
            return canonical
    for item in KNOWN_ITEMS:
        if item.lower() in lower:
            return item
    return None


def _parse_json_safe(text: str) -> Optional[dict]:
    text = re.sub(r"```json\s*|\s*```", "", text).strip()
    try:
        parsed = json.loads(text)
        if "actions" not in parsed:
            return None
        if not isinstance(parsed["actions"], list):
            return None
        return parsed
    except (json.JSONDecodeError, ValueError):
        return None


def _validate_action(action: dict) -> bool:
    """Ensure an action has required fields."""
    valid_actions = {"add_item", "estimate", "get_summary", "remove_item",
                     "unknown_item", "missing_quantity"}
    if action.get("action") not in valid_actions:
        return False
    if action["action"] in ("add_item", "estimate", "remove_item"):
        if not action.get("item"):
            return False
        if action.get("quantity") is None:
            return False
    return True


# ── ML inference ──────────────────────────────────────────────────────────────
def _ml_predict(text: str) -> Optional[dict]:
    try:
        _load_model()
        import torch

        prompt = f"Parse US construction query: {text}"
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
        logger.debug("ML raw output: %s", raw)
        result = _parse_json_safe(raw)
        if result and all(_validate_action(a) for a in result["actions"]):
            return result
        return None
    except Exception as e:
        logger.warning("ML inference error: %s", e)
        return None


# ── Rule-based fallback ───────────────────────────────────────────────────────
#
# Splits on " and ", ",", " plus " then parses each segment independently.
# Handles the full set of actions and US unit aliases.

_SUMMARY_KW  = ["summary", "total", "grand total", "breakdown", "running total",
                 "spent so far", "list everything", "show me everything", "show all"]
_ESTIMATE_KW = ["estimate", "how much", "what is the cost", "price for",
                 "what will", "what would", "cost of", "price estimate"]
_ADD_KW      = ["add", "include", "put", "order", "install", "i need", "we need"]
_REMOVE_KW   = ["remove", "delete", "take out", "cancel"]


def _detect_action_kw(text: str) -> str:
    lower = text.lower()
    for kw in _SUMMARY_KW:
        if kw in lower:
            return "get_summary"
    for kw in _REMOVE_KW:
        if kw in lower:
            return "remove_item"
    for kw in _ESTIMATE_KW:
        if kw in lower:
            return "estimate"
    for kw in _ADD_KW:
        if kw in lower:
            return "add_item"
    return "add_item"


def _parse_segment(segment: str) -> dict:
    """Parse a single item segment into an action dict."""
    segment = _words_to_number(segment)
    lower   = segment.lower().strip()

    action = _detect_action_kw(lower)
    if action == "get_summary":
        return {"action": "get_summary"}

    # Extract quantity
    qty_match = re.search(r"\b(\d+(?:\.\d+)?)\b", lower)
    quantity  = float(qty_match.group(1)) if qty_match else None
    if quantity is not None and quantity == int(quantity):
        quantity = int(quantity)

    # Extract unit (longest match first)
    unit = None
    for alias in sorted(UNIT_MAP.keys(), key=len, reverse=True):
        if re.search(rf"\b{re.escape(alias)}\b", lower):
            unit = UNIT_MAP[alias]
            break

    # Extract item
    item = None
    for alias in sorted(ITEM_ALIASES.keys(), key=len, reverse=True):
        if alias.lower() in lower:
            item = ITEM_ALIASES[alias]
            break
    if item is None:
        for known in sorted(KNOWN_ITEMS, key=len, reverse=True):
            if known.lower() in lower:
                item = known
                break

    if item is None:
        return {"action": "unknown_item"}
    if quantity is None:
        return {"action": "missing_quantity", "item": item, "unit": unit}

    return {"action": action, "item": item, "quantity": quantity, "unit": unit}


def _rule_based_predict(text: str) -> dict:
    lower = text.lower()
    for kw in _SUMMARY_KW:
        if kw in lower:
            return {"actions": [{"action": "get_summary"}]}

    # Split multi-item queries
    segments = re.split(r"\band\b|,\s*|\bplus\b", text, flags=re.IGNORECASE)
    segments = [s.strip() for s in segments if s.strip()]

    # If only one segment but mentions multiple items, try to detect each
    actions = [_parse_segment(seg) for seg in segments if seg]
    return {"actions": actions}


# ── Public API ────────────────────────────────────────────────────────────────
def predict_us(text: str) -> dict:
    """
    Parse a US construction query into structured JSON.
    Returns: {"actions": [...], "_fallback": bool}
    """
    result = _ml_predict(text)
    fallback = False

    if result is None:
        logger.info("Using rule-based fallback for: %s", text)
        result   = _rule_based_predict(text)
        fallback = True

    result["_fallback"] = fallback
    return result


# ── Sample predictions (run directly) ─────────────────────────────────────────
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    tests = [
        "Add 10 cubic yards of concrete",
        "Estimate 500 square feet of drywall",
        "Add 10 cubic yards concrete and 200 lbs steel rebar",
        "Estimate 1000 sqft flooring and 50 gallons paint",
        "Add fifteen cubic yards of concrete",
        "Add 200 lin ft electrical wiring",
        "How much will 20 tons of asphalt cost?",
        "What is the total cost?",
        "Remove 300 lbs of steel rebar",
        "Add some diamond to the project",
        "Add concrete",
        "Add 15 cy concrete, 800 sqft insulation, and 300 lbs rebar",
    ]
    print("\n" + "="*60)
    print("  US Construction Query Parser – Sample Predictions")
    print("="*60)
    for t in tests:
        result = predict_us(t)
        fb     = result.pop("_fallback")
        print(f"\nINPUT : {t}")
        print(f"OUTPUT: {json.dumps(result, indent=None)}")
        print(f"SOURCE: {'rule-based' if fb else 'ML model'}")
    print("="*60)
