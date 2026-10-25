# STEP 1: Independent automatic master updates

The OCR PWA receives data directly from nitoyon/pokesleep-tool, without
depending on AI Bukkomi Scan. The scheduled check runs at **午前4:00 JST**
(UTC cron `0 19 * * *`). A structurally valid upstream change is automatically
promoted with a validated SHA-256 receipt. New species and legitimate existing
species updates do **not** require per-release manual precision approval.

The target "zero false automatic confirmations except nicknames" refers to
the **meka142 Golden 142 screenshots** in STEP 2; it is not a blanket ban on
recognizing future Pokémon. Supported new species enter normal inference
and CSV workflows immediately.

New ingredients with valid energy coefficients and icon templates follow the
same matcher as current ingredients. If the icon template is actually missing,
that individual ingredient remains review-gated rather than guessed. Missing
computation parameters or malformed upstream inputs HOLD the update and
preserve the last functioning master. These are actual compatibility problems,
not a requirement to manually approve every added species.

Approved PNG icon images under `assets/food-icons/<ingredient key>.png` can be
registered with `development/register_food_icons.py`. Images are not scraped
automatically.

On a failed/stale verification or browser master load error, an unframed ⚠️
appears to the left of TIPS. It never opens a modal automatically. On tapping,
a modal opens with only an upper-right ×.

Deployment uses the repository's **single native GitHub Pages branch publisher**
from `main`. Both normal and `github-actions[bot]` pushes were confirmed to
trigger `pages build and deployment` on October 25, 2026. Do not add a second
`actions/deploy-pages` job to this master-sync workflow: parallel deployment
requests resulted in an actual GitHub Pages HTTP 400 in-progress collision.
The `publish-status` job commits only the final health JSON and manifest to
`main`; the built-in Pages publisher handles site publication.

The synthetic October 5 247→249 migration and existing/upcoming species
recognition tests belong to STEP 1. meka142 OCR vs Golden belongs to STEP 2;
live pokesleep-tool importer verification belongs to STEP 3.
