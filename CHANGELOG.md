# Changelog

All notable changes to ACKS God Mode are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- **Set a journey's speed by hand.** The Journey Detail panel's Pace row gains an **Override** tick and, just after Mode, a **miles per day** field that's grayed out until you tick it (it previews the current pace's nominal speed meanwhile). Tick Override — Pace grays out, the field un-grays — and type the exact distance the party covers each day, instead of the computed pace × weather × temperature; handy for a custom mount, a favouring wind, or just "they make 30 a day, don't argue." The route's per-hex terrain, roads, and rivers still apply as the party walks (a road still speeds the leg, a forest still slows it — the override is the open-ground rate, not a teleport), and the Pace setting still drives fatigue. The day log marks each overridden day (⚡ N mi/day), and unticking hands speed back to Pace.

## [0.17.0] - 2026-06-03

### Removed
- **The "Located inventory (Stash subsystem)" house rule has been removed — the Stash subsystem is now always-on core.** Located inventory (the 🪙 Stashes view, character Vault cards, located hex stashes, party camps, carry-encumbrance, and the domain-treasury-as-stash model) previously sat behind an off-by-default `inventory-stash-system` toggle; that toggle is gone and the subsystem is always on, with no opt-out. Loading any existing campaign now materializes each domain's treasury as a stash automatically (unconditionally — as the rule used to do when switched on), so wealth always flows through the same audited stash model. The on-sheet carry-encumbrance readout likewise now shows by default (governed only by the **Ignore carry encumbrance** opt-out, still default off = full RAW). The six shipped templates and the demo were regenerated so they ship with their treasury stashes already materialized. Per Joachim — located inventory is a discipline real tables enforce anyway, and the engine's wealth flows depend on it.

## [0.16.0] - 2026-06-03

### Added
- **A Stashes view for tracking where your wealth physically sits.** Turn on the **Located inventory (Stash subsystem)** house rule and a new **🪙 Stashes** tab appears under World — a filterable list of every coin pile, cache, party loot, and domain treasury in the campaign, with its owner, hex, total value, and weight. Each character sheet gains a **Vault** card (the stashes they own or share, plus the treasury of any realm they rule — shown as "held by office," since it passes to the next ruler), and each hex shows the stashes **located there**, with one-click "cache here." Open any stash to add or remove coins and items, promote a notable find into a tracked item — and click that promoted item to open it in a detail modal — and read its history. A stash's owner is shown as a link in its header — click it to jump to that character's sheet or the owning party's panel. Character sheets also gain a **carry-encumbrance readout** — your load band and movement rate by the book (RR pp.83–84). **A character can move things between their pack and a stash at their hex.** From the Vault card, **📦 Transfer items / coins** opens a deposit/withdraw panel: stash gear and coins from the character's purse into a stash at their current hex — creating a fresh cache there on the spot if none exists, left at that hex — or, when standing on a hex that holds a stash, draw items and coins back out into the character's inventory and purse. Coins move by denomination, an item's weight follows it, and the load band updates as you go (taking too much just shows you've gone overloaded — it never stops you). And when you open a stash while a character is standing on its hex, each row gets a one-click **take** straight into that character — items into the pack, a coin pile taken whole. **Every party also has a camp** — a stash named after the party that **travels with it**, following the party from hex to hex (by GM move or along a journey); the party panel shows the camp with a one-click open. **Disbanding a party** hands its camp — all its gear and coin — to the leader (it becomes their personal stash), or, if the party has no leader, leaves it as a cache at the hex. (Splitting the camp among the members on disband is a planned future option; for now the leader takes it all.) (The Stash system stays off until you switch it on — flip it and each domain's treasury appears as a stash at once; nothing else changes for existing campaigns unless you do.)
- **A character's coins are now a proper purse.** The Inventory tab opens with a **🪙 Coins** section holding all five denominations — platinum, gold, electrum, silver, copper — with the purse's total gold-piece value and weight shown alongside. Carried coins weigh by the book (1,000 coins = 1 stone, RR p.83) and count toward the carry-encumbrance load band. The old single "Personal GP" field on the Stats tab folds into this (as gold); existing characters upgrade automatically with no money lost. The carry inventory list below it no longer carries a per-item gp value column — it tracks **gear** by name, weight (stone), and notes; an item's worth is a selling/treasure matter, not a property of carrying it. And just like in a stash, you can **★ promote** a carried item into a tracked Notable Item — then click it to open its detail.

