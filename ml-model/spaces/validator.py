"""
Validation layer for US construction JSON output.
Runs AFTER model generation to enforce strict schema compliance.
No rule-based parsing – pure validation + normalisation.
"""

import json
import re
from typing import Optional

# ── Canonical units ───────────────────────────────────────────────────────────
VALID_UNITS = {"cubic_yards", "square_feet", "linear_feet", "pounds", "tons", "gallons", "units"}

UNIT_NORM: dict[str, str] = {
    # square_feet
    "square feet": "square_feet", "square foot": "square_feet",
    "sq feet": "square_feet", "sq ft": "square_feet", "sq. ft.": "square_feet",
    "sqft": "square_feet", "sft": "square_feet", "ft2": "square_feet",
    "ft²": "square_feet", "sf": "square_feet", "square_feet": "square_feet",
    # cubic_yards
    "cubic yards": "cubic_yards", "cubic yard": "cubic_yards",
    "cu yd": "cubic_yards", "cu. yd.": "cubic_yards",
    "cy": "cubic_yards", "cubic_yards": "cubic_yards",
    # linear_feet
    "linear feet": "linear_feet", "linear foot": "linear_feet",
    "lineal feet": "linear_feet", "lineal foot": "linear_feet",
    "lin ft": "linear_feet", "lin. ft.": "linear_feet",
    "lf": "linear_feet", "linear_feet": "linear_feet",
    # pounds
    "pounds": "pounds", "pound": "pounds", "lbs": "pounds", "lb": "pounds",
    # tons
    "tons": "tons", "ton": "tons",
    # gallons
    "gallons": "gallons", "gallon": "gallons", "gal": "gallons",
    # units / pieces
    "units": "units", "unit": "units", "pieces": "units", "piece": "units",
    "pcs": "units", "each": "units", "ea": "units", "sheets": "units",
}

# ── Word → number ─────────────────────────────────────────────────────────────
_ONES = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19,
    "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
}
_MULTS = {"hundred": 100, "thousand": 1000}


def words_to_number(text: str) -> Optional[float]:
    """
    Convert English number words to a float.
    Handles: "ten" → 10, "five hundred" → 500, "twenty-five" → 25.
    Returns None if conversion fails.
    """
    text = text.lower().strip().replace("-", " ")
    tokens = text.split()
    total, current = 0, 0
    for token in tokens:
        if token in _ONES:
            current += _ONES[token]
        elif token in _MULTS:
            mult = _MULTS[token]
            current = (current or 1) * mult
            if mult == 1000:
                total += current
                current = 0
        else:
            return None
    return float(total + current)


def normalise_quantity(value) -> Optional[float]:
    """
    Accept int, float, or string (digit or word).
    Returns float or None.
    """
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        # Try direct numeric parse
        try:
            return float(value.replace(",", ""))
        except ValueError:
            pass
        # Try word conversion
        return words_to_number(value)
    return None


def normalise_unit(value: str) -> Optional[str]:
    """Map surface unit form to canonical. Returns None if unrecognised."""
    if not isinstance(value, str):
        return None
    cleaned = value.strip().lower()
    return UNIT_NORM.get(cleaned)


# ── Valid actions ─────────────────────────────────────────────────────────────
VALID_ACTIONS = {"add_item", "estimate", "get_summary", "remove_item",
                 "missing_quantity", "unknown_item"}

ACTIONS_REQUIRING_ITEM = {"add_item", "estimate", "remove_item"}
ACTIONS_REQUIRING_QTY  = {"add_item", "estimate", "remove_item"}
ACTIONS_REQUIRING_UNIT = {"add_item", "estimate", "remove_item"}

ERROR_OUTPUT = {"actions": [], "error": "unable_to_parse"}


# ── Validation ────────────────────────────────────────────────────────────────
class ValidationError(Exception):
    pass


def validate_action(raw: dict) -> dict:
    """
    Validate and normalise a single action dict.
    Raises ValidationError on hard failures.
    """
    if not isinstance(raw, dict):
        raise ValidationError("action must be a dict")

    action = raw.get("action")
    if action not in VALID_ACTIONS:
        raise ValidationError(f"unknown action: {action!r}")

    # get_summary / unknown_item need no further fields
    if action in ("get_summary", "unknown_item"):
        return {"action": action}

    # missing_quantity only needs item
    if action == "missing_quantity":
        item = raw.get("item")
        if not isinstance(item, str) or not item.strip():
            raise ValidationError("missing_quantity requires item")
        return {"action": action, "item": item.strip().lower()}

    # add_item / estimate / remove_item
    item = raw.get("item")
    if not isinstance(item, str) or not item.strip():
        raise ValidationError(f"{action} requires non-empty item")

    qty_raw  = raw.get("quantity")
    quantity = normalise_quantity(qty_raw)
    if quantity is None:
        raise ValidationError(f"{action} requires valid quantity, got {qty_raw!r}")
    if quantity <= 0:
        raise ValidationError(f"quantity must be > 0, got {quantity}")

    unit_raw = raw.get("unit")
    unit     = normalise_unit(str(unit_raw)) if unit_raw is not None else None
    if unit is None:
        raise ValidationError(f"{action} requires valid unit, got {unit_raw!r}")

    # Return int if quantity is whole number
    qty_out = int(quantity) if quantity == int(quantity) else quantity

    return {
        "action":   action,
        "item":     item.strip().lower(),
        "quantity": qty_out,
        "unit":     unit,
    }


