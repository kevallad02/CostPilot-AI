"""
Upload fine-tuned model to HuggingFace Hub.
Run once after training: python training/push_to_hub.py
"""

import sys
from pathlib import Path
from transformers import T5ForConditionalGeneration, T5Tokenizer
from huggingface_hub import HfApi

MODEL_DIR = Path(__file__).parent.parent / "models" / "cost-parser"

# ── Config – edit these ───────────────────────────────────────────────────────
HF_USERNAME = "kevallad"          # your HuggingFace username
REPO_NAME   = "costpilot-cost-parser"     # repo name on HF Hub
PRIVATE     = True                         # set False to make it public
# ─────────────────────────────────────────────────────────────────────────────

def main():
    if not MODEL_DIR.exists():
        print(f"ERROR: Model not found at {MODEL_DIR}")
        print("Run training/train.py first.")
        sys.exit(1)

    repo_id = f"{HF_USERNAME}/{REPO_NAME}"
    print(f"Uploading model to: https://huggingface.co/{repo_id}")

    tokenizer = T5Tokenizer.from_pretrained(str(MODEL_DIR))
    model = T5ForConditionalGeneration.from_pretrained(
        str(MODEL_DIR), tie_word_embeddings=False
    )

    tokenizer.push_to_hub(repo_id, private=PRIVATE)
    model.push_to_hub(repo_id, private=PRIVATE)

    print(f"Done! Model live at: https://huggingface.co/{repo_id}")

if __name__ == "__main__":
    main()
