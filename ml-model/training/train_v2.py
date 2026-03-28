"""
Train flan-t5-small on 10,000 US construction examples.
Optimised for JSON validity and exact-match accuracy.
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

MODEL_NAME = "google/flan-t5-small"
DATA_PATH  = Path(__file__).parent.parent / "data" / "training_data_v2.json"
OUTPUT_DIR = Path(__file__).parent.parent / "models" / "cost-parser-v2"
MAX_INPUT  = 192
MAX_TARGET = 320  # multi-item actions can be long


def load_data(path: Path) -> Dataset:
    with open(path) as f:
        return Dataset.from_list(json.load(f))


def preprocess(examples, tokenizer):
    inputs  = tokenizer(examples["input_text"],  max_length=MAX_INPUT,  truncation=True, padding="max_length")
    targets = tokenizer(examples["target_text"], max_length=MAX_TARGET, truncation=True, padding="max_length")
    inputs["labels"] = [
        [(t if t != tokenizer.pad_token_id else -100) for t in seq]
        for seq in targets["input_ids"]
    ]
    return inputs


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

        exact, valid_json, valid_schema = 0, 0, 0
        for pred, label in zip(decoded_preds, decoded_labels):
            pred = pred.strip()
            if pred == label.strip():
                exact += 1
            try:
                parsed = json.loads(pred)
                if isinstance(parsed.get("actions"), list):
                    valid_json += 1
                    if all(
                        "action" in a and (
                            a["action"] in ("get_summary", "unknown_item", "missing_quantity")
                            or all(k in a for k in ("item", "quantity", "unit"))
                        )
                        for a in parsed["actions"]
                    ):
                        valid_schema += 1
            except Exception:
                pass

        n = len(decoded_preds)
        result = rouge.compute(predictions=decoded_preds, references=decoded_labels, use_stemmer=True)
        result["exact_match"]    = round(exact / n, 4)
        result["valid_json"]     = round(valid_json / n, 4)
        result["valid_schema"]   = round(valid_schema / n, 4)
        return {k: round(v, 4) for k, v in result.items()}

    return compute_metrics


def main():
    logger.info("Model: %s", MODEL_NAME)
    tokenizer = T5Tokenizer.from_pretrained(MODEL_NAME)
    model     = T5ForConditionalGeneration.from_pretrained(MODEL_NAME)

    logger.info("Dataset: %s", DATA_PATH)
    dataset  = load_data(DATA_PATH)
    split    = dataset.train_test_split(test_size=0.05, seed=42)
    train_ds = split["train"].map(lambda ex: preprocess(ex, tokenizer), batched=True,
                                   remove_columns=split["train"].column_names)
    eval_ds  = split["test"].map(lambda ex: preprocess(ex, tokenizer),  batched=True,
                                  remove_columns=split["test"].column_names)

    logger.info("Train: %d | Eval: %d", len(train_ds), len(eval_ds))

    collator = DataCollatorForSeq2Seq(tokenizer, model=model, label_pad_token_id=-100)

    args = Seq2SeqTrainingArguments(
        output_dir=str(OUTPUT_DIR),
        num_train_epochs=20,
        per_device_train_batch_size=8,
        per_device_eval_batch_size=8,
        warmup_steps=500,
        weight_decay=0.01,
        learning_rate=5e-5,
        max_grad_norm=1.0,
        predict_with_generate=True,
        generation_max_length=MAX_TARGET,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="valid_schema",
        greater_is_better=True,
        logging_dir=None,
        logging_steps=50,
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
        callbacks=[EarlyStoppingCallback(early_stopping_patience=3)],
    )

    logger.info("Training...")
    trainer.train()

    logger.info("Saving → %s", OUTPUT_DIR)
    trainer.save_model(str(OUTPUT_DIR))
    tokenizer.save_pretrained(str(OUTPUT_DIR))

    # Smoke test
    import torch, sys
    sys.path.insert(0, str(Path(__file__).parent.parent / "inference"))
    from validator import validate

    smoke = T5ForConditionalGeneration.from_pretrained(str(OUTPUT_DIR)).to("cpu")
    smoke.eval()
    tests = [
        "Parse US construction query: Add 10 cubic yards of concrete",
        "Parse US construction query: Estimate 500 sqft drywall",
        "Parse US construction query: Add 10 cubic yards concrete and 200 lbs steel rebar",
        "Parse US construction query: What is the total cost?",
        "Parse US construction query: Add some diamond",
    ]
    enc = tokenizer(tests, return_tensors="pt", padding=True, truncation=True, max_length=MAX_INPUT)
    enc = {k: v.to("cpu") for k, v in enc.items()}
    with torch.no_grad():
        out = smoke.generate(**enc, max_new_tokens=MAX_TARGET, max_length=None)
    decoded = tokenizer.batch_decode(out, skip_special_tokens=True)

    logger.info("─── Smoke Test ───")
    for inp, raw in zip(tests, decoded):
        validated = validate(raw)
        logger.info("IN : %s", inp.replace("Parse US construction query: ", ""))
        logger.info("RAW: %s", raw)
        logger.info("OUT: %s", json.dumps(validated))
    logger.info("Training complete.")


if __name__ == "__main__":
    main()
