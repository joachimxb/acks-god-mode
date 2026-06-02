# Changelog

All notable changes to ACKS God Mode are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Journeys panel — start and run overland travel from the interface** (Activities › Journeys). A guided **Start a journey** action lets you pick the travellers (individual characters or a whole party), a start and destination hex (plus optional waypoints), a pace, a mode, and starting rations, with a distance-and-days forecast before you commit. A **Journey Detail** panel shows the route, a day-by-day log, a supplies tracker with low-stock warnings, and **Tick day** / **Abort** controls. **Send on journey** shortcuts sit on the character sheet, the party panel, and the hex card; the hex card also lists journeys passing through it. Advancing a journey's days runs through the shared Day Clock (the same propose → review → commit the construction layer uses), so travel stays in lockstep with everything else on the calendar. (The travel engine shipped in 0.11.0; this release makes it hands-on — previously a journey could only be authored through the Inspector and driven from the Day Clock.)

### Changed
- **Day-tick review attributes pause details to each item.** The “Paused for review” note now appears **only when a multi-day advance stopped early** (a “+1 week” or “→ month end” that halted partway) — a single “+1 day” no longer shows it (you weren't really paused; the review always opens for one day). When it does show, it says how far it got (“stopped early at day N of a 7-day advance”). Each consumer's notable events (lost / hungry / dehydrated / encounter) still list in red **under its own record** — so with several journeys in flight, each set of warnings sits beneath the journey it belongs to, without re-printing the journey's route.
- **Journey day log is more legible, with a GM reroll.** The Journey Detail panel now surfaces **status conditions** (hungry / dehydrated / fatigued) under Food & Water, shows each day's **navigation throw in full** (die roll + modifiers + target + result, e.g. “nav 🎲 2 vs 8+ → lost ✗”), and gives the GM a **🎲 reroll** on the most recent day (re-runs that day's resolution). The day's events no longer repeat the journey's route on every line — the route is shown once at the top of the panel, and each day just lists its events (“• lost in grassland (nav 4 vs 6+) • out of food — party hungry (day 1)”). The reroll is offered **only while the campaign clock is still on that day** — a leg (including a just-arrived final leg) stays re-rollable until you advance the world past it (a **+1 day**, **Advance month**, etc.), after which the day is settled history and the reroll is withdrawn. Re-running a just-arrived day that no longer reaches the destination now also cleanly un-does the arrival (the travellers and their party are put back on the road rather than left at the destination).
- **Pace can be changed mid-journey.** Pace was previously fixed when the journey started; the Journey Detail panel now has a **Current pace** control (Normal / Half speed ×½ / Forced march ×1½) you can change at any point while travelling. The next day ticked uses the new pace, and each day's record keeps the pace it was actually travelled at (so the day log shows where the party sped up or slowed down). The change is logged like any other edit (e.g. “Set ‹journey› to forced march pace (was normal)”).
- **The Start-a-Journey traveller picker is a dropdown, and picking a traveller sets the start hex.** The scrolling checkbox list of characters is now an **Add traveller** dropdown that offers only unattached characters — those **not already in a party** (party members come along via the Party picker) and not already added — with the chosen travellers shown as removable chips. **Picking the first traveller auto-fills the Start hex** from that character's current location (you can still change it), so you no longer have to set it by hand after choosing who travels. And once a Start hex is set — whether you picked it directly or it came from the first traveller — the dropdown narrows to characters **at that hex**, since a journey sets out from one place.
- **Journeys count their members — with the mercenaries that tag along.** Like the Parties panel, the Journey planner and the Journey Detail now fold in each traveller's **Mercenary Company** (the units on their character sheet, RR p.166), which travels with them. The **planner** shows a mercenary count on each traveller's chip and a running total (“2 selected · 42 mercenaries (44 total)”). The **Journey Detail** gains a **Members table** — each traveller, their mercenaries per type, and their survival **conditions** (Hungry / Dehydrated / Fatigued, moved here from the supplies box so they're shown per traveller; room for more per-character columns later) — a **Total** line, and a header that reads “Travellers: 2 characters + 42 mercenaries (44 total)”.
- **Ventures: eligibility, a clearer ETA, and a labelled GM override.** A character already away on a venture (or a journey) is now **hidden from the New-venture and the Start-a-journey pickers** until they return (RR pp.370-380 — one active venture per character); a venture-bound character's sheet shows a **🛒 On venture →** link to the Ventures list in place of the Start-journey button. The **Turns** column now reads the **time until arrival** (“in 2 turns” / “ARRIVED”) rather than an absolute turn number. And while a venture is still in transit its arrive action reads **GM-arrive** — signalling a GM override to force early arrival — flipping to **→ arrive** once it's actually due.
- **Party & journey controls on the character sheet.** The character-sheet header now carries quick affiliations: a **🛡 Start party** button when the character is in no party (founds one led by them) or a **🛡 Party: ‹name› →** link to their party when they are; and a **🧭 Start journey** button when they're on no journey or a **🧭 On journey: ‹name› →** link to their journey when they are. The links jump to the Parties view (scrolling that party's card into view and briefly highlighting it) and to the Journey Detail panel. **If the character is in a party, the journey button reads “🧭 Start party journey” and sets up the journey for the whole party** (prefilling its members and departure hex) rather than just that one character. (The old "Send on journey" button in the Retainers tab is folded into this.)
- **Parties are now started by a founding character** (Characters › Parties). **+ New party** asks you to pick a character to found the party; the party is named after them (“&lt;founder&gt;’s party”) and placed at their hex, with the founder as the first member and leader. Adding members is then scoped to characters **in the same hex** as the party (so a party you’ve gathered in one place can be sent on a journey together). The leader is marked with a ★, and reassigns automatically if they leave. The party **name** and **Notes** use the same **✏ / ✓ / ✗** edit control as other fields (saved to the log on ✓); Notes sits under Current hex. Member names in a party are clickable and open the character sheet, and each member's **mercenaries** (their Mercenary Company, which travels with them) are listed as a per-type count table beneath their name. A **Total party** line below the member list sums the characters and their mercenaries. Any non-leader member can be promoted with **make leader** (logged, e.g. “Made Sir Tomas leader of Aelric's party (replacing Aelric)”).
- **Marching pace is now the RAW set: Normal / Half speed / Forced march.** The earlier “Cautious” pace and an experimental slowest pace are replaced by RAW's **Half speed** (×½ — travelling as an ancillary activity, RR p.272); any journey already set to one of the old paces is moved to Half speed automatically. And a **forced march now tires the party at once** — a single day of it leaves them fatigued and forces a rest the next strenuous day (RR p.279), instead of merely counting as one ordinary day toward the six-day fatigue cycle.
- **Travel conditions use the RAW stages.** A traveller's hunger now reads **Hungry → Underfed → Starving**, and thirst is a single **Dehydrated** stage (RR p.276), replacing the earlier “Famished” and “Thirsty” labels. A new **Ground** setting on the hex card (Clear / Mud / Snow) marks mud or snow underfoot, which halves travel speed (RR p.272). (Hunger, thirst, and fatigue remain GM-facing trackers for now — their mechanical penalties come with a later pass.)

