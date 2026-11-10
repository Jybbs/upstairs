# Contributing to Upstairs

*Upstairs* runs every install, check, and build through the [mise](https://mise.jdx.dev/) tasks under `.mise/tasks/`, so a laptop and a pull request run the same commands. This guide lists those tasks, the checks a pull request has to pass, and the labels an issue or a pull request carries.

## Setting Up

1. Install [mise](https://mise.jdx.dev/getting-started.html)
2. Run `mise install` from the repository, which installs the tools at the versions `.mise/mise.lock` pins
3. Run `mise run site:install`, which installs the packages `docs/bun.lock` resolves with their install scripts off
4. Run `mise serve` to serve the site locally

The site reads the satellite catalog from `docs/public/catalog.bin`, which `mise run catalog` downloads from [CelesTrak](https://celestrak.org/). CelesTrak publishes new orbital data every two hours and asks for one download per update, so the task runs only when the catalog itself has to move.

## Tasks

| **Command** | **Runs** |
|---|---|
| `mise serve` | *VitePress's dev server, reloading a page as it is edited* |
| `mise press` | *VitePress's build of the site into `docs/.vitepress/dist/`* |
| `mise compile` | *The orbit crate under `rust/` compiled to WebAssembly, its bindings written into `rust/pkg/`, which `mise serve` and `mise press` each run first* |
| `mise test` | *The site's suite under `docs/.vitepress/tests/`* |
| `mise answers` | *The orbit crate's tests, holding its results to the known answers under `docs/.vitepress/tests/fixtures/`* |
| `mise ci` | *Every check a pull request runs, listed under Checks below* |
| `mise relock` | *`mise lock`, `bun install`, and `cargo update --workspace`, re-resolving each lockfile after its manifest changes* |
| `mise lift` | *A list of the newer version of each pinned tool and package* |
| `mise labels` | *The labels in `.github/labels.toml`, sent to GitHub once approved* |
| `mise rulesets` | *The settings in `.github/settings.toml`, the About box in `docs/package.json`, and the rulesets under `.github/rulesets/`, sent to GitHub once approved* |

`mise tasks` lists every task with its description. `mise labels` and `mise rulesets` each prompt for confirmation before they write to GitHub.

## Checks

Each pull request runs `🛰️ CI`, one row per check below, and the `🔭 Brief` gate that the `main` ruleset requires reads every row as one verdict.

| **Row** | **Local Command** | **Fails When** |
|---|---|---|
| `🧷 Catalog Types` | `mise run catalog:typecheck` | *`tsc` reports a type error in the catalog service under the Workers runtime types* |
| `📎 Clippy` | `mise run crate:lint` | *Clippy reports a warning in the orbit crate under `rust/`, or rustfmt would reformat it* |
| `🦀 Crate Tests` | `mise run crate:test` | *A position, a sighting, or a pass the crate computes for the records under `docs/.vitepress/tests/fixtures/` strays past 10 meters or a thousandth of a degree from the known answers, a position's azimuth taking that thousandth divided by the cosine of its elevation* |
| `🩺 Advisories` | `mise run lock:audit` | *`bun audit` finds an advisory for a package `docs/bun.lock` resolves, `osv-scanner` finds one for a crate `rust/Cargo.lock` resolves, or either cannot reach its advisory database* |
| `🔐 Lockfiles` | `mise run lock:check` | *`.mise/mise.lock`, `docs/bun.lock`, or `rust/Cargo.lock` drifts from its manifest* |
| `📋 Audit` | `mise run repo:audit` | *The registries, the templates, this guide, the workflows, and the rulesets disagree with one another* |
| `🔦 Workflows` | `mise run repo:lint` | *zizmor reports a finding in a workflow or an action manifest* |
| `🎯 Site Coverage` | `mise run site:coverage` | *A test fails, or the coverage falls below the thresholds `docs/.vitepress/vitest.config.ts` declares* |
| `✂️ Knip` | `mise run site:cruft` | *knip reports an unused file, export, or dependency* |
| `🔗 Links` | `mise run site:links` | *A link, an asset, or a heading fragment in the pressed site names nothing the build wrote* |
| `⚓ Oxlint` | `mise run site:lint` | *Oxlint reports a finding in the TypeScript* |
| `📰 Press` | `mise run site:press` | *The site fails to build* |
| `🧷 Types` | `mise run site:typecheck` | *`vue-tsc` reports a type error in the TypeScript or a single-file component* |

## Labels

An issue and a pull request each carry the label of every domain the change lands in, and a defect takes `🐞 bug` beside them. `.github/labels.toml` declares each label, and `.github/release.yml` files it under one category of the release notes.

| **Label** | **Covers** |
|---|---|
| `🐞 bug` | *A defect, filed beside the label of the domain where it breaks* |
| `🗜️ build` | *The package, the toolchain, the workflows, and the release path* |
| `📚 docs` | *The README, the docs site, and the contributor guide* |
| `🎨 identity` | *The mark, the faces, and the palette* |
| `🗺️ map` | *The terrain map, its layers, and the controls drawn on it* |
| `🛰️ orbit` | *The orbit calculation, the pass scan, and the catalog they read* |

## Commits and Pull Requests

- A branch is named `<issue>/<slug>` for the issue it closes
- A commit title reads `type(scope): description`, where the type is one of `feat`, `fix`, `refactor`, `chore`, `docs`, or `test` and the scope is the word of the label the change lands in
- A pull request title reads `[N] Title`, taking the number and the title of the issue it closes, and its body follows the template GitHub opens it with
- Every pull request squash-merges into `main` as one commit titled from the pull request, once `🔭 Brief` passes on a branch up to date with `main`
- Every action a workflow uses is pinned to a full commit, and a pin moves by hand in a change of its own
