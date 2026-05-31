# ACKS God Mode

**A single-HTML-file campaign engine for the Adventurer Conqueror King System Imperial Imprint (ACKS II).**

GM-facing tool that handles domain bookkeeping, urban settlements, mercantile ventures, characters and retainers, hireling recruitment + loyalty, magistrates and officers, world-level hex and settlement tracking, rumors, market mechanics, and more — all in your browser, all in one HTML file, all using a transparent JSON save format.

> **v0.9 Community Preview** — the first public release. Many subsystems planned but not yet built (combat, journeys, hijinks, religion, spells). What's here is solid; what's coming is sketched in the docs.

## Try it

**[Open ACKS God Mode in your browser →](https://joachimxb.github.io/acks-god-mode/)** *(live once Pages is enabled on the repo)*

Works best in Chrome / Edge / Brave / other Chromium browsers — you can grant the tool access to a campaigns folder once and it saves directly to disk. Firefox and Safari work too, but fall back to manual download/upload per save.

## What v0.9 does today

- **Multi-domain campaigns** with vassalage, tribute, taxes, services, garrison expenses, and the full ACKS II morale model
- **Urban settlements** with market class, trade revenue, and urban investment
- **Mercantile ventures** with passive investments, vagaries, and the Demand Modifiers framework
- **Characters and retainers** with five-axis classification, magistrate assignments, henchman loyalty + drift, calamity tracking, and the hireling recruitment workflow (RR pp.164–172)
- **World view** with hexes, settlements, rumors and the auto-emit pipeline from significant in-game events
- **Agricultural improvements** with optional supervisor + monthly labor cap (Realistic Construction house rule)
- **Typed event log** that records every meaningful action and lets you accept, reject, or edit pending events before commit
- **House rules registry** — opt in to mechanics that diverge from RAW; data is hidden and non-functional when off

Roughly 50 ACKS II subsystems are covered to varying depth. Citations to RAW page numbers (`RR p.344`, `JJ p.84`, etc.) live throughout the UI labels and event log entries.

## Getting started

1. **Open the live URL** in Chrome (or your preferred Chromium browser).
2. On first visit, the **welcome banner** offers a demo template or a fresh campaign.
3. To save: when prompted, choose a folder to keep your `.acks.json` files. The browser will reuse this folder for future saves.
4. To open: click **Open Campaign** → pick a `.acks.json` file from your folder.
5. To add a starter domain: **Import Domain** → pick one of the six v2 templates from the `Templates/` folder bundled with the tool.

## Your data is yours

Every campaign you build is a single `.acks.json` file in a folder you choose on your own computer. The tool never uploads anything anywhere. The hosted version on GitHub Pages is just delivering the HTML and JavaScript to your browser — your saves go directly from your browser to your local disk via the File System Access API (or via download in Firefox/Safari).

To back up a campaign: copy the `.acks.json` file. To share a campaign or a single domain: send the file to another GM. To version-control your campaign: commit the file to your own git repo.

## Templates

Six starter `.acks.json` templates ship with the tool:

| Template | What it is |
|---|---|
| `v2-frontier-barony.acks.json` | A small wilderness barony — Borderlands, low population, building from scratch |
| `v2-established-march.acks.json` | A larger established march — mid-Borderlands, has vassals, working economy |
| `v2-petty-kingdom.acks.json` | Small Realm — multiple vassals, council, more developed economy |
| `v2-wilderness-outpost.acks.json` | Frontier outpost — Outlands, very early stage |
| `v2-mercantile-city.acks.json` | Urban-focused starter — Market Class V settlement with active ventures |
| `v2-dwarven-vault.acks.json` | Dwarven civilization variant (By This Axe house-rule-gated) |

Use **Import Domain** in the per-campaign toolbar to bring a starter into a new campaign. Then rename and customize from there.

## License

ACKS God Mode is released under the **GNU Affero General Public License v3.0** (AGPL-3.0). See `LICENSE` for the full text.

**What this means for you:**
- Use it freely for your own games
- Fork it, modify it, share your modifications
- If you host a modified version as a service for other people, you must publish your changes under the same license
- Attribution to the original author is required

**ACKS II** (the rules system) is © Autarch / Imperial Imprint. The tool implements ACKS II mechanics and cites RAW page numbers, but does not redistribute any rulebook text. To play ACKS II you need a copy of the rulebooks — get them from [autarch.co](https://www.autarch.co).

## Filing issues

Bugs, broken mechanics, feature suggestions: open an issue on this repo's **Issues** tab. Please include:
- Browser + version
- What you were trying to do
- What happened vs. what you expected
- If possible: a minimal `.acks.json` save that reproduces the problem (you can scrub anything sensitive — what matters is the shape that triggers the bug)

## Contributing

Pull requests welcome for bug fixes and small improvements. Larger features should be discussed in an issue first.

**Important — contributions:** I'm the sole copyright holder of this project, which keeps the licensing flexible going forward. To preserve that, contributions need a small copyright assignment. The simplest version: include a line in your pull request that reads:

> *"I assign copyright of this contribution to Joachim Buchert."*

Without that line, the PR can't be merged. The reason: AGPL alone doesn't let me incorporate your contribution into anything other than another AGPL-licensed copy of the project. Copyright assignment lets me apply your fix freely as the project evolves.

For very small fixes (typos, single-line bug patches), the same one-line statement in the PR description suffices. For larger contributions, we can discuss a more formal CLA.

## Credits

Built by Joachim Buchert for the ACKS community.

ACKS II — Autarch / Imperial Imprint.
Alpine.js — Caleb Porzio. Tailwind CSS — Tailwind Labs.
Inspiration from the wider ACKS Discord and the design lineage running back to BECMI, Mentzer, Gygax.

*ACKS God Mode is an independent community tool. It is not affiliated with, endorsed by, or sponsored by Autarch or Imperial Imprint. ACKS II rules are © Autarch / Imperial Imprint; to play ACKS II you need the rulebooks, available at [autarch.co](https://www.autarch.co).*

---

*v0.9 Community Preview — 