# Changelog

All notable changes to ACKS God Mode are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

_Nothing yet._

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

[Unreleased]: https://github.com/joachimxb/acks-god-mode/compare/v0.10.0...HEAD
[0.10.0]: https://github.com/joachimxb/acks-god-mode/releases/tag/v0.10.0
