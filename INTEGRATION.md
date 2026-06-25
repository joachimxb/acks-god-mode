# Integrating with ACKS God Mode — the `.acks.json` contract

ACKS God Mode is two things at once: a GM-facing app, and a **machine-readable world-state layer**. A campaign is a single self-describing `.acks.json` file, and the engine that reads and advances it is a set of plain JavaScript modules with **no UI dependency and no runtime dependencies** — so a companion tool, a Discord bot, an AI GM-assistant, or another game can read from and write to the same canonical state.

This document is the consumer contract: the on-disk shape, how to drive the engine headless, the rules a *writer* must follow, and the traps worth knowing before you start. (The app's own README is GM-facing; this is for builders.)

> **Stability:** pre-1.0, the contract may still change between minor releases — see [`CONTRIBUTING.md`](CONTRIBUTING.md). Use `engineVersion` (below) and feature-detection to stay robust across releases. At 1.0 the contract stabilizes (breaking changes bump `schemaVersion`).

---

## 1. The file at a glance

A campaign file is one JSON object. Its identifying fields:

```jsonc
{
  "schemaVersion": 2,            // breaking save-format version (see §6)
  "engineVersion": "0.24.0",     // the engine release that SAVED this file (see §6) — may be absent
  "kind": "campaign",
  "id": "cmp-…",
  "name": "The March of Saltspur",
  "currentTurn": 6,
  "currentDayInMonth": 1,
  "houseRules": { "vagaries-of-incursion": { "enabled": true }, … },
  "characters": [ … ], "domains": [ … ], "hexes": [ … ], "eventLog": [ … ],
  …                              // the rest of the top-level collections (§2)
}
```

Everything else hangs off **top-level collections** — flat arrays of entities with stable IDs. There is no free-text cross-referencing anywhere: every reference between entities is by `id`.

A machine-readable **JSON Schema** for the whole file ships at [`schema/acks-campaign.schema.json`](schema/acks-campaign.schema.json) (JSON Schema 2020-12). It's **generated** from the engine's own metadata (`scripts/build-schema.js`), so it can't drift from the code — point your validator / codegen / editor at it. It is deliberately lenient (objects allow extra properties; only id-class discriminators are required) so it accepts any valid save the engine writes.

---

## 2. Top-level collections

Every entity kind lives in exactly one top-level collection. The canonical list (collection → entity `kind` → ID prefix), as of this writing:

| Collection | `kind` | id prefix |
|---|---|---|
| `characters` | character | `chr-` |
| `parties` | party | `prt-` |
| `groups` | group | `grp-` |
| `domains` | domain | `dom-` |
| `hexes` | hex | `hex-` |
| `settlements` | settlement | `set-` |
| `rumors` | rumor | `rum-` |
| `ventures` | venture | `vnt-` |
| `stashes` | stash | `stash-` |
| `notableItems` | notableItem | `itm-` |
| `journeys` | journey | `jrn-` |
| `lairs` | lair | `lai-` |
| `encounters` | encounter | `enc-` |
| `dungeons` / `delves` | dungeon / delve | `dun-` / `dlv-` |
| `outposts` | outpost | `out-` |
| `projects` / `constructibles` | project / constructible | `prj-` / `cst-` |
| `units` / `armies` | unit / army | `unit-` / `army-` |
| `battles` / `sieges` | battle / siege | `btl-` / `sie-` |
| `vessels` | vessel | `vsl-` |
| `deities` / `congregations` / `divineFavors` / `attunements` | (Religion) | `dei-` / `con-` / `dfv-` / `att-` |
| `senates` / `factions` / `senatorships` | (Politics) | `sen-` / `fac-` / `snr-` |
| `hijinks` / `syndicates` | hijink / syndicate | `hij-` / `syn-` |
| `henchmanships` / `specialistContracts` / `hirelingContracts` / `magistracies` / `vassalages` / `tributaryAgreements` / `favorDutyObligations` | relation entities | `hen-` / `spc-` / `hir-` / `mag-` / `vas-` / `trb-` / `fdo-` |
| `eventLog` | event (wrapped — see §4) | `evt-` |

Some collections (e.g. `passiveInvestments`, `banks`, `loans`, `pendingEvents`, `itemCustody`, `vagaryOfIncursionEvents`) are reserved or used by specific subsystems; they appear in the schema as open arrays.

**Don't hard-code this table.** The engine is the source of truth, and the list grows. To enumerate it at runtime, load the engine (§5) and read the **Entity Registry**:

```js
ACKS.ENTITY_KINDS_LIST   // [{ kind, label, icon, addressable, chronicleable, list, find, displayName }, …]
ACKS.ID_PREFIXES         // { character: 'chr', domain: 'dom', … }
ACKS.listEntities(campaign, 'character')   // → the campaign.characters array
ACKS.findEntity(campaign, 'character', id) // → the entity, or null
```

### IDs

IDs are `prefix-suffix`. The suffix is a 7-char base36 string for runtime-minted ids (`chr-a3kp9wm`) or a human-readable slug in the shipped templates (`chr-marquis-aelric`); both share the prefix. **Mint ids the engine's way** — `ACKS.newId(ACKS.ID_PREFIXES.character)` → `chr-…`. (Note `newId` takes the *prefix*, not the kind name; pass `ID_PREFIXES[kind]`, not the kind string.)

---

## 3. Single home — top-level collections only (read this before you *read or write*)

A hex, a settlement, and a unit each live in **exactly one place** — the top-level collection. Membership is a pointer on the entity:

- a **hex** is `campaign.hexes[]`; it belongs to a domain via `hex.domainId` (a domainless hex — `domainId: null` — is unclaimed wilderness)
- a **settlement** is `campaign.settlements[]`; it sits on a hex via `settlement.hexId`
- a **unit** is `campaign.units[]`; it is stationed via `unit.stationedAt = { kind, id }` (`kind` ∈ `domain-garrison` | `character` | `army` | `hex` | `constructible`; `unit.homeDomainId` records the garrison it returns to)

> **There is no nested mirror.** Earlier files duplicated these under `domains[].geography.hexes[]` / `hexes[].settlement` / `domains[].garrison.units[]` / `characters[].mercenaryCompany.units[]`. Those paths are **gone** — neither read them nor write them.

To join the data: a domain's hexes = `campaign.hexes` filtered by `hex.domainId`; a hex's settlement = the `campaign.settlements` entry whose `hexId` matches; a domain's garrison = `campaign.units` whose `stationedAt` is `{kind:'domain-garrison', id: domainId}` (the engine exposes these as `ACKS.hexesForDomain` / `settlementForHex` / `unitsStationedAt`).

**Old files still load.** A pre-2026-06-21 `.acks.json` that carries the nested mirror is upgraded on load: the engine promotes each nested entry to the top-level collection (backfilling `domainId` / `hexId` / `stationedAt` from where it was nested), then strips the redundant mirror. **Headless consumers must run this upgrade by loading through `ACKS.loadCampaign(raw)` (§5)** — `migrateCampaign` alone does the schema bump but not the lift, leaving the nested copy in place and `campaign.hexes` empty. So a third-party *reader* of an old file should still prefer the top-level collection (the nested copy may lag); a *writer* always writes only the top level. (A naive deep-equality diff of an old save vs. a new one will differ structurally — the nested mirror is simply absent in the new one.)

---

## 4. The typed event log

`campaign.eventLog[]` is the append-only history and the primary write-back channel — every applied action is a typed event with a structured payload, status, timing, and a `parentEventId` for causal chains.

**⚠ The entry is a WRAPPER. The typed event is at `entry.event`, so the kind is `entry.event.kind` — not `entry.kind`.**

```jsonc
{
  "event": {                     // ← the event is HERE
    "kind": "treasury-grant",    // ← entry.event.kind, NOT entry.kind
    "id": "evt-…",
    "payload": { … },
    "status": "applied",
    "targetTurn": 6, "appliedAtTurn": 6, "appliedAtDay": 1,
    "gameTimeAt": { … }, "parentEventId": null,
    "cadence": "monthly-turn",
    "context": { "primaryHexId": …, "involvedHexIds": […], "settlementId": …, "domainId": …, "relatedEntities": [{kind,id,role}] },
    "subdayContext": null
  },
  "result": { "narrativeSummary": "…", … },   // the applied outcome
  "appliedAtTurn": 6, "appliedAtDay": 1, "appliedAt": "2026-06-14T…Z"
}
```

```js
// iterate kinds correctly:
campaign.eventLog.map(e => e.event.kind)        // ✓
campaign.eventLog.map(e => e.kind)              // ✗ → all undefined
```

Each event's `context` envelope records the entities it touched, which powers the derived per-entity history accessors (`ACKS.hexHistory(campaign, hexId)`, `ACKS.characterHistory`, `ACKS.domainHistory`, …). The full kind list is `ACKS.EVENT_KINDS`; required/optional payload fields per kind are in `ACKS.EVENT_SCHEMAS` (`{ R: {field:type}, O: {field:type} }`). `ACKS.validateEvent(event)` checks a single event.

---

## 5. Driving the engine headless

The engine modules are IIFEs that assemble a single `ACKS` namespace. In Node they also `module.exports` it; in a browser they attach to `window.ACKS`. There are **no runtime dependencies** — `package.json` exists only to run the test suite.

The one place the module load order is declared is [`tests/_engine.js`](tests/_engine.js); reuse it so you can't get the order wrong:

```js
// open a campaign, advance one monthly turn, write it back — entirely in Node, no browser.
const { load } = require('./tests/_engine.js');   // loads all acks-engine-*.js in the right order
const ACKS = load();                              // → the ACKS namespace (1300+ functions)
const fs = require('fs');

const campaign = ACKS.loadCampaign(JSON.parse(fs.readFileSync('campaign.acks.json', 'utf8')));

const proposal = ACKS.proposeMonthlyTurn(campaign);  // pure: compute the month's deltas
ACKS.commitTurn(campaign, proposal);                 // apply them (income, morale, events, …)

const out = ACKS.stampCampaignForSave(campaign);     // save-ready clone, engineVersion stamped (§6)
fs.writeFileSync('campaign.acks.json', JSON.stringify(out, null, 2));
```

**Open a file with `ACKS.loadCampaign(raw)`, not `migrateCampaign` alone.** `loadCampaign` is the complete load entry: it runs `migrateCampaign` (the idempotent schema-forward reconcilers) **and then** the load-bearing lift/strip steps that populate the top-level collections — promoting any legacy nested mirrors (`domains[].geography.hexes[]`, `hexes[].settlement`, garrison units, stronghold components) up to `campaign.hexes` / `campaign.settlements` / `campaign.units` and stripping the redundant copies (§3). `migrateCampaign` on its own does the schema bump but **not** the lift, so a pre-2026-06-21 file opened with `migrateCampaign` alone can leave `campaign.hexes === undefined` — the data is still trapped in the nested mirror. `loadCampaign` returns a fully-populated campaign and is the same path the app loads through, so headless and in-app load behave identically. (`migrateCampaign` stays public for callers that specifically want only the schema-forward step.)

`proposeMonthlyTurn(campaign, { rng })` / `commitTurn(campaign, proposal, { rng })` accept an injectable `rng` for deterministic, scriptable turns (defaults to `Math.random`). The whole ACKS economy ruleset (income/expense/morale/tribute) lives in `acks-engine-economy.js` and is pure `(campaign, domain)` — callable directly.

If you're not vendoring the repo's `tests/` folder, `require()` the engine modules yourself in the order `tests/_engine.js` lists (catalogs → monsters → encounter-tables → troops → engine → entities → economy → entity-registry → field-schemas → events → battles → maneuvers → subsystems → then any remaining `acks-engine-*.js`).

**Validate a campaign you've built or received:** `ACKS.validateCampaign(campaign)` → `{ ok, errors[] }` with specific messages. **Serialize a campaign for save:** `ACKS.stampCampaignForSave(campaign)` (§6) — pure; stamps the generation tag and dates; never mutates the input.

---

## 6. Versioning: `schemaVersion` vs `engineVersion`

Two distinct version fields, for two distinct questions:

- **`schemaVersion`** (currently `2`) is the **breaking save-format version**. It bumps only when old saves can no longer load. It has been `2` since launch; the engine evolves the v2 shape forward additively (new collections, new fields) via idempotent reconcilers that run on every load — so **`schemaVersion` cannot tell you which generation of the tool wrote a file**. A `schemaVersion: 2` save might predate or postdate `units`/`armies`/`encounters`. Don't version-detect on it; **feature-detect** (`if (campaign.units) …`).

- **`engineVersion`** (e.g. `"0.24.0"`) is the **engine release that *saved* the file** — equal to `package.json`'s `version` / `ACKS.ENGINE_VERSION`. It's stamped at **save time** (by `ACKS.stampCampaignForSave`), so it tells a reader the file's generation across releases. **It may be absent**: files written before this field existed (≤ v0.24), and the bundled `Templates/` (which are deliberately byte-identical to their migrated form, so loading one changes nothing — `engineVersion` is *not* injected on load). **Treat absent as "pre-engineVersion"; feature-detect either way.**

```js
const writtenBy = campaign.engineVersion || '(pre-engineVersion, unknown)';
const hasWarfare = Array.isArray(campaign.units);   // feature-detect, don't trust a version number
```

When you write a campaign back, go through `ACKS.stampCampaignForSave(campaign)` so your output carries the current `engineVersion` — that's what lets the *next* reader detect its generation.

---

## 7. Writing back — the two paths

1. **Emit a typed event** (the preferred, auditable path). Construct it with `ACKS.newEvent(kind, opts)`, validate with `ACKS.validateEvent`, and apply with `ACKS.applyEvent(campaign, event)` — application is transactional (all-or-nothing). Use this for state changes you want recorded in the log with attribution (`submittedBy: 'tool:my-bot'` / `'agent:…'` / `'player:…'`).

2. **Mutate the data directly** (for bulk authoring or fields without an event verb), then `ACKS.validateCampaign` before saving. Respect the canonical-home rule (§3): write top-level collections only.

Either way, finish with `ACKS.stampCampaignForSave` (§6) before serializing.

> **⚠ Treasury is dual-homed — don't write `domain.treasury.gp` directly.** A domain's gold is held in two places that must agree: the scalar `domain.treasury.gp` and a `domain-treasury` Stash (the canonical balance). The engine keeps them in sync through one writer — `ACKS._applyDomainTreasuryDelta` (and the `treasury-grant` event, the auditable path of choice). If you bypass that and assign `domain.treasury.gp` directly, the stash and the scalar diverge and downstream reads (income, banking, save) disagree. So: prefer a `treasury-grant` event; if you must mutate directly, update **both** homes, or set the scalar and then call `ACKS.reconcileTreasuryScalars(campaign)` before validating/saving (it re-derives the scalars from the canonical stashes).

---

## 8. Regenerating the schema (maintainers)

The committed schema is generated, and a smoke test (`tests/schema.smoke.js`) fails if it goes stale:

```sh
node scripts/build-schema.js            # regenerate schema/acks-campaign.schema.json
node scripts/build-schema.js --check    # CI: exit 1 if the committed file is out of date
node scripts/build-schema.js --stdout   # print without writing
```

Run it after any change to `ENTITY_KINDS_LIST`, `FIELD_SCHEMAS`, or `EVENT_KINDS`, and commit the result.

---

*ACKS God Mode is an independent community tool, not affiliated with Autarch / Imperial Imprint. The engine implements ACKS II mechanics; the `.acks.json` contract above is the tool's own data model.*
