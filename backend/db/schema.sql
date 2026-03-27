-- CostPilot AI – PostgreSQL Schema + Seed Data
-- Run: psql -U <user> -d <database> -f schema.sql

-- ─────────────────────────────── Tables ────────────────────────────────────

CREATE TABLE IF NOT EXISTS cost_items (
    id          SERIAL PRIMARY KEY,
    item_name   VARCHAR(100) NOT NULL UNIQUE,
    category    VARCHAR(100) NOT NULL,
    unit        VARCHAR(20)  NOT NULL,
    unit_rate   NUMERIC(12, 2) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS estimate_records (
    id          SERIAL PRIMARY KEY,
    session_id  VARCHAR(64)  NOT NULL,
    item_name   VARCHAR(100) NOT NULL,
    quantity    NUMERIC(12, 3) NOT NULL,
    unit        VARCHAR(20)  NOT NULL,
    unit_rate   NUMERIC(12, 2) NOT NULL,
    total_cost  NUMERIC(14, 2) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_estimate_records_session ON estimate_records (session_id);
CREATE INDEX IF NOT EXISTS idx_estimate_records_created ON estimate_records (created_at);

-- ─────────────────────────────── Seed Data ─────────────────────────────────
-- Unit rates are in USD; adjust to local currency as needed.

INSERT INTO cost_items (item_name, category, unit, unit_rate) VALUES
    ('concrete',  'Civil',      'm3',     120.00),
    ('steel',     'Structural', 'kg',       0.85),
    ('brick',     'Masonry',    'pieces',   0.45),
    ('sand',      'Civil',      'm3',      18.00),
    ('gravel',    'Civil',      'm3',      22.00),
    ('cement',    'Civil',      'bags',     8.50),
    ('wood',      'Carpentry',  'sq_m',    35.00),
    ('tiles',     'Finishing',  'sq_m',    28.00),
    ('glass',     'Finishing',  'sq_m',    45.00),
    ('paint',     'Finishing',  'liters',   6.00)
ON CONFLICT (item_name) DO NOTHING;
