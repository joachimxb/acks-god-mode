# Catalog generators

These scripts regenerate the large, generated reference-data engine modules from ACKS II RAW.
They were moved here from a gitignored `outputs/` folder (audit A7, 2026-06-24) so the catalogs
are **rebuildable and recoverable by anyone with the repo** — not just the maintainer's disk.

| Generator | Emits (committed) | Input | CI-reproducible? |
|---|---|---|---|
| `build_catalog.js` | `acks-engine-monsters.js` (284 monster stat lines) | `mm_parsed.json` (in this folder) | **Yes** |
| `build_encounter_tables.js` | `acks-engine-encounter-tables.js` (the JJ identity tables) | `../../../ACKS Sources/` JJ PDF + Markdown | No — needs RAW |
| `build_troop_catalog.js` | `acks-engine-troops.js` (TROOP_CATALOG + JJ_MASS_COMBAT) | `../../../ACKS Sources/` RR + JJ Markdown | No — needs RAW |

## Run them

```sh
npm run build:catalogs     # runs all three in order (monsters → encounter tables → troops)
```

Or individually: `node tools/build/build_catalog.js`, etc. Each writes its module to the repo root.
`build_catalog.js` honours `ACKS_CATALOG_OUT=<path>` to write elsewhere (used by the reproducibility
test to regenerate non-destructively).

## Why only the monster catalog is checked in CI

`build_catalog.js` reads only `mm_parsed.json` — a **prose-free** normalization of the Monstrous
Manual stat blocks (mechanical fields + page references only, the same IP posture as the shipped
`acks-engine-monsters.js`; see CLAUDE §13.6 / `SECURITY.md`). Because that input is committed and the
generator is self-contained, `tests/catalog-reproducibility.smoke.js` regenerates the catalog on every
CI run and asserts it matches the committed file byte-for-byte (CR-normalized).

The other two generators parse the **ACKS II rulebook PDFs / Markdown** under the DEV-root
`ACKS Sources/` folder. That folder is copyrighted RAW (§13.6) and is **not** in the repo, so those
two are **maintainer-run only** — run them locally when the upstream RAW or the parse logic changes,
then commit the regenerated module. The committed `mm_parsed.json` and `mm_catalog.json` here are the
only RAW-derived data kept in the repo, and both are mechanical-fields-only.
