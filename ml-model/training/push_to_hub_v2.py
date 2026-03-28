"""
Upload the v2 US construction model to HuggingFace Hub.
Run after training: python training/push_to_hub_v2.py
"""

import sys
from pathlib import Path
from transformers import T5ForConditionalGeneration, T5Tokenizer

MODEL_DIR = Path(__file__).parent.parent / "models" / "cost-parser-v2"

HF_USERNAME = "kevallad"
REPO_NAME   = "costpilot-cost-parser-v2"
PRIVATE     = False   # public so HF Spaces can load without a token


def main():
    if not MODEL_DIR.exists():
        print(f"ERROR: Model not found at {MODEL_DIR}")
        print("Run  python training/train_v2.py  first.")
        sys.exit(1)

    repo_id = f"{HF_USERNAME}/{REPO_NAME}"
    print(f"Uploading to: https://huggingface.co/{repo_id}")

    tokenizer = T5Tokenizer.from_pretrained(str(MODEL_DIR))
    model     = T5ForConditionalGeneration.from_pretrained(str(MODEL_DIR))

    tokenizer.push_to_hub(repo_id, private=PRIVATE)
    model.push_to_hub(repo_id, private=PRIVATE)

    print(f"Done → https://huggingface.co/{repo_id}")


if __name__ == "__main__":
    main()
