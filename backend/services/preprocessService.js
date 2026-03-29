/**
 * preprocessService.js
 * Cleans and normalises raw user input before sending to the ML model.
 *
 * Handles:
 *  - Hinglish / mixed-language filler words ("karo", "chahiye", etc.)
 *  - Informal quantity words ("a few", "around")
 *  - Unit aliases ("yards" → "cubic yards", "sqft" → "square feet")
 *  - Splitting multi-item sentences into separate clean queries
 */

// ── Hinglish / informal word replacements ─────────────────────────────────────
const WORD_REPLACEMENTS = [
  // Hindi/Hinglish filler → remove or replace
  [/\badd\s+karo\b/gi,     'add'],
  [/\bkaro\b/gi,           ''],
  [/\blagao\b/gi,          'add'],
  [/\bchahiye\b/gi,        'I need'],
  [/\bmujhe\b/gi,          'I need'],
  [/\baur\b/gi,            'and'],
  [/\bbhi\b/gi,            'also'],
  [/\bplease\s+add\b/gi,   'add'],
  [/\bcan\s+you\s+add\b/gi,'add'],
  [/\bplease\s+include\b/gi,'add'],

  // "include" / "also include" → "add"
  [/\binclude\b/gi,        'add'],

  // Informal quantity phrases
  [/\baround\b/gi,         ''],
  [/\babout\b/gi,          ''],
  [/\bapproximately\b/gi,  ''],
  [/\ba\s+few\b/gi,        '3'],
  [/\bsome\b/gi,           ''],

  // Unit normalisation before ML sees it
  [/\bsq\.?\s*ft\.?\b/gi,  'square feet'],
  [/\bsqft\b/gi,           'square feet'],
  [/\bsq\.?\s*feet\b/gi,   'square feet'],
  [/\bcu\.?\s*yd\.?\b/gi,  'cubic yards'],
  [/\bcy\b/gi,             'cubic yards'],
  // "yards" alone in construction context → "cubic yards"
  [/(\d+)\s+yards?\b(?!\s+of\s+fabric)/gi, '$1 cubic yards'],
  [/\blbs?\b/gi,           'pounds'],
  [/\bgals?\b/gi,          'gallons'],
  [/\blin\.?\s*ft\.?\b/gi, 'linear feet'],
];

// ── Split a long query into individual item sentences ─────────────────────────
// Split on: "and", "+", ",", "also", numbered list markers
const SPLIT_PATTERN = /\s*(?:,\s*|\s+and\s+|\s*\+\s*|\s+also\s+|\s+plus\s+)\s*/i;

// Keywords that start a new action clause
const ACTION_STARTS = /\b(add|estimate|i need|i want|include|budget for|calculate|get me|give me)\b/i;

/**
 * Split a multi-item query string into individual clean action strings.
 * "Add 10 cy concrete and 200 lbs steel" → ["Add 10 cubic yards concrete", "200 lbs steel"]
 */
function splitIntoActions(text) {
  // Try splitting on action keywords first (handles "Add X include Y add Z")
  const parts = text.split(/(?=\b(?:add|estimate|i need|include|budget for)\b)/i)
    .map(s => s.trim())
    .filter(s => s.length > 3);

  if (parts.length > 1) return parts;

  // Fallback: split on conjunctions
  return text.split(SPLIT_PATTERN)
    .map(s => s.trim())
    .filter(s => s.length > 3);
}

/**
 * Apply all word replacements and clean up whitespace.
 */
function normalise(text) {
  let s = text;
  for (const [pattern, replacement] of WORD_REPLACEMENTS) {
    s = s.replace(pattern, replacement);
  }
  return s.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Main entry point.
 * Takes raw user input, returns array of clean English query strings
 * ready to be sent individually to the ML model.
 *
 * @param {string} rawInput
 * @returns {string[]}
 */
function preprocessInput(rawInput) {
  // 1. Normalise the whole string first
  const normalised = normalise(rawInput);

  // 2. Split into individual action clauses
  const parts = splitIntoActions(normalised);

  // 3. Normalise each part again after splitting (catches leftover artifacts)
  return parts
    .map(p => normalise(p))
    .filter(p => p.length > 2);
}

module.exports = { preprocessInput };
