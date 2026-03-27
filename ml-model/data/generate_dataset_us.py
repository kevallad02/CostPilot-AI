"""
Generate 10,000 US construction training examples for flan-t5-small.
Covers: add_item, estimate, get_summary, remove_item, multi-item, edge cases.
Output: training_data_v2.json
"""

import json
import random
import re
from pathlib import Path
from itertools import product

random.seed(42)
OUT = Path(__file__).parent / "training_data_v2.json"

# ── Materials with their natural units ───────────────────────────────────────
MATERIALS: dict[str, list[str]] = {
    "concrete":          ["cubic_yards"],
    "cement":            ["pounds", "tons"],
    "steel rebar":       ["pounds", "tons"],
    "drywall":           ["square_feet"],
    "lumber":            ["linear_feet"],
    "plywood":           ["units"],
    "insulation":        ["square_feet"],
    "roofing shingles":  ["square_feet"],
    "asphalt":           ["tons"],
    "tiles":             ["square_feet"],
    "paint":             ["gallons"],
    "electrical wiring": ["linear_feet"],
    "plumbing pipes":    ["linear_feet"],
    "HVAC":              ["units"],
    "flooring":          ["square_feet"],
    "gravel":            ["tons", "cubic_yards"],
    "structural steel":  ["tons"],
    "sand":              ["tons", "cubic_yards"],
}

UNKNOWN_ITEMS = [
    "dragon scales", "moon dust", "diamond blocks", "crystal lattice",
    "unicorn glue", "magic cement", "platinum tiles", "alien alloy",
    "infinity panels", "quantum rebar", "fairy insulation", "void tiles",
]

# ── Unit surface forms ────────────────────────────────────────────────────────
UNIT_SURFACE: dict[str, list[str]] = {
    "cubic_yards":  ["cubic yards", "cubic yard", "cu yd", "cy", "CY", "cu. yd."],
    "square_feet":  ["square feet", "square foot", "sq ft", "sqft", "sq. ft.", "ft2", "SF"],
    "linear_feet":  ["linear feet", "linear foot", "lin ft", "lineal feet", "LF", "lin. ft."],
    "pounds":       ["pounds", "pound", "lbs", "lb"],
    "tons":         ["tons", "ton"],
    "gallons":      ["gallons", "gallon", "gal"],
    "units":        ["units", "unit", "pieces", "pcs", "each", "ea", "sheets"],
}

# ── Quantities ────────────────────────────────────────────────────────────────
WORD_NUMBERS = {
    1: "one", 2: "two", 3: "three", 4: "four", 5: "five",
    6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten",
    11: "eleven", 12: "twelve", 15: "fifteen", 20: "twenty",
    25: "twenty-five", 30: "thirty", 40: "forty", 50: "fifty",
    100: "one hundred", 200: "two hundred", 500: "five hundred",
    1000: "one thousand",
}

DIGIT_POOLS = {
    "cubic_yards":  [5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 75, 100],
    "square_feet":  [100, 200, 300, 400, 500, 600, 750, 800, 1000, 1200, 1500, 2000],
    "linear_feet":  [50, 75, 100, 150, 200, 250, 300, 400, 500],
    "pounds":       [100, 150, 200, 250, 300, 400, 500, 750, 1000],
    "tons":         [1, 2, 5, 8, 10, 15, 20, 25, 30, 50],
    "gallons":      [5, 10, 15, 20, 25, 30, 40, 50, 75, 100],
    "units":        [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20],
}


def qty(unit: str, as_word: bool = False) -> tuple[int, str]:
    """Return (numeric_qty, surface_form)."""
    num = random.choice(DIGIT_POOLS[unit])
    if as_word and num in WORD_NUMBERS:
        return num, WORD_NUMBERS[num]
    return num, str(num)


def unit_surface(canonical: str) -> str:
    return random.choice(UNIT_SURFACE[canonical])


