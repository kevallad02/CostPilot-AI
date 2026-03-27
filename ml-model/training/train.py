"""
Fine-tune flan-t5-small for construction cost query parsing.
Task: text → structured JSON (action, item, quantity, unit)
"""

import json
import os
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

# ─────────────────────────────── Config ────────────────────────────────────
MODEL_NAME = "google/flan-t5-small"
DATA_PATH = Path(__file__).parent.parent / "data" / "training_data.json"
OUTPUT_DIR = Path(__file__).parent.parent / "models" / "cost-parser"
MAX_INPUT_LENGTH = 128
MAX_TARGET_LENGTH = 128


# ─────────────────────────────── Data ──────────────────────────────────────
def load_dataset_from_json(path: Path) -> Dataset:
    with open(path) as f:
        records = json.load(f)
    return Dataset.from_list(records)


def preprocess(examples, tokenizer):
    model_inputs = tokenizer(
        examples["input_text"],
        max_length=MAX_INPUT_LENGTH,
        truncation=True,
        padding="max_length",
    )
    labels = tokenizer(
        examples["target_text"],
        max_length=MAX_TARGET_LENGTH,
        truncation=True,
        padding="max_length",
    )
    # Replace padding token id in labels with -100 so loss ignores them
    label_ids = [
        [(l if l != tokenizer.pad_token_id else -100) for l in label]
        for label in labels["input_ids"]
    ]
    model_inputs["labels"] = label_ids
    return model_inputs


# ─────────────────────────────── Metrics ───────────────────────────────────
def build_compute_metrics(tokenizer):
    rouge = evaluate.load("rouge")

    def compute_metrics(eval_preds):
        preds, labels = eval_preds
        if isinstance(preds, tuple):
            preds = preds[0]

        preds = np.where(preds != -100, preds, tokenizer.pad_token_id)
        labels = np.where(labels != -100, labels, tokenizer.pad_token_id)

        decoded_preds = tokenizer.batch_decode(preds, skip_special_tokens=True)
        decoded_labels = tokenizer.batch_decode(labels, skip_special_tokens=True)

        # Exact JSON match rate
        exact_matches = sum(
            p.strip() == l.strip()
            for p, l in zip(decoded_preds, decoded_labels)
        )
        exact_match_rate = exact_matches / len(decoded_preds)

        result = rouge.compute(
            predictions=decoded_preds,
            references=decoded_labels,
            use_stemmer=True,
        )
        result["exact_match"] = exact_match_rate
        return {k: round(v, 4) for k, v in result.items()}

    return compute_metrics


# ─────────────────────────────── Main ──────────────────────────────────────
def main():
    logger.info("Loading tokenizer and model: %s", MODEL_NAME)
    tokenizer = T5Tokenizer.from_pretrained(MODEL_NAME)
    model = T5ForConditionalGeneration.from_pretrained(
        MODEL_NAME,
        tie_word_embeddings=False,  # suppress tied-weights warning for this checkpoint
    )

    logger.info("Loading dataset from %s", DATA_PATH)
    dataset = load_dataset_from_json(DATA_PATH)

    # Split 80/20
    split = dataset.train_test_split(test_size=0.2, seed=42)
    train_ds = split["train"]
    eval_ds = split["test"]

    logger.info("Train samples: %d | Eval samples: %d", len(train_ds), len(eval_ds))

    # Tokenize
    tokenize_fn = lambda ex: preprocess(ex, tokenizer)
    train_ds = train_ds.map(tokenize_fn, batched=True, remove_columns=train_ds.column_names)
    eval_ds = eval_ds.map(tokenize_fn, batched=True, remove_columns=eval_ds.column_names)

    data_collator = DataCollatorForSeq2Seq(tokenizer, model=model, label_pad_token_id=-100)

    training_args = Seq2SeqTrainingArguments(
        output_dir=str(OUTPUT_DIR),
        num_train_epochs=15,
        per_device_train_batch_size=8,
        per_device_eval_batch_size=8,
        warmup_steps=50,
        weight_decay=0.01,
        learning_rate=5e-4,
        predict_with_generate=True,
        generation_max_length=MAX_TARGET_LENGTH,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="exact_match",
        greater_is_better=True,
        logging_dir=None,
        logging_steps=10,
        save_total_limit=2,
        fp16=False,  # CPU-safe; enable if GPU available
        report_to="none",
    )

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        processing_class=tokenizer,
        data_collator=data_collator,
        compute_metrics=build_compute_metrics(tokenizer),
        callbacks=[EarlyStoppingCallback(early_stopping_patience=3)],
    )

    logger.info("Starting training...")
    trainer.train()

    logger.info("Saving best model to %s", OUTPUT_DIR)
    trainer.save_model(str(OUTPUT_DIR))
    tokenizer.save_pretrained(str(OUTPUT_DIR))

    # Quick smoke test – reload from disk on CPU to avoid MPS state issues
    logger.info("Running smoke test...")
    import torch
    smoke_model = T5ForConditionalGeneration.from_pretrained(
        str(OUTPUT_DIR), tie_word_embeddings=False
    ).to("cpu")
    smoke_model.eval()
    test_inputs = [
        "Parse construction query: Estimate 20 cubic meter concrete",
        "Parse construction query: Add 500 kg steel",
        "Parse construction query: What is the total cost?",
    ]
    enc = tokenizer(
        test_inputs, return_tensors="pt", padding=True,
        truncation=True, max_length=MAX_INPUT_LENGTH,
    )
    enc = {k: v.to("cpu") for k, v in enc.items()}
    with torch.no_grad():
        out = smoke_model.generate(**enc, max_new_tokens=MAX_TARGET_LENGTH)
    decoded = tokenizer.batch_decode(out, skip_special_tokens=True)
    for inp, dec in zip(test_inputs, decoded):
        logger.info("INPUT : %s", inp)
        logger.info("OUTPUT: %s", dec)

    logger.info("Training complete.")


if __name__ == "__main__":
    main()
