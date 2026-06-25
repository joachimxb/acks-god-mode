# Architecture

A map of the codebase for contributors. ACKS God Mode is a single-page app with **no build step
and no runtime dependencies** — open `index.html` in a browser, or load the engine headless in Node.
If you're integrating against the save format rather than changing the code, read
[`INTEGRATION.md`](INTEGRATION.md) instead; this doc is for people editing the tool.

## The three layers

1. **Engine modules — `acks-engine*.js` (pure rules, data, and state).**
   Each module is an IIFE that `Object.assign`s its functions onto one global `ACKS` namespace
   (and `module.exports` in Node). There is **no DOM, no UI, and no third-party dependency** in this
   layer — it loads and runs headless in Node, which is what the test suite and any integrator use.
   This is where rules math, entity factories, schema migrations, the typed event system, and the
   turn/day engine live. Modules are split by subsystem (`acks-engine-economy.js`,
   `acks-engine-battles.js`, `acks-engine-religion.js`, …); reference data that's large enough to
   matter ships as generated modules (`acks-engine-monsters.js`, `-troops.js`, `-encounter-tables.js`
   — see [`tools/build/`](tools/build/)).

2. **The Alpine UI — `domain-app.js` + `domain-app-*.js` (all view logic).**
   `domainApp()` is the single Alpine component (`x-data="domainApp()"`). It holds the app's reactive
   state and methods, and reaches the engine only through `window.ACKS.*` — the UI never re-implements
   a rule. It's large, so it's split into ~20 **feature mixins** (`domain-app-map.js`,
   `domain-app-trade.js`, `domain-app-chronicle.js`, …) plus a core `domain-app.js`.

3. **The page — `index.html` (template + load order).**
   The HTML template (Alpine directives — `x-for`, `x-show`, `x-model`), the `<head>` `<script>` load
   list that pulls in the engine modules and the **vendored** Alpine + Tailwind (under `vendor/`,
   self-hosted so the app runs fully offline), and a small amount of inline glue. The `<head>` also
   carries the Content-Security-Policy and the favicon.

## Load order, and why it matters

`index.html`'s `<head>` loads the engine modules in dependency order before the UI:

```
catalogs → monsters → encounter-tables → troops → engine (core) → entities → economy →
entity-registry → field-schemas → events → battles → maneuvers → subsystems → … feature
modules … → player-view (LAST) → domain-app.js + domain-app-*.js → Alpine (deferred)
```

The rules: **reference data and the core engine load first** (everything downstream reads them);
**`acks-engine-player-view.js` loads last** because its redaction serializer depends on every entity
and predicate module; **the UI loads after the whole engine** (it reads `ACKS`); **Alpine loads
`defer`red**, so the DOM and `domainApp()` exist before it initializes. Many feature modules
*late-bind* — they call `global.ACKS.x` at call time rather than capturing it at load — so their order
relative to one another doesn't matter; the inline comments in the `<head>` note which.

## The mixin merge (in three sentences)

Each `domain-app-*.js` mixin pushes a plain members object onto a global registry
(`window.__ACKS_APP_MIXINS__`). When Alpine instantiates the component, `domainApp()` builds the core
component literal and then merges every registered mixin onto it via `_acksApplyAppMixins`, which
copies property *descriptors* (so getters stay getters, not snapshotted values). Load order between
mixins is therefore irrelevant — the merge runs once, at component-creation time.

## To add a feature, you'll typically touch four things

| Layer | File | What goes here |
|---|---|---|
| Rules/data | `acks-engine-<feature>.js` (a new engine module) | the state shape, factories, any schema migration, the rules math; self-registers its ID prefixes / collections / event kinds / day-tick or monthly consumers. Add its `<script src>` to the `index.html` `<head>` load list. |
| UI logic | a `domain-app-<feature>.js` mixin (or extend an existing one) | the component methods and getters that drive the view, calling `window.ACKS.*`. |
| Markup | a region in `index.html` (a tab, sub-view, or modal) | the Alpine template. |
| Test | `tests/<feature>.smoke.js` | headless engine assertions — auto-discovered by `tests/run.js`, so no runner edit. |

Keep canonical state in the engine and the save file; keep computed/derived values in the UI. Every
cross-entity reference is by stable `id`. New optional/variant rules go in the house-rules registry
(default off) — never hardcoded.

## Where the rest of the docs live

- **The save format & headless engine API** (entity shapes, fields, IDs, the event log, how to drive
  a turn in Node): [`INTEGRATION.md`](INTEGRATION.md) + the generated JSON Schema at
  [`schema/acks-campaign.schema.json`](schema/acks-campaign.schema.json). *(Source comments sometimes
  cite an internal `Data_Dictionary.md` / `Schema_v2_Design.md` — those are the project's private
  design notes; the public, authoritative equivalents are INTEGRATION.md and the schema, which is
  generated from the engine so it can't drift.)*
- **Contribution / branch / release policy:** [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **Security posture (CSP, vendored deps, reporting):** [`SECURITY.md`](SECURITY.md).

## Verifying a change

```sh
npm test             # glob-runs every tests/*.smoke.js headless (engine + UI parse + behavior)
npm run lint:engine  # engine module-boundary check (no bare cross-module private call)
npm run lint:docs    # public docs vs the engine (no removed token referenced as live)
```

`tests/index-parse.smoke.js` guards that `index.html` and `domain-app*.js` parse and that the `<head>`
(CSP, no remote scripts) is well-formed; `tests/behavior.smoke.js` loads the whole app in jsdom and
exercises the highest-consequence flows (save/load round-trip, import merge, a one-turn commit).
