## 🛰️ Draft

| **Job** | **Result** |
|---|---|
{{jobs}}

`🏷️ Cut` creates a draft release with generated notes where no release carries the version in `docs/package.json` yet, on a run by hand or once a push moves the version, and its annotation names the outcome. Publishing the draft from the [Releases page](https://github.com/Jybbs/upstairs/releases) lands its tag. Each job's log is in [the workflow run]({{run}}).
