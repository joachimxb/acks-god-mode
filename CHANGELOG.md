# Changelog

All notable changes to ACKS God Mode are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.11.0] - 2026-06-01

### Added
- **Journeys (overland travel)** — the first real travel consumer of the day-tick layer. Plan a foot journey between hexes, set it in motion, and the Day Clock advances it day by day — movement (terrain/weather/pace), navigation throws (getting lost in trackless country), food + water, and fatigue — until the party arrives. Create and drive one through the Entity Inspector plus the Day Clock (a dedicated Journeys panel comes later).
- Travel-relevant hex geography (road / trail / river / elevation) and per-character travel state (fatigue, hunger, dehydration) that persists from one journey into the next.
- An in-flight journey now shows on a participant's **Activity** strip (Roster, character sheet, henchmen tables) — e.g. "🥾 on journey to (5,-3) · Saltspur".

### Changed
- Travel logistics are **RAW by default**: rations and the six-day fatigue cycle (JJ p.84) apply out of the box. The new `simplified-fatigue` and `ignore-rations` house rules opt *out* toward a lighter-weight game.

### Removed
- The placeholder default-off `realistic-fatigue` and `mandatory-rations` house rules — superseded by the RAW-default posture above.

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
