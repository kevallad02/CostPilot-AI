-- CostPilot AI – PostgreSQL Schema + Seed Data (US Units)
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

-- ─────────────────────────────── Seed Data (US units / USD) ────────────────
-- All rates are per the listed unit in US dollars.
-- ON CONFLICT DO UPDATE so re-running this file refreshes prices.

INSERT INTO cost_items (item_name, category, unit, unit_rate) VALUES
  -- Concrete & Masonry
  ('concrete',           'Civil',      'cubic_yards',  125.00),
  ('ready mix concrete', 'Civil',      'cubic_yards',  135.00),
  ('mortar',             'Masonry',    'cubic_yards',   95.00),
  ('brick',              'Masonry',    'units',           0.55),
  ('bricks',             'Masonry',    'units',           0.55),
  ('cinder block',       'Masonry',    'units',           2.10),
  ('concrete block',     'Masonry',    'units',           2.10),
  ('stone',              'Masonry',    'tons',           48.00),
  ('flagstone',          'Masonry',    'square_feet',     4.50),

  -- Structural Steel
  ('steel',              'Structural', 'pounds',          0.75),
  ('steel rebar',        'Structural', 'pounds',          0.75),
  ('rebar',              'Structural', 'pounds',          0.75),
  ('structural steel',   'Structural', 'pounds',          0.90),
  ('steel beam',         'Structural', 'linear_feet',    18.00),
  ('steel pipe',         'Structural', 'linear_feet',    12.00),

  -- Earthwork & Fill
  ('sand',               'Civil',      'cubic_yards',    35.00),
  ('gravel',             'Civil',      'cubic_yards',    45.00),
  ('crushed stone',      'Civil',      'cubic_yards',    50.00),
  ('topsoil',            'Civil',      'cubic_yards',    28.00),
  ('fill dirt',          'Civil',      'cubic_yards',    15.00),
  ('mulch',              'Civil',      'cubic_yards',    38.00),
  ('asphalt',            'Civil',      'tons',           90.00),

  -- Lumber & Wood
  ('lumber',             'Carpentry',  'linear_feet',     4.50),
  ('wood',               'Carpentry',  'linear_feet',     4.50),
  ('plywood',            'Carpentry',  'units',          48.00),
  ('osb',                'Carpentry',  'units',          38.00),
  ('timber',             'Carpentry',  'linear_feet',     6.00),
  ('hardwood',           'Carpentry',  'square_feet',     8.00),

  -- Drywall & Insulation
  ('drywall',            'Finishing',  'square_feet',     1.20),
  ('sheetrock',          'Finishing',  'square_feet',     1.20),
  ('insulation',         'Finishing',  'square_feet',     1.50),
  ('spray foam',         'Finishing',  'square_feet',     2.50),

  -- Roofing
  ('roofing shingles',   'Roofing',    'square_feet',     1.80),
  ('shingles',           'Roofing',    'square_feet',     1.80),
  ('metal roofing',      'Roofing',    'square_feet',     4.50),
  ('roof tiles',         'Roofing',    'square_feet',     5.00),
  ('underlayment',       'Roofing',    'square_feet',     0.45),

  -- Flooring & Tile
  ('tiles',              'Finishing',  'square_feet',     3.50),
  ('ceramic tile',       'Finishing',  'square_feet',     3.50),
  ('porcelain tile',     'Finishing',  'square_feet',     5.00),
  ('hardwood flooring',  'Finishing',  'square_feet',     9.00),
  ('vinyl flooring',     'Finishing',  'square_feet',     2.50),
  ('carpet',             'Finishing',  'square_feet',     3.00),
  ('laminate flooring',  'Finishing',  'square_feet',     2.00),

  -- Glass & Windows
  ('glass',              'Finishing',  'square_feet',     9.00),
  ('tempered glass',     'Finishing',  'square_feet',    18.00),
  ('windows',            'Finishing',  'units',          350.00),

  -- Paint & Coatings
  ('paint',              'Finishing',  'gallons',         35.00),
  ('primer',             'Finishing',  'gallons',         28.00),
  ('stain',              'Finishing',  'gallons',         32.00),
  ('sealant',            'Finishing',  'gallons',         42.00),

  -- Cement / Binding
  ('cement',             'Civil',      'units',           12.00),
  ('portland cement',    'Civil',      'units',           14.00),

  -- Plumbing
  ('copper pipe',        'Plumbing',   'linear_feet',     8.50),
  ('pvc pipe',           'Plumbing',   'linear_feet',     2.50),
  ('pex pipe',           'Plumbing',   'linear_feet',     1.80),
  ('conduit',            'Electrical', 'linear_feet',     2.00),

  -- Electrical
  ('electrical wire',    'Electrical', 'linear_feet',     1.20),
  ('wire',               'Electrical', 'linear_feet',     1.20),

  -- Doors & Hardware
  ('doors',              'Carpentry',  'units',          250.00),
  ('door',               'Carpentry',  'units',          250.00),
  ('hardware',           'Carpentry',  'units',           45.00)

ON CONFLICT (item_name) DO UPDATE
  SET unit_rate = EXCLUDED.unit_rate,
      unit      = EXCLUDED.unit,
      category  = EXCLUDED.category;