### Changed
- **Items in stashes and carry inventory now use one composable shape.** Instead of a fixed coin / bulk / item split, an item line carries a set of toggleable *facets* — coin, valuable, gear, bulk, magical, readable, container — so a single line can be several things at once (a jewelled, enchanted blade is gear + valuable + magical). Coins can be any denomination (copper, silver, electrum, gold, platinum) and a line's weight and gold-piece value are computed automatically — coins weigh 1 stone per 1,000 (RR p.83), and gems and jewelry carry a per-piece value. A mundane line can be **promoted** into a tracked, named item with its own history once it starts to matter (the same "the world remembers" pattern as recurring monsters becoming lairs). Existing campaign files upgrade automatically on load. (Groundwork for the Stashes view, the character Vault card, and treasure — landing next.)
- **Encumbrance is now modelled by the book, by default.** The optional encumbrance house rule used to be a default-off *hard block*; it is now **Ignore carry encumbrance** (still default off). Left off — the default — a character's carry weight and load band are computed per ACKS (coins weigh 1 stone per 1,000; unencumbered through overloaded, RR pp.83–84) and you're never stopped from picking things up: being overloaded just means you can't move. Turn it on to tell the tool to ignore weight entirely. (The on-sheet readout arrives with the Stashes UI.)

### Fixed
- **Editing a settlement's Families or Investment on an older campaign file no longer silently reverts.** Settlements saved before they were given stable internal IDs couldn't be edited — the value would flash and snap back (with a "no entity to save against" warning in the console). Loading a campaign now assigns any such settlement an ID, so its Families, Investment, and other fields save normally. Existing saves are repaired automatically on load — just reload the file.

## [0.15.0] - 2026-06-03

### Added
- **Journeys now travel hex by hex, following the roads and rivers you've drawn on the map.** Until now a journey moved by straight-line distance and read only a single coarse "this hex has a road" flag on its *starting* hex. It now walks the actual line of hexes between start and destination and resolves each one against the per-side **roads**, **rivers**, and **ford/bridge** marks from the map's Add/Edit-hexes editor:
  - **Roads speed you up and keep you from getting lost** (RR p.272 / p.275). A hex you pass *through* earns the road bonus (×3/2 speed, no getting-lost throw, the safe wilderness-encounter column) when a road connects the side you enter by to the side you leave by; a hex you *end* in counts when a road touches the side you entered. A day spent entirely on roads rolls no navigation throw and draws no wandering encounter.
  - **Rivers are a barrier you have to cross** (RR p.271). Reaching a river edge with no ford or bridge forces a Swimming throw: make it and the party fords across — but the crossing takes the rest of the day (you're swimming, not marching); miss it and they're held at the near bank and the day pauses for you to resolve the crossing (the drowning risk RAW spells out). A **ford/bridge** mark — or a **road that crosses the river** (an automatic bridge) — lets the party cross for free.
  - **Terrain now varies along the route.** Each hex's own terrain (and any mud or snow underfoot) sets the pace for that leg, so a trek that starts in grassland and crosses a belt of forest or jungle slows down exactly where the hard ground is, instead of treating the whole trip as the starting hex's terrain.
  - **Watch the party move across the map.** The Journey Detail day log now lists the hexes crossed each day — named where you've drawn them, shown by hex number where you haven't — and marks where the party is **right now** (📍). And the travellers themselves (and their party) are **placed at the hex they've reached** as the journey advances, not moved only on arrival — so the roster and map show them progressing along the route. (They settle at the nearest hex you've actually placed; across un-drawn stretches they hold at the last one until they reach the next.)

  Where you haven't drawn a particular hex along the way, the journey falls back to the starting hex's terrain and road state — so **existing campaigns travel exactly as before**, and the new detail rewards filling in the map. (The per-side road/river/ford cartography shipped in 0.13.0–0.14.0; this wires it into travel.)
- **Pick a journey's destination — and its waypoints — straight off the map.** The Start-a-Journey planner has **🗺 choose from map** links for both the Destination and the Waypoints: jump to the map, click the hex(es) you want, confirm, and land back in the planner with everything filled in (and everything else you'd entered left intact). The **destination** is a single click (re-click to change your mind). **Waypoints** are multi-click — click hexes in the order you want to visit them, click one again to drop it — and they show in the planner as ordered, removable chips instead of the old checkbox list. As you pick, the **map draws the route live**: start in green, destination in red, numbered waypoints in between, joined by a dashed line — so you watch the path take shape, and the preview shows whether or not the Journeys map layer is switched on. Handy when you know *where* places sit on the map but not their hex numbers.
- **Change a journey's destination or waypoints mid-trip — on the map.** A journey already under way can be re-routed without starting over. Open it and click **🗺 View on map** to see its route drawn and the view centred on it (the journey you're viewing stays visible even if you've switched the Journeys map layer off), then use **✎ Change destination** or **✎ Change waypoints** right there — click the new hex(es), watch the route redraw, and confirm. The party keeps going **from exactly where it is** (it doesn't jump back to the start), the journey still remembers where it originally set out from, and re-routing also gets a lost party back on a heading. (Side effect of the same work: a journey with waypoints now travels its *whole* route through each one, instead of cutting the corner once it had covered the straight-line distance.)

