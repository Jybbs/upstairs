# Contributing to Upstairs

*Upstairs* runs every install, check, and build through the [mise](https://mise.jdx.dev/) tasks under `.mise/tasks/`, so a laptop and a pull request run the same commands. This guide lists those tasks, the checks a pull request has to pass, and the labels an issue or a pull request carries.

## Setting Up

1. Install [mise](https://mise.jdx.dev/getting-started.html)
2. Run `mise install` from the repository, which installs the tools at the versions `.mise/mise.lock` pins
3. Run `mise run site:install`, which installs the packages `docs/bun.lock` resolves with their install scripts off
4. Run `mise serve` to serve the site locally

The site reads the satellite catalog from `docs/public/catalog.bin`, which `mise run catalog` writes from the elements [Space-Track](https://www.space-track.org/) serves and the satellite catalog [CelesTrak](https://celestrak.org/) keeps, known as SATCAT. Space-Track asks for its elements at most once an hour and CelesTrak for one download per update, so the task runs only when the catalog itself has to move, reading the Space-Track login [The Catalog Service](#the-catalog-service) sets up.

## Tasks

| **Command** | **Runs** |
|---|---|
| `mise serve` | *VitePress's dev server, reloading a page as it is edited* |
| `mise press` | *VitePress's build of the site into `docs/.vitepress/dist/`* |
| `mise compile` | *The orbit crate under `rust/` compiled to WebAssembly, its bindings written into `rust/pkg/`, which `mise serve` and `mise press` each run first* |
| `mise test` | *The site's suite under `docs/.vitepress/tests/`* |
| `mise check` | *Oxlint and `vue-tsc` over the site together with the cases of its suite the branch's changes since `origin/main` reach, or the whole suite where a change reaches a file a case reads off disk, the crate under `rust/`, or the tools and tasks under `.mise/`, skipping a tree an earlier run passed* |
| `mise answers` | *The orbit crate's tests, holding its results to the known answers under `docs/.vitepress/tests/fixtures/`* |
| `mise reel` | *The README's preview of the home map, recorded frame by frame from the fixture catalog under `docs/.vitepress/tests/fixtures/` into `.github/` in each scheme, in a Chromium the task installs under `.cache/playwright/` on its first run* |
| `mise ci` | *Every check a pull request runs, listed under Checks below* |
| `mise relock` | *`mise lock`, `bun install`, and `cargo update --workspace`, re-resolving each lockfile after its manifest changes* |
| `mise lift` | *A table of every tool, package, crate, and action pinned behind its newest release with any hold on it, each lift tried in a scratch copy of the tree under `--try`, the passing lifts written onto the branch under `--write`, and a hold recorded in `.mise/holds.toml` under `--hold <pin> <reason>`* |
| `mise labels` | *The labels in `.github/labels.toml`, sent to GitHub once approved, where a row renames the live label whose word it shares once no other row names that label* |
| `mise rulesets` | *The settings in `.github/settings.toml`, the About box in `docs/package.json`, and the rulesets under `.github/rulesets/`, sent to GitHub once approved, with the GitHub Pages site created where `pages` turns on and none exists* |

`mise tasks` lists every task with its description. `mise labels` and `mise rulesets` each prompt for confirmation before they write to GitHub.

## Checks

Each pull request runs `🛰️ CI`, one row per check below, and the `📓 Logbook` gate that the `main` ruleset requires writes each row's result into the run's summary and passes only where every row passed or was skipped.

| **Row** | **Local Command** | **Fails When** |
|---|---|---|
| `🎒 Bundle` | `mise run catalog:bundle` | *Wrangler fails to compile the catalog service as a deploy would, or a binding in `docs/.vitepress/catalog/wrangler.json` names a class the service does not export* |
| `📎 Clippy` | `mise run crate:lint` | *Clippy reports a warning in the orbit crate under `rust/`, or rustfmt would reformat it* |
| `🪚 Suite` | `mise run crate:test` | *A position, a sighting, or a pass the crate computes for the records under `docs/.vitepress/tests/fixtures/` strays past 10 meters or a thousandth of a degree from the known answers, a position's azimuth taking that thousandth divided by the cosine of its elevation* |
| `🩺 Advisories` | `mise run lock:audit` | *`bun audit` finds an advisory for a package `docs/bun.lock` resolves, save one `AUDIT_IGNORE` in `.mise/config.toml` lists beside its reason while no release patches it, a listed advisory gains a patched release, the failure naming the entry to delete and the version to lift to, [`gh`](https://cli.github.com/) cannot read a listed advisory from GitHub's [global advisories](https://docs.github.com/en/rest/security-advisories/global-advisories), `cargo-deny` finds an advisory, yanked crate, license, duplicate version, wildcard, or source `rust/.cargo/deny.toml` denies for a crate `rust/Cargo.lock` resolves, or either cannot reach its advisory database* |
| `🔐 Lockfiles` | `mise run lock:check` | *`.mise/mise.lock`, `docs/bun.lock`, or `rust/Cargo.lock` drifts from its manifest* |
| `📋 Audit` | `mise run repo:audit` | *The release categories, the issue templates, or this guide disagree with the label registry, this guide misses the gate or a row beside the task it runs, a ruleset requires a check other than the gate, `repo:ci` and the rows run different tasks, a workflow or an action runs a task `.mise/tasks/` does not declare, a job restores a tool set that no `🛰️ Warm` row saves, a label in `.github/labels.toml` breaks the registry's form in its keys, color, description, or order, shares another label's name, or comes under 15 from another label's color in OKLab, a package in `docs/package.json` sits at a range rather than one exact version, an action from outside the repository names no full commit or two different ones, a matrix row holds a key other than `name`, `task`, and `tools`, a workflow ends on no job that needs every other job, or `🏷️ Cut`, `📡 Catalog`, or `🌐 Site` is missing from its workflow or runs under a condition other than the one the audit sets for it* |
| `🔦 Workflows` | `mise run repo:lint` | *zizmor reports a finding in a workflow or an action manifest* |
| `☂️ Coverage` | `mise run site:coverage`, then `mise run gha:total -- .cache/coverage` | *A test fails, the coverage falls below the thresholds `docs/.vitepress/tests/vitest.config.ts` declares, or the suite writes no summary for the coverage figure to read* |
| `✂️ Knip` | `mise run site:cruft` | *knip reports an unused file, export, or dependency* |
| `🔗 Links` | `mise run site:links` | *A link, an asset, or a heading fragment in the pressed site names nothing the build wrote* |
| `⚓ Oxlint` | `mise run site:lint` | *Oxlint reports a finding in the TypeScript* |
| `📰 Press` | `mise run site:press` | *The site fails to build* |
| `🚩 Types` | `mise run site:typecheck` | *`vue-tsc` reports a type error in the TypeScript against the DOM types, the components included, or `tsc` reports one in the catalog service, the preview's Pages Function, or their tests against the Workers runtime types* |

## Deploying

Each push to `main` that changes what the site or its coverage figure is built from runs `🛰️ Deploy`, which also runs by hand through `workflow_dispatch`. `📰 Press` presses the site and checks its links, and on a push or a run by hand it also runs the suite under coverage, writing the share of lines it covered into the pressed site as `coverage.json` for the README's coverage badge. It then attaches the pressed site to the workflow run. Once it passes, `🌐 Site` downloads it and sends it to the [Cloudflare Pages](https://developers.cloudflare.com/pages/) project `upstairs` through a [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/) naming the branch the run checks, which on `main` makes the production deployment, and `📡 Catalog` deploys the Worker under `docs/.vitepress/catalog/`, so a failed press publishes neither. Both jobs run the [`wrangler`](https://developers.cloudflare.com/workers/wrangler/) that `docs/bun.lock` resolves, and a run started by hand on a branch other than `main` runs neither, so it presses and checks the site without publishing it, and no step downloads anything from CelesTrak.

A pull request that changes the same files runs `🛰️ Deploy` too. Where it is opened from a branch of this repository, `🌐 Site` sends the pressed site to the same project as a [preview deployment](https://developers.cloudflare.com/pages/configuration/preview-deployments/) of the pull request's branch, leaving production as it stands, whereas `📡 Catalog` runs on `main` alone. A preview's upload alone carries the [Pages Function](https://developers.cloudflare.com/pages/functions/) under `docs/.vitepress/preview/functions/`, which answers `/catalog.bin` on the preview with the response `upstairs.fyi/catalog.bin` gives at the time of the request. The run's summary opens on the address of the deployment `🌐 Site` made, beside the commit and the branch it was built from, or on each job that failed.

`docs/public/_headers` sets the [headers](https://developers.cloudflare.com/pages/configuration/headers/) the site is served with, giving the files under `/assets/`, each named by its content hash, a year's cache lifetime and limiting geolocation to the site's own origin.

The first deploy creates the Workers KV namespace the service stores the catalog in, and each later deploy reuses it. Setting up the deploy takes these steps by hand, once:

1. Add a Cloudflare API token allowed to edit Cloudflare Pages, Workers Scripts, Workers KV Storage, and the Workers Routes of the `upstairs.fyi` zone to the repository's secrets as `CLOUDFLARE_TOKEN`, beside the account's ID as `CLOUDFLARE_ACCOUNT_ID`
2. Confirm that a request for `upstairs.fyi/catalog.bin` and one for `upstairs.fyi/catalog/run` each reach the Worker rather than the Pages project
3. Confirm that the `upstairs` project names `main` as its production branch and has `upstairs.fyi` attached as a custom domain, since a deploy to any other branch makes a [preview](https://developers.cloudflare.com/pages/configuration/preview-deployments/) the custom domain never serves, and a Direct Upload project changes that branch only through the [Update Project](https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/edit/) endpoint

The catalog service runs once an hour, at the minute `wrangler.json` schedules, querying Space-Track for the elements and storing those of the payloads SATCAT marks active. A rejected login, a failed query, an answer that is not a catalog, an answer holding fewer than 5000 payloads SATCAT marks active, or a failed write to Workers KV logs `catalog.failed` and keeps the stored catalog. It reads CelesTrak's SATCAT directory on each run and downloads SATCAT only where the directory lists a newer file, and stores nothing while no SATCAT is kept. The service waits after a failed SATCAT request rather than stopping, and the wait ends on its own, while the hourly query goes on with the SATCAT kept. An answer from CelesTrak other than 200 is a refusal, which waits an hour, the most often CelesTrak [asks that a directory be read](https://celestrak.org/usage-policy.php), then doubles with each refusal since the last request that succeeded, and runs as long as a `retry-after` header asks where that is longer, the wait stopping at a day in either case. A 403 whose body says the data has not updated since the last successful download is no refusal. It waits for the next scheduled run whatever `retry-after` asks, and leaves the count of refusals where it stood. A run up to a minute short of an hour after the last attempt, or of the end of a wait, still runs, since the time each scheduled run reads falls a few seconds past the minute it is scheduled for. The cycle so keeps to one download per update, as CelesTrak's [usage policy](https://celestrak.org/usage-policy.php) asks, and stays clear of the repeated errors that send an address to CelesTrak's firewall, without waiting on a person to resume it. A SATCAT directory or file that fails its check and no region connecting or no headers arriving within the wait each wait for the next scheduled run, and a request to CelesTrak that succeeds ends the wait. The service logs each wait once at error level as one object holding the event `catalog.waiting`, the time, the time the wait ends, the refusals since the last request that succeeded, the kind of failure, the reason, and the region the failure came through, or the result of each region where none connects. For an answer other than 200, the object also keeps the status, the `retry-after`, `location`, `content-type`, and `cf-ray` headers, and the start of the body. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/) indexes that object field by field and [Workers Observability Issues](https://developers.cloudflare.com/workers/observability/issues/) records it as an occurrence, while each scheduled run the wait blocks logs it again under `catalog.blocked`, and the request that ends it logs `catalog.recovered` beside the wait it ends. Once the Worker is deployed, `📡 Catalog` deletes the `ALERT_TO` and `RESUME_TOKEN` secrets earlier versions of the service read, wherever either is still bound, and then fails unless `upstairs.fyi/catalog.bin` answers 200 with a catalog, naming the answer it got in the run's summary.

A request to the service starts one cycle at once, so whether a deploy reaches Space-Track and stores a catalog is known within a minute rather than at the next scheduled run. `mise run catalog:mint` makes a random token, sets it as the service's `RUN_TOKEN` secret through Wrangler, and saves it in the `upstairs.fyi` entry of `~/.netrc` once the secret is set, and it runs as `CLOUDFLARE_API_TOKEN=… mise run catalog:mint` with a Cloudflare API token allowed to edit Workers Scripts. `mise run catalog:run` then sends a `POST` carrying the saved token to `upstairs.fyi/catalog/run`, which runs the same cycle as the hourly schedule and answers with its outcome as JSON, and the task prints that outcome and fails unless the elements were stored. A run under an hour after the last attempt, whether scheduled or requested, returns `early` and runs nothing, which holds the service to the one `gp` query an hour that Space-Track's [API guidelines](https://www.space-track.org/documentation#api-use-guidelines) allow. A request without the token is answered 404 with an empty body, as is every path the service does not serve, and neither task prints the token.

## The Catalog Service

The catalog service queries [Space-Track](https://www.space-track.org/) with a login it holds as a secret, which the tasks below save, check, and set. The account is free, and each person or entity running the catalog service registers their own at <https://www.space-track.org/auth/createAccount>, since the User Agreement gives each user or entity an account of their own and forbids sharing a username or password. Space-Track approves a new account before it can log in, and asks an approved account to renew its access from time to time.

- `mise run catalog:login` prompts for the account's username, offering the one already saved, and for its password, hidden as it is typed, then logs in to Space-Track once and out again, saving the login in the `www.space-track.org` entry of `~/.netrc` once Space-Track accepts it
- `mise run catalog:login --check` logs in once with the saved login, writing nothing, and fails where no login is saved or Space-Track rejects it
- `mise run catalog:login --worker` sets the saved login as the deployed catalog service's secrets through Wrangler, under the Cloudflare login Wrangler holds, so no file, workflow, or log in the repository carries it

## Releasing

Each push to `main` that changes `docs/package.json` runs `🛰️ Draft`, which also runs by hand from `main` through `workflow_dispatch`. `🏷️ Cut` compares the version the manifest carries with the one it carried before the push and stops where the version did not move, as on a dependency change. Where it moved, or on a run by hand, the job reads the repository's releases and creates a draft with [generated notes](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes), grouped by the categories in `.github/release.yml`, where no release carries the version yet. A draft already carrying it stays as it is, a published release carrying it skips the cut with a warning, and a read that fails fails the run, so one version never holds two drafts. Publishing the draft from the Releases page lands its tag on the commit the run drafted from. The shield at the foot of the home page, at the end of the hour's list in a phone's sheet, and below the reading column of every doc page shows the version, the commit the site was pressed from, and the `sgp4` version `rust/Cargo.lock` resolves.

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

A page sets a formula through [KaTeX](https://katex.org/docs/supported.html), between `$` inline and between `$$` on a line of its own, and loads KaTeX's stylesheet only where it sets one. An issue takes the same delimiters, which GitHub [renders itself](https://docs.github.com/en/get-started/writing-on-github/working-with-advanced-formatting/writing-mathematical-expressions). A study is cited through a footnote keyed `<surname><year>` to its entry in `docs/.vitepress/lib/site/references.bib`, which holds each cited work with its DOI, or with its publisher's page where it has none. A page writes only the marker, such as `[^vallado2006]`, and the site sets the entry at the page's foot, whereas an issue writes the footnote's text beside the marker.

## Commits and Pull Requests

- A branch is named `<issue>/<slug>` for the issue it closes
- A commit title reads `type(scope): description`, where the type is one of `feat`, `fix`, `refactor`, `chore`, `docs`, or `test` and the scope is the word of the label the change lands in
- A pull request title reads `[N] Title`, taking the number and the title of the issue it closes, and its body follows the template GitHub opens it with
- Every pull request squash-merges into `main` as one commit titled from the pull request, once `📓 Logbook` passes on a branch up to date with `main`
- Every action a workflow uses is pinned to a full commit, and a pin moves by hand in a change of its own