# ── Action sentence templates ─────────────────────────────────────────────────
ADD_TEMPLATES = [
    "Add {qty} {unit} of {item}",
    "add {qty} {unit} {item}",
    "I need {qty} {unit} of {item}",
    "Include {qty} {unit} of {item}",
    "Include {qty} {unit} {item} in the project",
    "Order {qty} {unit} of {item}",
    "Put down {qty} {unit} of {item}",
    "We need {qty} {unit} of {item}",
    "We will need {qty} {unit} of {item}",
    "Please add {qty} {unit} of {item}",
    "Can you add {qty} {unit} of {item}?",
    "Schedule {qty} {unit} of {item}",
    "I want to add {qty} {unit} of {item}",
    "Add {qty} {unit} {item} to my estimate",
    "Budget {qty} {unit} of {item}",
    "Plan for {qty} {unit} of {item}",
    "Get me {qty} {unit} of {item}",
    "I'll take {qty} {unit} of {item}",
    "Put {qty} {unit} of {item} in the budget",
    "Add {item} – {qty} {unit}",
]

ESTIMATE_TEMPLATES = [
    "Estimate {qty} {unit} of {item}",
    "estimate {qty} {unit} {item}",
    "How much does {qty} {unit} of {item} cost?",
    "What is the cost of {qty} {unit} of {item}?",
    "What will {qty} {unit} of {item} cost?",
    "Price for {qty} {unit} of {item}",
    "Give me a price for {qty} {unit} of {item}",
    "Calculate the cost of {qty} {unit} of {item}",
    "What would {qty} {unit} of {item} run me?",
    "How much is {qty} {unit} of {item}?",
    "Cost of {qty} {unit} {item}?",
    "What's the going rate for {qty} {unit} of {item}?",
    "Give me an estimate for {qty} {unit} of {item}",
    "I need a quote on {qty} {unit} of {item}",
    "What does {qty} {unit} {item} cost?",
    "Ballpark for {qty} {unit} of {item}?",
    "Price check on {qty} {unit} of {item}",
    "Get a cost estimate for {qty} {unit} of {item}",
    "Figure out the cost for {qty} {unit} {item}",
    "What's the price on {qty} {unit} of {item}?",
]

REMOVE_TEMPLATES = [
    "Remove {qty} {unit} of {item}",
    "Delete {qty} {unit} of {item} from my estimate",
    "Take out {qty} {unit} of {item}",
    "Cancel {qty} {unit} of {item}",
    "Drop {qty} {unit} of {item}",
    "Remove {qty} {unit} {item} from the budget",
    "I no longer need {qty} {unit} of {item}",
    "Cut {qty} {unit} of {item} from the estimate",
]

SUMMARY_TEMPLATES = [
    "What is the total cost?",
    "Show me the project summary",
    "Give me a breakdown of all costs",
    "What is my running total?",
    "Show total project cost",
    "How much have I spent so far?",
    "List everything I have added",
    "Summary please",
    "What is the grand total?",
    "Show me everything in my estimate",
    "What is the current total?",
    "Project cost summary",
    "Show all items",
    "What's in my estimate?",
    "Give me the full breakdown",
    "Total up everything",
    "What do I owe?",
    "Running cost?",
    "Complete cost overview",
    "How much is my project so far?",
]

MISSING_QTY_TEMPLATES = [
    "Add {item} to the project",
    "I need some {item}",
    "Include {item} in my budget",
    "Estimate {item} cost",
    "How much does {item} cost?",
    "What is the price of {item}?",
    "Add {item}",
    "I want {item}",
]

MISSING_UNIT_TEMPLATES = [
    "Add {qty} {item}",
    "I need {qty} {item}",
    "Estimate {qty} {item}",
    "Include {qty} {item}",
]

UNKNOWN_TEMPLATES = [
    "Add {qty} tons of {item}",
    "Estimate {qty} units of {item}",
    "I need {qty} pieces of {item}",
    "Include {item} in the project",
    "Add some {item}",
]


