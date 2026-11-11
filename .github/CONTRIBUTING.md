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
| `mise labels` | *The labels in `.github/labels.toml`, sent to GitHub once approved, where a row renames the live label whose word it shares once no other row names that label* |
| `mise rulesets` | *The settings in `.github/settings.toml`, the About box in `docs/package.json`, and the rulesets under `.github/rulesets/`, sent to GitHub once approved, with the GitHub Pages site created where `pages` turns on and none exists* |

`mise tasks` lists every task with its description. `mise labels` and `mise rulesets` each prompt for confirmation before they write to GitHub.

## Checks

Each pull request runs `🛰️ CI`, one row per check below, and the `📓 Logbook` gate that the `main` ruleset requires writes each row's result into the run's summary and passes only where every row passed or was skipped.

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

## Deploying

Each push to `main` that changes what the site is built from runs `🛰️ Deploy`, which also runs by hand through `workflow_dispatch`. `📰 Press` presses the site, checks its links, and attaches the pressed site to the workflow run. Once it passes, `🌐 Site` downloads it and sends it to the [Cloudflare Pages](https://developers.cloudflare.com/pages/) project `upstairs` through a [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) naming the branch the run checks, which on `main` makes the production deployment, and `📡 Catalog` deploys the Worker under `docs/.vitepress/catalog/`, so a failed press publishes neither. Both jobs run the [`wrangler`](https://developers.cloudflare.com/workers/wrangler/) that `docs/bun.lock` resolves, and a run started by hand on a branch other than `main` runs neither, so it presses and checks the site without publishing it, and no step downloads anything from CelesTrak.

A pull request that changes the same files runs `🛰️ Deploy` too. Where it is opened from a branch of this repository, `🌐 Site` sends the pressed site to the same project as a [preview deployment](https://developers.cloudflare.com/pages/configuration/preview-deployments/) of the pull request's branch, leaving production as it stands, whereas `📡 Catalog` runs on `main` alone. A preview's upload alone carries the [Pages Function](https://developers.cloudflare.com/pages/functions/) under `docs/.vitepress/preview/functions/`, which answers `/catalog.bin` on the preview with the response `upstairs.fyi/catalog.bin` gives at the time of the request. The run's summary opens on the address of the deployment `🌐 Site` made, beside the commit and the branch it was built from, or on each job that failed.

`docs/public/_headers` sets the [headers](https://developers.cloudflare.com/pages/configuration/headers/) the site is served with, giving the files under `/assets/`, each named by its content hash, a year's cache lifetime and limiting geolocation to the site's own origin.

The first deploy creates the Workers KV namespace the service stores the catalog in, and each later deploy reuses it. Setting up the deploy takes these steps by hand, once:

1. Add a Cloudflare API token allowed to edit Cloudflare Pages, Workers Scripts, Workers KV Storage, and the Workers Routes of the `upstairs.fyi` zone to the repository's secrets as `CLOUDFLARE_TOKEN`, beside the account's ID as `CLOUDFLARE_ACCOUNT_ID`
2. Onboard `upstairs.fyi` to [Email Routing](https://developers.cloudflare.com/email-service/get-started/route-emails/), which lets the Worker send from the address in `ALERT_FROM`, and add the address the service alerts as a [verified destination address](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/#destination-addresses) on the account, since sending to a verified destination is [free on every plan](https://developers.cloudflare.com/email-service/platform/pricing/) whereas sending to any other address takes the Workers Paid plan
3. Once the first deploy runs, set `ALERT_TO` to that address and `RESUME_TOKEN` to a random string as the Worker's [secrets](https://developers.cloudflare.com/workers/configuration/secrets/), by running `mise x -- bun x --no-install wrangler secret put ALERT_TO --config .vitepress/catalog/wrangler.json` from `docs/`, and then the same with `RESUME_TOKEN`, which runs the `wrangler` the deploy runs
4. Confirm that a request for `upstairs.fyi/catalog.bin` reaches the Worker rather than the Pages project
5. Confirm that the `upstairs` project names `main` as its production branch and has `upstairs.fyi` attached as a custom domain, since a deploy to any other branch makes a [preview](https://developers.cloudflare.com/pages/configuration/preview-deployments/) the custom domain never serves, and a Direct Upload project changes that branch only through the [Update Project](https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/edit/) endpoint

## Labels

An issue and a pull request each carry the label of every domain the change lands in, and a defect takes `🐞 bug` beside them. `.github/labels.toml` declares each label, and `.github/release.yml` files it under one category of the release notes.

| **Label** | **Covers** |
|---|---|
| `🐞 bug` | *A defect, filed beside the label of the domain where it breaks* |
| `🗜️ build` | *The package, the toolchain, the workflows, and the release path* |
| `📚 docs` | *The README, the docs site, and the contributor guide* |
| `🎨 identity` | *The mark, the faces, and the palette* |
| `🗺️ map` | *The terrain map, its layers, and the controls drawn on it* |
| `🌎 orbit` | *The orbit calculation, the pass scan, and the catalog they read* |

## Math and Citations

A page sets a formula through [KaTeX](https://katex.org/docs/supported.html), between `$` inline and between `$$` on a line of its own, and loads KaTeX's stylesheet only where it sets one. An issue takes the same delimiters, which GitHub [renders itself](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/writing-mathematical-expressions). A study is cited through a footnote keyed `<surname><year>` to its entry in `docs/references.bib`, which holds each cited work with its DOI, or with its publisher's page where it has none. A page writes only the marker, such as `[^vallado2006]`, and the site sets the entry at the page's foot, whereas an issue writes the footnote's text beside the marker.

## Commits and Pull Requests

- A branch is named `<issue>/<slug>` for the issue it closes
- A commit title reads `type(scope): description`, where the type is one of `feat`, `fix`, `refactor`, `chore`, `docs`, or `test` and the scope is the word of the label the change lands in
- A pull request title reads `[N] Title`, taking the number and the title of the issue it closes, and its body follows the template GitHub opens it with
- Every pull request squash-merges into `main` as one commit titled from the pull request, once `📓 Logbook` passes on a branch up to date with `main`
- Every action a workflow uses is pinned to a full commit, and a pin moves by hand in a change of its own
