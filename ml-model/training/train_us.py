"""
Train flan-t5-small for US construction cost query parsing.
Output: strict JSON with actions array, US units, multi-item support.
"""

import json
import logging
from pathlib import Path

from datasets import Dataset
from transformers import (
    T5ForConditionalGeneration,
    T5Tokenizer,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    DataCollatorForSeq2Seq,
    EarlyStoppingCallback,
)
import evaluate
import numpy as np

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Config ───────────────────────────────────────────────────────────────────
MODEL_NAME  = "google/flan-t5-small"
DATA_PATH   = Path(__file__).parent.parent / "data" / "training_data_us.json"
OUTPUT_DIR  = Path(__file__).parent.parent / "models" / "cost-parser-us"
MAX_INPUT   = 192   # longer to handle multi-item queries
MAX_TARGET  = 256   # longer to handle multi-action JSON arrays


# ── Dataset ──────────────────────────────────────────────────────────────────
def load_data(path: Path) -> Dataset:
    with open(path) as f:
        return Dataset.from_list(json.load(f))


def preprocess(examples, tokenizer):
    inputs  = tokenizer(examples["input_text"],  max_length=MAX_INPUT,  truncation=True, padding="max_length")
    targets = tokenizer(examples["target_text"], max_length=MAX_TARGET, truncation=True, padding="max_length")
    labels  = [
        [(t if t != tokenizer.pad_token_id else -100) for t in seq]
        for seq in targets["input_ids"]
    ]
    inputs["labels"] = labels
    return inputs


# ── Metrics ──────────────────────────────────────────────────────────────────
def build_compute_metrics(tokenizer):
    rouge = evaluate.load("rouge")

    def compute_metrics(eval_preds):
        preds, labels = eval_preds
        if isinstance(preds, tuple):
            preds = preds[0]
        preds  = np.where(preds  != -100, preds,  tokenizer.pad_token_id)
        labels = np.where(labels != -100, labels, tokenizer.pad_token_id)
        decoded_preds  = tokenizer.batch_decode(preds,  skip_special_tokens=True)
        decoded_labels = tokenizer.batch_decode(labels, skip_special_tokens=True)

        # Exact JSON match
        exact = sum(p.strip() == l.strip() for p, l in zip(decoded_preds, decoded_labels))

        # Valid JSON rate
        valid_json = 0
        for p in decoded_preds:
            try:
                parsed = json.loads(p.strip())
                if "actions" in parsed and isinstance(parsed["actions"], list):
                    valid_json += 1
            except Exception:
                pass

        result = rouge.compute(predictions=decoded_preds, references=decoded_labels, use_stemmer=True)
        result["exact_match"]    = exact / len(decoded_preds)
        result["valid_json_rate"] = valid_json / len(decoded_preds)
        return {k: round(v, 4) for k, v in result.items()}

    return compute_metrics


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    logger.info("Loading tokenizer and model: %s", MODEL_NAME)
    tokenizer = T5Tokenizer.from_pretrained(MODEL_NAME)
    model     = T5ForConditionalGeneration.from_pretrained(MODEL_NAME, tie_word_embeddings=False)

    logger.info("Loading dataset: %s", DATA_PATH)
    dataset = load_data(DATA_PATH)
    split   = dataset.train_test_split(test_size=0.15, seed=42)
    train_ds, eval_ds = split["train"], split["test"]
    logger.info("Train: %d | Eval: %d", len(train_ds), len(eval_ds))

    tok_fn   = lambda ex: preprocess(ex, tokenizer)
    train_ds = train_ds.map(tok_fn, batched=True, remove_columns=train_ds.column_names)
    eval_ds  = eval_ds.map(tok_fn,  batched=True, remove_columns=eval_ds.column_names)

    collator = DataCollatorForSeq2Seq(tokenizer, model=model, label_pad_token_id=-100)

    args = Seq2SeqTrainingArguments(
        output_dir=str(OUTPUT_DIR),
        num_train_epochs=25,
        per_device_train_batch_size=8,
        per_device_eval_batch_size=8,
        warmup_steps=30,
        weight_decay=0.01,
        learning_rate=3e-4,
        predict_with_generate=True,
        generation_max_length=MAX_TARGET,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="valid_json_rate",
        greater_is_better=True,
        logging_dir=None,
        logging_steps=5,
        save_total_limit=2,
        fp16=False,
        report_to="none",
    )

    trainer = Seq2SeqTrainer(
        model=model,
        args=args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        processing_class=tokenizer,
        data_collator=collator,
        compute_metrics=build_compute_metrics(tokenizer),
        callbacks=[EarlyStoppingCallback(early_stopping_patience=4)],
    )

    logger.info("Training...")
    trainer.train()

    logger.info("Saving to %s", OUTPUT_DIR)
    trainer.save_model(str(OUTPUT_DIR))
    tokenizer.save_pretrained(str(OUTPUT_DIR))

    # Smoke test
    import torch
    smoke = T5ForConditionalGeneration.from_pretrained(str(OUTPUT_DIR), tie_word_embeddings=False).to("cpu")
    smoke.eval()
    tests = [
        "Parse US construction query: Add 10 cubic yards of concrete",
        "Parse US construction query: Estimate 500 sqft of drywall",
        "Parse US construction query: Add 10 cubic yards concrete and 200 lbs steel rebar",
        "Parse US construction query: What is the total cost?",
        "Parse US construction query: Add some diamond",
    ]
    enc = tokenizer(tests, return_tensors="pt", padding=True, truncation=True, max_length=MAX_INPUT)
    enc = {k: v.to("cpu") for k, v in enc.items()}
    with torch.no_grad():
        out = smoke.generate(**enc, max_new_tokens=MAX_TARGET)
    decoded = tokenizer.batch_decode(out, skip_special_tokens=True)
    for inp, dec in zip(tests, decoded):
        logger.info("IN : %s", inp.replace("Parse US construction query: ", ""))
        logger.info("OUT: %s", dec)

    logger.info("Done.")


if __name__ == "__main__":
    main()
