# ACKS God Mode

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-6b4f24)](LICENSE) [![Latest release](https://img.shields.io/github/v/release/joachimxb/acks-god-mode?label=release&color=2f7d32)](https://github.com/joachimxb/acks-god-mode/releases) [![Client-side · no build](https://img.shields.io/badge/client--side-no%20build-6b4f24)](https://joachimxb.github.io/acks-god-mode/)

**A browser-based campaign engine for the Adventurer Conqueror King System Imperial Imprint (ACKS II).**

A GM-facing tool for running an ACKS II campaign — domains, characters and retainers, a hex map of the world, overland travel, the economy, mass warfare, encounters, religion, and more — all in your browser, all backed by a transparent `.acks.json` save format you own.

For the current version and the full release history, see [`CHANGELOG.md`](CHANGELOG.md) and the repo's [Releases](https://github.com/joachimxb/acks-god-mode/releases); the feature overview below is kept current with the shipped tool.

## Try it

**[Open ACKS God Mode in your browser →](https://joachimxb.github.io/acks-god-mode/)**

Works best in Chrome / Edge / Brave / other Chromium browsers — you can grant the tool access to a campaigns folder once and it saves directly to disk via the File System Access API. Firefox and Safari work too, but fall back to manual download/upload per save.

No account, no server, no install. The fastest way in is the **🎲 Demo** button (or the welcome screen's "Load demo campaign") — it drops you into the *March of Saltspur*, a multi-domain coastal campaign already several turns in, with pending events ready to resolve.

## What it does today

The tool is a *run-the-world* engine: it tracks the state of a campaign and helps you advance it turn by turn (and now day by day), with the rules automated where that helps and your judgment preserved everywhere it matters — every turn is propose → review → commit, never silent mutation.

**Solidly built and in daily use:**

- **Domains** — monthly income/expense bookkeeping, the full ACKS II morale model, vassalage and tribute, taxes and services, garrison expenses, strongholds, barbarian clanholds and transitional realms (RR pp.353–354), a derived demographic census of who lives in each settlement and realm (by class and level, with expected wealth and magic-item availability, JJ pp.214–217), and the propose-review-commit turn cycle.
- **Characters, officers & magistrates** — PCs / NPCs / henchmen with five-axis classification, ability scores (STR / INT / WIL / DEX / CON / CHA), saving throws, XP and level-up, retainers, the Officers tab, and the magistrate subsystem.
- **Recruitment, loyalty & calamity** — mercenary / henchman / specialist hiring with availability, reaction-to-hiring, persuasion, signing bonuses, and persistent candidates; the loyalty-roll subsystem; and hireling calamity tracking (RR pp.164–172).
- **A campaign map** — a clickable, zoomable, layered SVG hex map (colour by terrain / domain / land value / population / morale and more, with settlement / stronghold / lair symbols and per-side roads, rivers, and ford/bridge edges). Author the world right on the map: create a grid, place and edit hexes, paint terrain and roads and rivers.
- **Overland travel** — plan a journey across the map and run it hex by hex: roads speed you and keep you from getting lost, rivers are a barrier you ford (RR p.271), terrain paces each leg, and a failed Navigation throw gets you genuinely, unknowingly lost (RR p.275). Per-traveller **provisioning** — food and water carried as real inventory, foraging, and the hunger/thirst ladders (RR p.278) — and a per-character **activity budget** that tracks how each character's day is spent. Ride and pack **mounts** (RR p.130) to carry more and travel faster, fed and watered on the road like their riders.
- **Economy & trade** — mercantile ventures (bulk arbitrage with demand modifiers and vagaries), retail equipment buy/sell at a market (the 🛒 Trade wizard, Equipment Availability by Market Class, RR p.124), Markets & Merchandise, located **stashes** with a multi-denomination coin purse and a composable item model, banking and loans (borrow capital, bank your treasure, accrue interest — RR p.42, p.313), and carry encumbrance.
- **Encounters & a living wilderness** — a persistent-monster layer where lairs are first-class places, wandering bands cross borders and settle, and the RAW wilderness-encounter procedure (distance → surprise → evasion → reaction → influence, RR pp.280–287) runs in a step-by-step panel; hex search and tracking; a built-in monster catalogue and the JJ terrain encounter tables.
- **Warfare** — units, armies, and the mass-combat layer: muster an army from a domain or party, march it on the same travel engine (with supply lines, RR pp.450–452), fight the full ACKS II battle engine (RR pp.461–472), lay sieges (RR pp.473–485), invade / occupy / conquer / pillage domains, and run the optional Vagaries of Incursion. A 📋 Review tab is the GM's work queue, with the world clock in two buttons.
- **Politics & governance** — senatorial republics and oligarchies: a realm's governance with named senators (leading senators, their clients, and independents), factions, voting on policy with bribery and disputes, and the ruler's options when a vote turns against him (RR pp.355–360, JJ pp.402–407).
- **Downtime & realm play** — Hideouts & Hijinks (carousing, smuggling, syndicates, trials, RR pp.358–370), Favors & Duties (the monthly liege↔vassal obligation engine, RR pp.345–348), domain advancement (Outlands → Civilized), gladiatorial games (house-rule-gated), and the character lifecycle: aging, disease, death and inheritance, and optional dynasties (RR p.19, pp.311–313; JJ p.84; AXIOMS 19).
- **Construction** — a guided wizard raises strongholds, settlement buildings, civic monuments, roads, field fortifications, ships, war machines, sanctums, dungeons, mines, and vaults over time on the Day Clock, with a damage-and-repair lifecycle (RR pp.131–137, p.174).
- **Religion & divine power** — deities, congregations, and a per-character divine-power ledger; a congregation generates divine power monthly to consecrate fields or earn experience (RR pp.421–425).
- **The arcane domain** — a mage's sanctum draws apprentices and companions, and a built or conquered dungeon becomes a monster farm yielding arcane power; the full magic-research engine handles spell research, item creation, identification, constructs, crossbreeds, necromancy, rituals, and experimentation (RR pp.386–420). The magic-item economy ties in: identify, appraise, buy, sell, and use what you find.
- **Generators & custom content** — generate a complete RAW NPC (occupation, class, level, proficiencies, wealth, magic items), a settlement's notables, a court, or an NPC party; build custom classes and races with a point-buy Class Builder (JJ pp.289–331); commission a sage; track what your world knows with a Knowledge/Lore layer; and roll treasure hoards (Treasure Tome).
- **World & events** — top-level hexes, settlements, and rumors with an auto-emit pipeline; a typed **event log** that records every meaningful action; GM-fiat edits, a Chronicle, an Event Wizard, and an event-context envelope that powers derived per-entity histories.
- **Inspector & calendar** — browse / inspect / create across every entity kind; a day-tick orchestrator and Day Clock that advance the calendar and resolve in-flight activity.
- **House rules registry** — opt in to mechanics that diverge from RAW; when a rule is off, its data stays hidden and non-functional. The default with no rules toggled is RAW-as-written.

**Still to come:** round-by-round **tactical man-to-man combat** is resolved at your table — the engine fights mass battles and sieges (and even abstract or blow-by-blow arena bouts) and records adventure outcomes, but not individual-initiative skirmishes; **mounted combat** isn't resolved yet (mounts are modelled, ridden, and provisioned, but a fight from the saddle is the GM's call); and the dedicated player-facing **Portal** is still its own future product (the save already models player-vs-GM control, and the tool can export a player-safe, fog-of-war view of a campaign, but there's no separate player app yet). These are tracked in the changelog and the in-app coverage as they land.

RAW page citations (`RR p.344`, `JJ p.99`, etc.) are threaded through the UI labels and event-log entries throughout.

## Getting started

1. **Open the live URL** in Chrome (or your preferred Chromium browser).
2. On first visit, the **welcome screen** offers the demo, a starter template, opening an existing campaign, or starting blank.
3. The quickest tour is **🎲 Load demo campaign**. To build your own, pick a **starter template** — on the hosted site it loads in one click; running from a local `file://` copy, you choose the template file from the bundled `Templates/` folder.
4. To save: when prompted, choose a folder to keep your `.acks.json` files. The browser reuses this folder for future saves.
5. To open later: **📂 Open campaign…** → pick a `.acks.json` file.
6. To bring world data (domains, hexes, settlements, lairs) into the campaign you have open, use the **📊 Import / Export** box on the **World** tab — it reads and writes an Excel (`.xlsx`) workbook. To open a different campaign file outright, use **📂 Open campaign…**.

## Your data is yours

Every campaign you build is a single `.acks.json` file in a folder you choose on your own computer. The tool never uploads your campaign anywhere — your saves go directly from your browser to your local disk via the File System Access API (or via download in Firefox/Safari).

And it runs **fully offline**: the page ships its two UI libraries — Tailwind CSS and Alpine.js — vendored alongside it (no CDN, no external fetch, no analytics or tracking of any kind), so once you have the file it loads and renders with no internet connection at all. Nothing — your campaign data *or* the page itself — ever leaves your machine.

To back up a campaign: copy the `.acks.json` file. To share a campaign or a single domain: send the file to another GM. To version-control your campaign: commit the file to your own git repo.

That openness is also a **building block**: the `.acks.json` file is a documented, self-describing world-state layer, and the engine that reads and advances it runs headless in Node with no dependencies — so a companion tool, a Discord bot, or an AI GM-assistant can read from and write to the same campaign state. If you want to build against it, see [`INTEGRATION.md`](INTEGRATION.md) (the contract, the headless engine, and a JSON Schema at [`schema/acks-campaign.schema.json`](schema/acks-campaign.schema.json)).

## Templates

Six starter `.acks.json` templates ship with the tool. On the hosted site they load in one click from the welcome screen; you can also **📂 Open** them directly.

| Template file | What it is |
|---|---|
| `v2-frontier-barony.acks.json` | A small wilderness barony — Borderlands, low population, building from scratch |
| `v2-established-march.acks.json` | A larger established march — mid-Borderlands, has vassals, working economy |
| `v2-petty-kingdom.acks.json` | A small Realm — multiple vassals, a council, a more developed economy |
| `v2-wilderness-outpost.acks.json` | A frontier outpost — Outlands, very early stage |
| `v2-mercantile-city-state.acks.json` | An urban-focused starter — a high-market-class settlement with active ventures |
| `v2-dwarven-vault.acks.json` | A dwarven civilization variant (By This Axe house-rule-gated) |

A template loads unbound to any file, so **Save** prompts for a new location — your starting template stays intact. Rename and customize from there.

## License

ACKS God Mode is released under the **GNU Affero General Public License v3.0** (AGPL-3.0). See [`LICENSE.txt`](LICENSE.txt) for the full text.

**What this means for you:**
- Use it freely for your own games.
- Fork it, modify it, share your modifications.
- If you host a modified version as a service for other people, you must publish your changes under the same license.
- Attribution to the original author is required.

**ACKS II** (the rules system) is © Autarch / Imperial Imprint. The tool implements ACKS II mechanics and cites RAW page numbers throughout. It reproduces no rulebook prose — but, like any campaign automation, it does carry the **mechanical facts** the rules engine needs: notably the numeric stat lines for monsters (from the Monstrous Manual) and troop types (from the rulebook), reorganized into the tool's own data structures so combat, encounters, and mass warfare can be resolved. It is not a substitute for the books — there are no rules explanations, no flavour text, no art, no spell or item descriptions. To play ACKS II you need a copy of the rulebooks — get them from [autarch.co](https://www.autarch.co).

## Filing issues

Bugs, broken mechanics, feature suggestions: open an issue on this repo's **Issues** tab. Please include:
- Browser + version
- What you were trying to do
- What happened vs. what you expected
- If possible: a minimal `.acks.json` save that reproduces the problem (scrub anything sensitive — what matters is the shape that triggers the bug)

## Contributing

Pull requests are welcome for bug fixes and small improvements; larger features are best discussed in an issue first. The full branch / PR / release policy lives in [`CONTRIBUTING.md`](CONTRIBUTING.md) — read it before opening a PR — and [`ARCHITECTURE.md`](ARCHITECTURE.md) maps the codebase (the engine / UI / `index.html` layers) for anyone changing the code.

**One thing to know up front:** I'm the sole copyright holder, which keeps the project's licensing flexible going forward. To preserve that, every pull request must include this line in its description:

> *"I assign copyright of this contribution to Joachim Buchert."*

Without that line the PR can't be merged. (The reason: AGPL alone wouldn't let me reuse a contribution in anything other than another AGPL copy of the project; the assignment lets me apply your fix freely as the project evolves.) For very small fixes the one-line statement is enough; larger contributions can use a more formal agreement, which we'll sort out on the PR.

## Credits

Built by Joachim Buchert for the ACKS community.

ACKS II — Autarch / Imperial Imprint.
Alpine.js — Caleb Porzio. Tailwind CSS — Tailwind Labs.
Inspiration from the wider ACKS Discord and the design lineage running back to BECMI, Mentzer, Gygax.

*ACKS God Mode is an independent community tool. It is not affiliated with, endorsed by, or sponsored by Autarch or Imperial Imprint. ACKS II rules are © Autarch / Imperial Imprint; to play ACKS II you need the rulebooks, available at [autarch.co](https://www.autarch.co).*