### Fixed
- **A lost party could never reach its destination.** A successful navigation throw didn't clear the “lost” state, so once a party got lost it made zero progress every day despite succeeding. A success now re-orients the party (RR p.275 recovery) and travel resumes. The Journey Detail panel also shows **total and remaining distance** (e.g. “Distance: 12 mi total · 0 mi left · 2/2 hexes”), and the **Arrived / Aborted** status and the **Tick day** button are now prominent (a green/red badge and a larger button) rather than small grey text.
- Starting a journey from a party (or character/hex) now shows the prefilled **party** and **start hex** in the Start-a-Journey wizard's dropdowns, instead of leaving them on “— none —/— pick —” (the values were set correctly underneath — only the dropdown display was wrong).
- A party's **Current hex** now shows its actual location (defaulting to the founder's hex) instead of always reading “(none)”. While the party is on a journey its hex is driven by the journey (locked, with a link to it); otherwise the GM edits it with the same **✏ / ✓ / ✗** control as every other field — open, pick a hex, save. **Relocating a party is recorded in the log on save** (e.g. “Moved Aelric's party to (0,-2) · Northwatch Village (from (0,0) · Saltspur)”), like other GM edits. (The old picker was wired to an internal list that never populated, so no hex could ever be selected.)
- Editing a per-hex family count (or the domain-level Peasant families field) no longer throws an error and reverts the edit. The internal sync that keeps the domain total and per-hex counts in agreement was calling engine helpers that weren't reachable from the event module; it now routes through the exported setters.
- **Overland travel weather and navigation now match the rules as written.** A RAW audit found several travel values were off: a **storm** now **quarters** travel speed (it was only lightly slowing you) and **fog halves** it (it wasn't slowing you at all); rain still doesn't slow travel, only visibility. **Temperature** now matters — frigid (below 0°F) or sweltering (above 95°F) each **halve** speed. And the worst terrain is dangerous to navigate again: **dense scrubland** (8+) and **forested swamp** (14+) carry their tougher getting-lost throws instead of being treated as their easier cousins (RR pp.272–279).

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
