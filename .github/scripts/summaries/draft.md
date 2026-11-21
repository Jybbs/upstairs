## 🛰️ Draft

| **Job** | **Result** |
|---|---|
{{jobs}}

On every push to `main` and on a run by hand, `🏷️ Cut` creates a draft release with generated notes where no release carries the version in `docs/package.json`, refreshes the notes and the target of the draft where only a draft carries it, and fails where a published release carries it, its annotation naming the outcome. Publishing the draft from the [Releases page](https://github.com/Jybbs/upstairs/releases) lands its tag. Each job's log is in [the workflow run]({{run}}).
