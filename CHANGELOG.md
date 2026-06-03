# Changelog

All notable changes to ACKS God Mode are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Reassign a hex to a different domain from the hex detail panel.** The hex popup now has a **Domain** dropdown — every domain, plus *Unclaimed wilderness* — so you can move a hex between realms (or release it to the wild) without leaving the panel; it re-homes the hex and re-anchors the open panel to it. Previously this was only possible from the map's Add/Edit-hexes mode.

### Fixed
- **A hex's coordinate now reads the same in the editor as on the map.** The hex editor's coordinate field showed the internal axial `(q, r)` while the map and the hex name showed the GM-familiar column·row hex number — so the same hex appeared to carry two different numbers (a hex at column 151, row 099 displayed as "151174"), and a column·row number typed straight into the editor landed in the wrong place. The editor (and the Inspector's coord field) now work in **column·row** — the convention published Auran/JG maps use, and the one the map labels already showed — with the internal axial value shown on hover. Type a column·row hex number — leading zeros and all (e.g. "099") — and it reads back the same and sits where it should. Hex numbers now read as a zero-padded, run-together column·row — `151099` (column 151, row 099), each part padded to a uniform width so the number splits cleanly into column and row — rather than the ambiguous `15199`. The remaining places that still showed a bare `(q, r)` — settlement and improvement tables, journey destinations, character-location pickers, hex search — now read column·row too. Axial stays the internal store, so existing campaign files load unchanged.

## [0.13.0] - 2026-06-02

### Added
- **Campaign map — a clickable, zoomable, layered hex map of the world** (a new 🗺 Map view under the World tab). Every hex renders as a flat-top hexagon in its true position, labelled with a RAW-style column-row coordinate (RR p.273); **scroll to zoom, drag to pan**, and **click a hex to open its existing card**. Three kinds of layer build the map you expect:
  - **Color by** (one at a time, with a legend) — **terrain** (ten base types — nine land plus **open water** for oceans, seas, and big lakes), **domain** (a stable colour per realm; unclaimed grey), **land value** (3–9 gp/family heatmap, RR p.341), **classification**, **population** (vs the RR p.340 ceiling), **domain morale**, **secured** (stronghold adequacy, RR p.338), **economy**, and **exploration**.
  - **Symbols** (toggleable) — settlements as circles sized by market class (RR p.351), strongholds, and lair / dungeon / point-of-interest markers.
  - **Edges** (toggleable) — computed **domain borders**; **rivers** drawn along hex edges; **roads** running from a hex's centre out to its sides (bending through the centre with a faintly circular curve); **trails**; and **ford/bridge** marks where a river is crossed. Active **journeys** show their route as a highlighted path with a marker at the party's current hex.
  - A one-click **Standard view** sets the familiar composite, and an **Add/Edit hexes** mode lets you click an empty cell to **create** a hex or click an existing hex to quickly **edit** it — setting its domain (including assigning an unclaimed wilderness hex to a domain), its terrain (now including open water), and its **rivers, roads, and crossings**: on a small hex diagram, click a side to run a **road** out from the centre, or cycle a side through **river → river + ford/bridge → none**; a road that crosses a river is automatically bridged. The first time the map reaches *and* shapes the lands between domains.

  It is a pure view of the hexes you already have — nothing new is written to your campaign file — and the first surface that makes the whole world legible at a glance.

### Changed
- **The World tab is now a hub for Map, Domains, and Hexes.** Map, Domains, and Hexes are sub-views under World (in that order) rather than separate top-level tabs — Domains, previously its own top-level tab, now lives under World ▸ Domains. The tool still opens on the domain manager (now World ▸ Domains), and which World sub-view you were last on is remembered across reloads.
- **Hexes now have a consistent name everywhere they're referred to** — `<Settlement> (coords)` if the hex has a settlement, otherwise `<Terrain> (coords)` (e.g. "Saltspur (0000)", "Forest (0100)"). It shows in the hex card, World › Hexes, the Inspector, journeys, and character locations — replacing the bare `(q, r)` coordinates that appeared before. (The terse number at the top of each hex on the map is unchanged.)

### Removed
- The unused `hex.riverCount` field. It was never wired to anything and cited a movement-cost rule that doesn't exist in RAW; rivers are now modelled as the edges they run along, with ford/bridge crossing marks. (Dropped automatically when a campaign loads — no action needed.)

## [0.12.0] - 2026-06-02

### Added
- **Journeys panel — plan and run overland travel from the interface** (Activities › Journeys). A guided **Start a journey** action picks the travellers (individual characters or a whole party, with the mercenaries that travel with them, RR p.166), a start and destination hex (plus optional waypoints), and starting rations — with a distance-and-days forecast before you commit. A **Journey Detail** panel shows the route, a day-by-day log (each day's navigation throw in full, with a GM **reroll** on the current day), a supplies tracker with low-stock warnings, a **Members** table (each traveller, their survival conditions, and their mercenaries), and **Tick day** / **Abort** controls; **pace and travel mode** are set on the journey itself (and can be changed mid-journey). **Send on journey** shortcuts sit on the character sheet, the party panel, and the hex card (which also lists journeys passing through it). Advancing a journey runs through the shared **Day Clock** — the same propose → review → commit as construction — so travel stays in lockstep with the calendar, and it is RAW-accurate: pace is **Normal / Half speed (×½) / Forced march (×1½, fatigued at once)** (RR pp.272, 279) and survival reads **Hungry → Underfed → Starving** with a single **Dehydrated** stage (RR p.276). (The travel engine shipped in 0.11.0; this release makes it hands-on.)
- **Parties panel — founder-based parties you can send travelling together** (Characters › Parties). **+ New party** picks a founding character; the party is named after them, placed at their hex, with the founder as the first member and leader. Members are added from the **same hex** (so a party gathered in one place can set out together); the leader is marked ★ and reassigns automatically, or by **make leader**; and the party's name, notes, and current hex are **lock-edit** fields logged on save. Member names open the character sheet, and each member's **Mercenary Company** (RR p.166) rolls up into a party headcount total.

### Changed
- **Ventures: eligibility, a clearer ETA, and a labelled GM override.** A character already away on a venture (or a journey) is now **hidden from the New-venture and Start-a-journey pickers** until they return (RR pp.370–380 — one active venture per character); their sheet shows a **🛒 On venture →** link instead. The **Turns** column now reads the **time until arrival** ("in 2 turns" / "ARRIVED") rather than an absolute turn number, and while a venture is still in transit its arrive action reads **GM-arrive** (signalling a forced early arrival), flipping to **→ arrive** once it's due.
- **The day-tick review reads more clearly.** The "Paused for review" note now appears **only when a multi-day advance (a week / month) actually stopped early** — a single **+1 day** no longer shows it (the review always opens for one day) — and when it does, it says how far it got. With several day-aware activities in flight, each one's warnings (lost / hungry / dehydrated / encounter) are listed beneath **its own** record rather than in one shared pile.

### Fixed
- **Overland travel speeds and getting-lost throws now match the rules as written** (RR pp.272–278 / JJ p.38). **Fog and snow halve** travel speed, and **frigid or sweltering** temperature halves it; **mud or snow** underfoot halves it; **rain and storms do not reduce base travel speed** (a storm is an activity-penalty condition, not a speed reducer — RAW has no ×¼ weather); and the worst terrain is dangerous to navigate again — **dense scrubland** (8+) and **forested swamp** (14+) carry their tougher getting-lost throws instead of their easier cousins'.
- **Editing a per-hex family count (or the domain-level Peasant families field) no longer throws an error and reverts the edit.** The internal sync that keeps the domain total and per-hex counts in agreement was calling engine helpers that weren't reachable from the event module; it now routes through the exported setters.

## [0.11.0] - 2026-06-01

### Added
- **Groundwork for overland travel** (engine + data layer — there's no Journeys UI yet). Under the hood, the engine can now model a journey day by day — movement, navigation, rations, and fatigue (JJ p.84), advanced by the Day Clock. You can't plan or run one from the interface yet; a dedicated Journeys panel comes in a later release. This release just lays the foundation it will build on.

### Changed
- Internal travel logistics default to RAW (rations + the six-day fatigue cycle, JJ p.84); the `simplified-fatigue` and `ignore-rations` opt-out house rules are reserved for when the travel UI ships.

### Removed
- Two unused placeholder house rules (`realistic-fatigue`, `mandatory-rations`), folded into the RAW-default approach above.

### Fixed
- **House-rule toggles now take effect for rules stored as a bare boolean.** Some rules (e.g. families-per-hex tracking) ship in templates as `true` rather than `{enabled: true}`; the House Rules UI only understood the object form, so those rules displayed as off and their toggle wouldn't flip. The UI now uses the engine's canonical accessor (which accepts both shapes) and normalizes the value when toggling. This is what made families-per-hex tracking look broken — the per-hex columns never appeared even with the rule "on".
- **Families-per-hex tracking** no longer loses per-hex edits. With the house rule on, the hexes are the source of truth: the domain's family total is now derived from the sum of its hexes, instead of per-hex family counts being silently rescaled back to the old domain total on reload (which also threw off the next monthly population-growth roll). Editing a hex's families now updates the domain total immediately.
- A disabled (`{enabled:false}`) **Markets Transaction Threshold** house rule no longer fires its notable-transaction rumor when a treasury grant lands — the gate now honours the rule's enabled flag rather than the mere presence of the setting.
- Event application is now **transactional**: an event whose handler errors part-way through (e.g. a complex adventure result granting treasure, XP, and casualties) rolls back cleanly instead of leaving partial changes behind, and is still logged as rejected — with the campaign left untouched.

## [0.10.0] - 2026-06-01

### Added
- Contributor and release policy docs (`CONTRIBUTING.md`, `CHANGELOG.md`).
- Time-based agricultural land improvement (RR p.174): a +1 land-value step is a labour-paid construction project built over time (~50 days at the typical-labourer rate), paid as the work proceeds from the domain treasury, advanced via the day-tick / Day Clock.
- Hex **land value** is GM-editable (the Hex detail modal and the Domain ▸ Hexes table), logged like any other edit.
- Day-tick drip labels note when progress was **limited by the domain treasury** (cash ran out before the budget did).

### Changed
- Construction is **RAW-timed by default**; instant completion is now an admin action (the Entity Inspector), not a house rule.
- Multi-day (week / month) day-tick progress collapses to **one summary line per project** instead of one line per day.
- The day-tick review surface uses a single **Cancel** button.
- Documented the land-revenue model: domain-level families × average hex land value is the RAW baseline; per-hex tracking is an optional high-fidelity overlay.

### Removed
- The `immediate-construction` and `realistic-construction` house rules — superseded, since RAW-timed construction is now the default and instant completion is the admin/Inspector path.

### Fixed
- Agricultural funding advances correctly during day-ticks and at month-end (treasury wiring); column alignment in the agricultural funding table.

## [0.9.0] - 2026-05-30

The Community Preview — first public release.

### Added
- **Domain management:** monthly income/expense bookkeeping, morale, vassalage & tribute, strongholds, hexes & settlements, agricultural land improvement, and the propose–review–commit turn cycle.
- **Characters, officers & magistrates:** PCs / NPCs / henchmen, ability scores (STR / INT / WIL / DEX / CON / CHA), saving throws, XP & level-up, retainers, the Officers tab, and the magistrate subsystem.
- **Recruitment:** mercenary / henchman / specialist hiring with availability, reaction-to-hiring, persuasion, signing bonuses, and persistent candidates.
- **Loyalty & calamity:** the loyalty-roll subsystem and hireling calamity tracking.
- **Rumors** ("What's the Word") and **Markets & Merchandise** (market notability and trade revenue).
- **Entity Inspector:** browse / inspect / create across every entity kind, driven by an entity registry and field schemas.
- **Construction (Wave A data layer):** Project and Constructible entities with six-axis classification and a construction event vocabulary.
- **Calendar day-tick orchestrator + Day Clock:** propose/commit day advancement with a consumer-agnostic review surface.
- **Events:** a typed event system with GM-fiat edits, a Chronicle, an Event Wizard, and an event-context envelope that powers derived entity histories.
- **Persistence:** one `.acks.json` per campaign (File System Access API, with download/upload fallback), campaign import/merge, shipped templates, and a first-run welcome banner.
- **Tooling:** headless smoke suites and a GitHub Actions CI workflow.

### Security
- Prototype-pollution guards on the event field-path writer, campaign validation on load, and a frozen `Object.prototype` at startup.

[Unreleased]: https://github.com/joachimxb/acks-god-mode/compare/v0.13.0...HEAD
[0.13.0]: https://github.com/joachimxb/acks-god-mode/releases/tag/v0.13.0
[0.12.0]: https://github.com/joachimxb/acks-god-mode/releases/tag/v0.12.0
[0.11.0]: https://github.com/joachimxb/acks-god-mode/releases/tag/v0.11.0
[0.10.0]: https://github.com/joachimxb/acks-god-mode/releases/tag/v0.10.0
