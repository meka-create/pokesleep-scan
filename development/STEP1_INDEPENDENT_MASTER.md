# STEP 1: Independent automatic master updates

The OCR PWA receives data directly from nitoyon/pokesleep-tool, without
depending on AI Bukkomi Scan. The scheduled check runs at **午前4:17 JST**
(UTC cron `17 19 * * *`; GitHub scheduling may still be delayed). A structurally valid upstream change is automatically
promoted with a validated SHA-256 receipt. New species and legitimate existing
species updates do **not** require per-release manual precision approval.

The target "zero false automatic confirmations except nicknames" refers to
the **meka142 Golden 142 screenshots** in STEP 2; it is not a blanket ban on
recognizing future Pokémon. Supported new species enter normal inference
and CSV workflows immediately.

**New ingredients require the owner's explicit per-ingredient approval after
their actual in-game release.** `APPROVED_NEW_INGREDIENTS` in
`development/master_auto_update.py` starts empty; an upstream coefficient
becoming positive does NOT constitute approval. New ingredient keys are listed
in `pendingIngredients`, but omitted from the installed master and CSV.
Otherwise-valid new Pokémon that use unapproved ingredients remain deferred as
provisional; unrelated new Pokémon and existing-species improvements continue.
Draft unapproved food may also have an unfinished, duplicate, or invalid
Japanese translation or a nonnumeric provisional energy expression. These
unpublished values are isolated from the published 19-ingredient validation;
approved and existing ingredient labels and coefficients remain strict.
If an installed species starts using an unapproved ingredient, the entire
update is held to prevent corrupting its known food options. After explicit
approval, a positive verified coefficient and the existing asset validation
remain required. Missing icon templates stay review-gated.
Malformed existing data and unsafe upstream changes still HOLD the update.
This ingredient-specific approval is separate from the normal automatic
introduction of new Pokémon.

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