# ── JSON builders ─────────────────────────────────────────────────────────────
def make_action(action: str, item: str, quantity: int, unit: str) -> dict:
    return {"action": action, "item": item, "quantity": quantity, "unit": unit}


def make_output(actions: list[dict]) -> str:
    return json.dumps({"actions": actions}, separators=(",", ":"))


SUMMARY_OUTPUT = json.dumps({"actions": [{"action": "get_summary"}]}, separators=(",", ":"))
MISSING_QTY_OUTPUT = lambda item: json.dumps(
    {"actions": [{"action": "missing_quantity", "item": item}]}, separators=(",", ":"))
UNKNOWN_OUTPUT = json.dumps({"actions": [], "error": "unable_to_parse"}, separators=(",", ":"))


# ── Generators ────────────────────────────────────────────────────────────────
PREFIX = "Parse US construction query: "


def gen_simple(action: str, templates: list[str], n: int) -> list[dict]:
    samples = []
    items = list(MATERIALS.keys())
    for _ in range(n):
        item  = random.choice(items)
        unit  = random.choice(MATERIALS[item])
        as_wn = random.random() < 0.12   # 12% word numbers
        q, qs = qty(unit, as_word=as_wn)
        us    = unit_surface(unit)
        tmpl  = random.choice(templates)
        text  = tmpl.format(qty=qs, unit=us, item=item)
        output = make_output([make_action(action, item, q, unit)])
        samples.append({"input_text": PREFIX + text, "target_text": output})
    return samples


def gen_summary(n: int) -> list[dict]:
    return [
        {"input_text": PREFIX + random.choice(SUMMARY_TEMPLATES), "target_text": SUMMARY_OUTPUT}
        for _ in range(n)
    ]


def gen_multi(action: str, n: int, max_items: int = 3) -> list[dict]:
    samples = []
    items = list(MATERIALS.keys())
    for _ in range(n):
        k    = random.randint(2, max_items)
        chosen = random.sample(items, k)
        parts, actions = [], []
        for item in chosen:
            unit = random.choice(MATERIALS[item])
            as_wn = random.random() < 0.08
            q, qs = qty(unit, as_word=as_wn)
            us    = unit_surface(unit)
            verb  = "Add" if action == "add_item" else "estimate"
            parts.append(f"{verb} {qs} {us} of {item}")
            actions.append(make_action(action, item, q, unit))
        sep   = random.choice([" and ", ", ", " plus ", "; "])
        text  = sep.join(parts)
        if random.random() < 0.3:
            text = text[0].upper() + text[1:]
        samples.append({"input_text": PREFIX + text, "target_text": make_output(actions)})
    return samples


def gen_mixed_multi(n: int) -> list[dict]:
    """Multi-item with mixed add + estimate actions."""
    samples = []
    items = list(MATERIALS.keys())
    for _ in range(n):
        k = random.randint(2, 3)
        chosen = random.sample(items, k)
        parts, actions = [], []
        for item in chosen:
            action = random.choice(["add_item", "estimate"])
            unit   = random.choice(MATERIALS[item])
            q, qs  = qty(unit)
            us     = unit_surface(unit)
            verb   = "Add" if action == "add_item" else "Estimate"
            parts.append(f"{verb} {qs} {us} {item}")
            actions.append(make_action(action, item, q, unit))
        text = " and ".join(parts)
        samples.append({"input_text": PREFIX + text, "target_text": make_output(actions)})
    return samples


def gen_missing_qty(n: int) -> list[dict]:
    samples = []
    items = list(MATERIALS.keys())
    for _ in range(n):
        item = random.choice(items)
        tmpl = random.choice(MISSING_QTY_TEMPLATES)
        text = tmpl.format(item=item)
        samples.append({"input_text": PREFIX + text, "target_text": MISSING_QTY_OUTPUT(item)})
    return samples


