# Changelog

All notable changes to ACKS God Mode are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Journeys panel — start and run overland travel from the interface** (Activities › Journeys). A guided **Start a journey** action lets you pick the travellers (individual characters or a whole party), a start and destination hex (plus optional waypoints), a pace, a mode, and starting rations, with a distance-and-days forecast before you commit. A **Journey Detail** panel shows the route, a day-by-day log, a supplies tracker with low-stock warnings, and **Tick day** / **Abort** controls. **Send on journey** shortcuts sit on the character sheet, the party panel, and the hex card; the hex card also lists journeys passing through it. Advancing a journey's days runs through the shared Day Clock (the same propose → review → commit the construction layer uses), so travel stays in lockstep with everything else on the calendar. (The travel engine shipped in 0.11.0; this release makes it hands-on — previously a journey could only be authored through the Inspector and driven from the Day Clock.)

### Changed
- **Parties are now started by a founding character** (Characters › Parties). **+ New party** asks you to pick a character to found the party; the party is named after them (“&lt;founder&gt;’s party”) and placed at their hex, with the founder as the first member and leader. Adding members is then scoped to characters **in the same hex** as the party (so a party you’ve gathered in one place can be sent on a journey together). The leader is marked with a ★, and reassigns automatically if they leave. The party's **Notes** field sits under Current hex and uses the same **✏ / ✓ / ✗** edit control as other fields (saved to the log on ✓). Member names in a party are clickable and open the character sheet, and each member's **mercenaries** (their Mercenary Company, which travels with them) are listed as a per-type count table beneath their name.

### Fixed
- A party's **Current hex** now shows its actual location (defaulting to the founder's hex) instead of always reading “(none)”. While the party is on a journey its hex is driven by the journey (locked, with a link to it); otherwise the GM edits it with the same **✏ / ✓ / ✗** control as every other field — open, pick a hex, save. **Relocating a party is recorded in the log on save** (e.g. “Moved Aelric's party to (0,-2) · Northwatch Village (from (0,0) · Saltspur)”), like other GM edits. (The old picker was wired to an internal list that never populated, so no hex could ever be selected.)
- Editing a per-hex family count (or the domain-level Peasant families field) no longer throws an error and reverts the edit. The internal sync that keeps the domain total and per-hex counts in agreement was calling engine helpers that weren't reachable from the event module; it now routes through the exported setters.

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

[Unreleased]: https://github.com/joachimxb/acks-god-mode/compare/v0.11.0...HEAD
[0.11.0]: https://github.com/joachimxb/acks-god-mode/releases/tag/v0.11.0
[0.10.0]: https://github.com/joachimxb/acks-god-mode/releases/tag/v0.10.0
