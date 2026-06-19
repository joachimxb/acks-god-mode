# Magic Items W2 — commissioning (the Command exemplar) + the Traits content pack

**Lane:** `b8-magicitems` · **Branch:** `feature/magic-items-w2` · **Base:** `team/b8-base@1f561d4` · **Preview:** port 5644
**Status:** built + browser-verified; **awaiting Lead integration.** (Builder — no PR, no merge.)

---

## What shipped (#143 W2, on top of the shipped W1 economy)

Two slices, both **extending the shipped `acks-engine-magic-items.js`** (W1) — no new module.

### 1. Commissioning — the first big *Command* exemplar (Architecture §12; TT p.28)
A costed, timed, can-fail in-fiction action that yields a magic item, by **routing into the SHIPPED Magic Research item-creation kind** (`acks-engine-magic-research.js`) — **read/invoked, never edited.** The commissioner pays (GP Wave B); the NPC caster researches.

- **The cost model (TT p.28 — 3× base):** material 1× + component 1× up front + research 1× **on success**.
  - **Issue** (`commissionMagicItem`): the commissioner pays the up-front 2× via GP Wave B — material → the caster's purse (funds the engine's `startResearchProject` debit, net caster 0) + component → `external` (consumed; the throw later runs `gmOverride` so the engine neither re-charges nor penalizes the pre-paid component). Then it starts the routed `item-creation` research project and stamps a **defensive `project.commission` rider** (no new entity/collection — a commission *is* a funded item-creation project).
  - **Resolve** (`resolveCommission`): the research labor accrues through the **shipped** `processResearchForTurn` (already hooked into `commitTurn` — **zero new commitTurn hook**), then the throw runs through `payAndRollResearchThrow(gmOverride)`. On success → the minted item's custody re-homes to the commissioner (maker provenance stays the caster, so it sells ×2) + the research fee 1× is paid commissioner → caster (the caster's professional pay; flagged *owed* if the patron is now short). On failure → the up-front 2× is lost (RR p.388 total loss); the fee never fires. A GM `expedite` lever fast-forwards the months of research labor.
- **The caster is a funded pass-through** — never out of pocket; the commissioner bears the whole 3× (2× on failure).
- **Verbs:** `commissionMagicItem` · `resolveCommission` · `commissionPreview` (pure forecast: price/eligibility/affordability/throw-chance) · `commissionCosts` · `commissionStatus` · `isCommission`/`findCommission`/`commissionProjects`/`activeCommissions`/`commissionsFor`.
- **2 record-only events:** `magic-item-commissioned` · `magic-item-commission-resolved` (share `applyEvent_magicItemAudit`; wizard-opt-out).
- **UI:** a **🛠 Commission…** button + a **Commissions card** (in-flight % / delivered ✓ / failed ✗ + 🎲 Roll / ⏩ Expedite-roll / open-item) on the shipped 🪄 Magic Items tab; a **Commission modal** (patron/caster/item pickers + a live forecast + a disable-with-reason submit) at the `@b8-magicitems` modal marker.

### 2. MI-5 — Magic Item Traits (the optional content pack; JJ p.172)
- A `MAGIC_ITEM_TRAITS` catalog of **12 archetypes** across 5 categories (sensory / behavioral / boon / bane / sentience) — **⚠ IP-safe: our own one-line wording + a `JJ p.172` page-ref, NOT the d% table prose** (the monster-catalog posture).
- Behind the new **`magic-item-traits` house rule** (category `characters`, **default OFF** — §6 polarity; hidden + non-functional when off, principle 8).
- Verbs: `assignMagicItemTrait` / `rollMagicItemTrait` / `removeMagicItemTrait` / `magicItemTraits` / `itemHasTrait` / `magicItemTraitsEnabled` / catalog reads. Writes `notableItem.intrinsic.traits[]` **defensively** + an item-history line; **NO new event kind** (benign GM authoring).
- **UI:** a gated **✨ Traits** panel in the shipped item-detail modal (add / 🎲 roll / remove + the archetype notes).

**A magic item stays a `notableItem`; buy/sell stays the shipped market verbs** (W2 adds neither).

---

## Footprint (for the manifest reconcile)
- **House rules:** +1 (`magic-item-traits`, default OFF) → as manifested.
- **Event kinds:** +2 (`magic-item-commissioned`, `magic-item-commission-resolved`) → as manifested.
- **Entity kinds / ID prefixes / collections / day-tick slots / save migration:** **NONE** (a commission rides its research project; a trait rides `intrinsic`). The 6 templates + demo stay migrate-no-ops.
- **commitTurn:** **no new hook** (leans on the shipped `processResearchForTurn`).
- **Files (mine + shared append-targets):** `acks-engine-magic-items.js` (owned) · `tests/magic-items.smoke.js` (owned) · `_handoffs/Magic_Items_W2.SUMMARY.md` (owned) · `acks-engine-events.js` (4 labeled `=== Magic Items W2 (burst8) ===` sub-blocks: KINDS / SCHEMAS / handler / WIZARD_OPTOUT) · `acks-engine-catalogs.js` (1 labeled house-rule sub-block) · `index.html` (3 edits — the tab in-place + my `@b8-magicitems` modal & methods markers) · `CHANGELOG.md` (folded into the unreleased W1 entry, §14.6).

## ⚠ Schema (per the manifest)
`schema/acks-campaign.schema.json` is **left stale** + `schema.smoke` **RED** on this branch (the 2 new event kinds). I confirmed the regen diff is **exactly my 2 kinds** (+ a benign `item-appraised` comma reshuffle), then reverted it. **Lead: regenerate once at integration** (`node scripts/build-schema.js`).