def gen_unknown(n: int) -> list[dict]:
    samples = []
    for _ in range(n):
        item = random.choice(UNKNOWN_ITEMS)
        q    = random.randint(1, 100)
        tmpl = random.choice(UNKNOWN_TEMPLATES)
        text = tmpl.format(qty=q, item=item)
        samples.append({"input_text": PREFIX + text, "target_text": UNKNOWN_OUTPUT})
    return samples


def gen_informal(n: int) -> list[dict]:
    """Informal / typo-like phrasings."""
    informal = [
        "lemme add {qty} {unit} {item}",
        "gonna need {qty} {unit} of {item}",
        "throw in {qty} {unit} {item}",
        "add like {qty} {unit} of {item}",
        "i think we need {qty} {unit} {item}",
        "can u estimate {qty} {unit} {item}",
        "est {qty} {unit} {item}",
        "pls add {qty} {unit} {item}",
        "budget for {qty} {unit} {item} please",
        "quick add {qty} {unit} {item}",
    ]
    samples = []
    items = list(MATERIALS.keys())
    for _ in range(n):
        item  = random.choice(items)
        unit  = random.choice(MATERIALS[item])
        q, qs = qty(unit)
        us    = unit_surface(unit)
        tmpl  = random.choice(informal)
        text  = tmpl.format(qty=qs, unit=us, item=item)
        action = "add_item" if any(k in tmpl for k in ["add", "throw", "lemme", "gonna", "budget", "quick"]) else "estimate"
        output = make_output([make_action(action, item, q, unit)])
        samples.append({"input_text": PREFIX + text, "target_text": output})
    return samples


def gen_word_numbers(n: int) -> list[dict]:
    """Exclusively word-number examples."""
    templates = ADD_TEMPLATES + ESTIMATE_TEMPLATES
    samples   = []
    items     = list(MATERIALS.keys())
    wn_pool   = [k for k in WORD_NUMBERS if k in [v for vals in DIGIT_POOLS.values() for v in vals]]
    for _ in range(n):
        item  = random.choice(items)
        unit  = random.choice(MATERIALS[item])
        pool  = [k for k in wn_pool if k in DIGIT_POOLS[unit]]
        if not pool:
            continue
        q     = random.choice(pool)
        qs    = WORD_NUMBERS[q]
        us    = unit_surface(unit)
        tmpl  = random.choice(templates)
        text  = tmpl.format(qty=qs, unit=us, item=item)
        action = "add_item" if tmpl in ADD_TEMPLATES else "estimate"
        output = make_output([make_action(action, item, q, unit)])
        samples.append({"input_text": PREFIX + text, "target_text": output})
    return samples


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("Generating 10,000 US construction training examples...")
    dataset = []

    dataset += gen_simple("add_item",    ADD_TEMPLATES,      3000)
    dataset += gen_simple("estimate",    ESTIMATE_TEMPLATES, 2000)
    dataset += gen_simple("remove_item", REMOVE_TEMPLATES,    400)
    dataset += gen_summary(600)
    dataset += gen_multi("add_item",  n=1200, max_items=3)
    dataset += gen_multi("estimate",  n=700,  max_items=3)
    dataset += gen_mixed_multi(300)
    dataset += gen_missing_qty(350)
    dataset += gen_unknown(250)
    dataset += gen_informal(600)
    dataset += gen_word_numbers(600)

    random.shuffle(dataset)
    # Trim to exactly 10,000
    dataset = dataset[:10000]

    with open(OUT, "w") as f:
        json.dump(dataset, f, indent=2)

    print(f"Saved {len(dataset)} examples → {OUT}")

    # Stats
    actions_count: dict[str, int] = {}
    for ex in dataset:
        try:
            acts = json.loads(ex["target_text"]).get("actions", [])
            for a in acts:
                k = a.get("action", "unknown")
                actions_count[k] = actions_count.get(k, 0) + 1
        except Exception:
            pass
    print("\nAction distribution:")
    for k, v in sorted(actions_count.items(), key=lambda x: -x[1]):
        print(f"  {k:<20} {v:>5}")


if __name__ == "__main__":
    main()