### Changed
- **Activities now opens on Journeys.** The Activities tabs lead with **Journeys** (then Ventures, Hijinks, Spell Research) instead of Ventures, and opening Activities lands on the Journeys panel — the active day-aware subsystem — rather than the Ventures list.

## [0.14.0] - 2026-06-03

### Added
- **Create Map — lay out a whole grid of blank hexes at once** (a ➕ Create Map button on the 🗺 Map tab, and the first thing you see on an empty map). Pick a size — 10×10, 25×25, 50×50, 100×100, or any custom width × height — and the tool fills in that many blank hexes (no terrain, unexplored, unclaimed), numbered in the published column·row convention from `0101`, ready to paint a world onto. Hexes you already have are **kept, never overwritten** — the grid fills in around them — so you can also use it to extend an existing map outward. An optional starting column/row places the block wherever you want, and a live preview shows how many hexes it will add (and how many already exist in range).
- **Reassign a hex to a different domain from the hex detail panel.** The hex popup now has a **Domain** dropdown — every domain, plus *Unclaimed wilderness* — so you can move a hex between realms (or release it to the wild) without leaving the panel; it re-homes the hex, re-anchors the open panel to it, and is recorded in the event log like every other edit. Previously this was only possible from the map's Add/Edit-hexes mode.
- **Delete a hex from the World ▸ Hexes list.** Each row's Actions column now has a **delete** next to **edit**. It removes the hex entirely — from the map and from its domain — and takes its settlement with it; if the hex holds a settlement, lairs, dungeons, or points of interest, the confirmation names what will be lost first. (To merely take a hex *out* of a domain without deleting it, set its **Domain** to *Unclaimed wilderness* instead.)
- **Create and see unclaimed (wilderness) hexes in World ▸ Hexes.** The “+ add hex” control now offers *Unclaimed wilderness* alongside the domains, and the Hexes list shows domainless hexes too — it aggregates the whole campaign, not just owned hexes — so you can build the map out between and beyond your domains and claim a hex later via its Domain field. Unclaimed hexes start **unexplored** (uncharted until you survey them).

### Changed
- **The map's Add/Edit hexes panel now opens the moment you turn the mode on** — you no longer have to click a cell first to see it. With no hex selected it sets the **defaults for the next hex** (domain + terrain): choose them, then click an empty cell to place a hex with those settings (they carry over instead of resetting), or click an existing hex to edit it. Rivers/roads and Save appear once a cell is selected. "Done" leaves the mode.
- **"+ add hex" now places the hex on the map.** Both the per-domain Hexes table (Domain ▸ Demographics) and **World ▸ Hexes** "+ add hex" now open the Map in Add/Edit mode with your chosen target — a domain, or *Unclaimed wilderness* — pre-selected in the usual hex picker; click an empty cell to place the hex and you're returned to where you started (the domain, or the Hexes list), with cancelling bringing you straight back too. (On a still-empty map, where there's nothing to click yet, it falls back to creating the hex inline.)
- **The hex panel's Terrain field is now a dropdown** (the same terrain catalog the map's Add/Edit-hexes editor uses) instead of a free-text box, so terrains stay consistent with the map's colouring and travel rules. A hex whose terrain isn't in the catalog (e.g. an older "plains"/"coast") keeps its value — it's offered as a "(current)" choice and stays selected — and "— none —" clears it. The change is logged like any other hex edit.
- The per-domain **Hexes** table (Domain ▸ Demographics) is tidier: the row-level **×** delete column and the trailing **World / edit ↗** column are both gone. The hex's coordinate is itself the link that opens the hex detail panel, so the separate edit link was redundant; and to take a hex out of a domain you open it and set its **Domain** to *Unclaimed wilderness* (which keeps the data consistent, unlike the old delete button).

### Fixed
- **A hex that belongs to a domain is no longer treated as unclaimed after loading.** Hexes store their domain in two places — a canonical `domainId` and each domain's hex list — and on load the tool backfills the first from the second. That backfill could miss the surviving copy of a hex when the campaign file (or the in-browser session cache) already listed it at the top level without a `domainId`, so the hex would show as unclaimed grey on the map's domain colouring and drop out of domain hex filters even though it sat squarely inside a domain. Loading a campaign now backfills the domain association onto the copy that's actually kept, and opening a hex whose association is still missing repairs it on the spot from its domain's hex list.
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