## Verification
- **`npm test`: 66 suites PASS, 1 FAIL (`schema.smoke` only — expected).** `magic-items.smoke` **161/0** (W1 89 → +72 W2). `index-parse` 7/7. No other suite perturbed by the catalogs/events edits.
- **Browser-verified end-to-end on :5644** (the real in-browser engine, the cross-module load-order proof Node can't give): the full commission flow runs through the page — preview (price 45000 / chance 0.6) → issue (patron −30000 up-front, caster funded net-0, routed `item-creation` project, `magic-item-commissioned`) → resolve-success (item minted, **maker provenance = caster, custody = commissioner, patron −45000 total = 3×, caster +15000 fee**, all 5 events in order); the fee-owed path exercised naturally (a broke patron → delivered + flagged owed); the failure path (up-front lost, no item); the Traits panel (enable rule → assign + 🎲 roll → archetype notes + remove). **Zero console errors from any W2 expression** — the only warnings are the documented pre-existing Tailwind-CDN + Review/Events (`reviewDailyRows`/`filteredEventLog` "reading 'after'") ones, fired by my minimal hand-built test campaign (no calendar), in code paths W2 doesn't touch.

## What to test (Joachim)
1. World ▸ 🪄 **Magic Items** ▸ **🛠 Commission…** → pick a **patron** (anyone with gp), an **arcane caster** (a character flagged arcane / an arcane class), and an **item** → the forecast shows the 3× price + the caster's success chance → **Commission** debits the up-front 2×.
2. The new **🛠 Commissions** card lists it *researching* → **Advance Month** a few times to let the work accrue (or **⏩ Expedite + roll**) → **🎲 Roll**: on a success the item is delivered to the patron (open it) and the fee is paid; on a failure the up-front is lost.
3. ⚙ **House Rules** ▸ 👥 Characters ▸ enable **Magic item traits** → open any magic item → the **✨ Traits** panel: add a quirk or 🎲 roll one.

---

## `## Doc-delta` — for the Lead to apply to the canonical DEV-root docs (§8.9)
*(Builders don't edit CLAUDE/Architecture/Coverage/Mechanic-Extensions/Data_Dictionary/plans — this is the ready-to-apply content.)*

**`ACKS_Mechanic_Extensions.md`** — under the Magic-layer / Magic-Items section, add:
> **🔧 Magic Items W2 — commissioning (the Command exemplar).** A commission (TT p.28, 3× base = material 1× + component 1× up front + research 1× on success) is built as the first big **Command** (Architecture §12): a costed/timed/can-fail action that yields an entity by **routing into the shipped Magic Research item-creation kind** — the commissioner pays via **GP Wave B**, the NPC caster researches via the shipped `processResearchForTurn` (no new commitTurn hook). The commission is a **defensive `project.commission` rider on its research project** — no new entity/prefix/collection. The component is pre-paid at issue + supplied penalty-free at the throw (`payAndRollResearchThrow` `gmOverride`); on success custody re-homes to the commissioner (maker provenance stays the caster → sells ×2), the fee 1× is paid (flagged *owed* if short); on failure the up-front 2× is lost. Verbs: `commissionMagicItem` / `resolveCommission` (+ `expedite`) / `commissionPreview` / `commissionStatus` / lookups. Events: `magic-item-commissioned`, `magic-item-commission-resolved` (record-only, wizard-opt-out).
> **⚙️ `magic-item-traits` (MI-5, default OFF; JJ p.172).** An optional content pack of 12 per-item quirk **archetypes** (sensory/behavioral/boon/bane/sentience) — ⚠ IP §13.6: our own wording + a page-ref, not the d% table prose. Written defensively to `notableItem.intrinsic.traits[]`; no event kind. Hidden + non-functional when off (principle 8).

**`ACKS_Implementation_Coverage.md`** — flip/extend the #143 magic-item rows: Commissioning (TT p.28) → ✅ W2; Magic Item Traits (JJ p.172) → ✅ W2 (default-OFF pack). Add to the Magic Items / #143 phase-row: "W2 commissioning + traits shipped (burst8)."

**`Data_Dictionary.md`** — §1 house-rules: add `magic-item-traits` (characters, default OFF). Event kinds: add `magic-item-commissioned` / `magic-item-commission-resolved` (record-only). Note (no new prefix/entity): a commission = a defensive `project.commission` rider on a `researchProjects[]` item-creation project (`{commissionerCharacterId, casterCharacterId, sourceHandle, baseCost, upFrontGp, researchFeeGp, commissionPriceGp, status, feePaid, feeOwedGp, notableItemId, issuedAtTurn, resolvedAtTurn}`); a trait = `notableItem.intrinsic.traits[]` (`{key,name,category,note,pageRef,gmNote,assignedAtTurn}`).

**`Phase_3_Magic_Items_Plan.md`** — status header: **W2 ✅ SHIPPED (burst8)** — commissioning (MI-4, the Command) + Magic Item Traits (MI-5). Update §7 wave sketch (MI-4 + MI-5 done) and §8 OQ2 (resolved: routes into the *shipped* Magic Research, not a stub). Remaining: the named-catalog deepening (IP).

**`CLAUDE.md` §8** — add a burst8 carry-forward bullet (Lead's consolidated one): "Magic Items W2 — commissioning (the first Command; routes into the shipped Magic Research) + the optional Magic-Item Traits pack (`magic-item-traits`, default OFF). +2 events, +1 house rule, no entity/prefix/migration; magic-items.smoke 161."
