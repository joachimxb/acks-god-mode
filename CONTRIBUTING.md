# Contributing to ACKS God Mode

Thanks for your interest in improving ACKS God Mode. This is the public statement of the project's Git, release, and contribution policy.

## Branches & the deploy model

- **`main`** is the always-stable integration line. Every change lands here through a pull request, and it stays releasable at all times. `main` is **not** the public site.
- **`release`** is the deployed public site — GitHub Pages serves the `release` branch. Nothing is live until it is on `release`.
- **All work happens on dedicated branches** — never directly on `main` or `release`. `main` is branch-protected, so a PR is required (no direct pushes).
- **Branch naming:** `category/short-description`, lowercase-hyphenated. Categories: `feature/`, `fix/`, `hotfix/`, `chore/`, `docs/`, `refactor/`. Example: `feature/treasure-generator`.

## Workflow

1. Branch off `main` (`category/short-desc`).
2. Commit in logical chunks using **[Conventional Commits](https://www.conventionalcommits.org/)** — `type: short description`, where `type` is one of `feat`, `fix`, `docs`, `chore`, `refactor`, `test`. Example: `feat: add day-tick orchestrator`.
3. Push your **branch** (never `main` or `release`). For any user-visible change, add an entry under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md).
4. Open a **pull request into `main`**. Please don't self-merge — the maintainer reviews and merges.
5. The maintainer reviews and merges. (Merging to `main` does **not** deploy — see Releases.)

Run the test suite before opening a PR:

```sh
npm test
```

There are no runtime dependencies; the suites load the engine modules headless in Node.

## Releases

Releases are the maintainer's action. The maintainer merges `main → release` — **this merge is the deploy** (GitHub Pages rebuilds `release`) — tags the release commit `vMAJOR.MINOR.PATCH`, and cuts a GitHub Release whose notes are the matching `CHANGELOG.md` section (stable builds marked **Latest**).

Builds meant for someone else to test are cut as **pre-releases** (`-beta` / `-rc`, e.g. `v0.10.0-rc.1`) with GitHub's "pre-release" box checked, and are **not** merged to `release` (that would make them public).

## Versioning

The project follows **[Semantic Versioning](https://semver.org/)** (`MAJOR.MINOR.PATCH`): PATCH for bug fixes, MINOR for backward-compatible features, MAJOR for breaking changes. **Current version: `0.10.0`** (the first tagged release; `0.9.0` was the Community Preview baseline).

While the project is pre-1.0 (`0.x`), anything may still change between minor versions — a MINOR bump may carry both features and the occasional breaking tweak. `1.0.0` will land once the roadmap milestones are complete and the `.acks.json` save contract is stable enough to promise a MAJOR bump before any breaking change. (Roadmap "Milestone A–D" labels are planning buckets, not version tags.)

## License & contributor agreement

ACKS God Mode is licensed under **AGPL-3.0** — see [`LICENSE.txt`](LICENSE.txt).

Because the project keeps a single copyright holder, **every external pull request must include this line in its description**:

> I assign copyright of this contribution to Joachim Buchert.

That one line covers small contributions (typo fixes, single-file patches, doc edits). Substantial contributions (new subsystems, large features) may need a more formal agreement — we'll discuss that on the PR before merging. A PR without the assignment line can't be merged.

ACKS II is published by Autarch / Imperial Imprint; this is an unofficial community tool. Please don't reproduce rulebook text verbatim in contributions — cite page numbers and use mechanical values instead.
