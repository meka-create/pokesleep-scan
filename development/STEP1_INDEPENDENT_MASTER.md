# STEP 1: Self-owned master and future food images

The OCR PWA fetches upstream from nitoyon/pokesleep-tool directly, never via AI Scan.
Actions run an isolated read-only source clone daily, validate and atomically publish a master plus SHA-256 receipt.
Unexpected upstream data, translations or missing numerical metadata hold the active version.
Clients verify the receipt+SHA-256 and use the old bundled snapshot on failure.

New food images are not scraped automatically. Approved transparent food sprites may
be committed under assets/food-icons/<ingredient key>.png. The daily workflow
registers them as color-feature templates, updates missingFoodTemplates and bumps
the PWA release. Missing sprites are always review-gated; never guessed.

Run: python -m unittest discover -s development -p 'test_master_auto_update.py' -v
October 5 additions are exercised by a synthetic 247-to-249 migration.
STEP 3 remains responsible for live pokesleep-tool importer compatibility acceptance.

New food coefficients are parsed from the upstream PokemonRp.ts integer-literal table.
A missing coefficient or changed legacy coefficient FAILS CLOSED. New sprites remain
human-review-only until verified against actual Pokémon Sleep screenshots; registering
a PNG alone does not authorize automatic certainty.