def _repair_t5_output(raw: str) -> str:
    """
    T5's sentencepiece tokenizer silently drops { and }.
    The model consistently outputs:
      "actions":["action":"add_item","item":"x","quantity":1,"unit":"u"]
    This repairs it to valid JSON:
      {"actions":[{"action":"add_item","item":"x","quantity":1,"unit":"u"}]}
    """
    s = raw.strip()

    # Only attempt repair when the output looks like T5's brace-stripped format
    if not re.match(r'^"actions"\s*:\s*\[', s):
        return raw

    bracket_start = s.index('[')
    bracket_end = s.rindex(']')
    array_content = s[bracket_start + 1:bracket_end].strip()

    if not array_content:
        return '{"actions":[]}'

    # Split on commas that immediately precede "action": — each is a new action entry
    parts = re.split(r',\s*(?="action"\s*:)', array_content)
    action_objects = ['{' + part.strip().strip(',') + '}' for part in parts if part.strip()]

    return '{"actions":[' + ','.join(action_objects) + ']}'


def validate(raw_text: str) -> dict:
    """
    Full validation pipeline.
    Input:  raw string from model
    Output: validated dict or ERROR_OUTPUT
    """
    # 1. Strip markdown code fences if present
    clean = re.sub(r"```json\s*|\s*```", "", raw_text).strip()

    # 2. Parse JSON (direct, then with T5 brace-repair fallback)
    parsed = None
    for candidate in (clean, _repair_t5_output(clean)):
        try:
            parsed = json.loads(candidate)
            break
        except (json.JSONDecodeError, ValueError):
            continue

    if parsed is None:
        return ERROR_OUTPUT.copy()

    # 3. Must be a dict with "actions" list
    if not isinstance(parsed, dict):
        return ERROR_OUTPUT.copy()
    if "error" in parsed:
        return {"actions": [], "error": parsed["error"]}
    if "actions" not in parsed or not isinstance(parsed["actions"], list):
        return ERROR_OUTPUT.copy()
    if len(parsed["actions"]) == 0:
        return ERROR_OUTPUT.copy()

    # 4. Validate each action
    validated_actions = []
    for raw_action in parsed["actions"]:
        try:
            validated_actions.append(validate_action(raw_action))
        except ValidationError:
            # One bad action → entire output rejected
            return ERROR_OUTPUT.copy()

    return {"actions": validated_actions}


# ── Quick self-test ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    tests = [
        # Valid – normal JSON
        ('{"actions":[{"action":"add_item","item":"concrete","quantity":10,"unit":"cubic yards"}]}',
         "normalise unit"),
        ('{"actions":[{"action":"estimate","item":"drywall","quantity":"five hundred","unit":"sqft"}]}',
         "word number + unit alias"),
        ('{"actions":[{"action":"get_summary"}]}',
         "summary"),
        ('{"actions":[{"action":"add_item","item":"steel rebar","quantity":200,"unit":"lbs"},{"action":"add_item","item":"concrete","quantity":15,"unit":"cy"}]}',
         "multi-item"),
        # Valid – T5 brace-stripped format (repaired automatically)
        ('"actions":["action":"add_item","item":"concrete","quantity":10,"unit":"cubic_yards"]',
         "T5 output: single item"),
        ('"actions":["action":"add_item","item":"concrete","quantity":10,"unit":"cubic_yards","action":"add_item","item":"steel rebar","quantity":200,"unit":"pounds"]',
         "T5 output: multi-item"),
        ('"actions":["action":"get_summary"]',
         "T5 output: get_summary"),
        # Error cases
        ('not json at all',                                       "bad JSON"),
        ('{"actions":[{"action":"fly","item":"x","quantity":1,"unit":"sqft"}]}', "invalid action"),
        ('{"actions":[{"action":"add_item","item":"concrete","quantity":-5,"unit":"cubic_yards"}]}', "negative qty"),
        ('{"actions":[]}',                                        "empty actions"),
        ('{"actions":[{"action":"add_item","item":"concrete","quantity":10,"unit":"dragon_units"}]}', "invalid unit"),
    ]

    print(f"\n{'='*60}")
    print("  Validation Layer – Self Test")
    print(f"{'='*60}\n")
    for raw, label in tests:
        result = validate(raw)
        status = "OK   " if "error" not in result else "ERROR"
        print(f"[{status}] {label}")
        print(f"       → {json.dumps(result)}\n")
