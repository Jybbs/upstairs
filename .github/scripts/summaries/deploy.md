## 🛰️ Deploy

The site is live at [{{site.url}}]({{site.url}}), built from {{commit}} on `{{ref}}`.

{{failed}} failed at {{commit}} on `{{ref}}`.

| **Job** | **Result** |
|---|---|
{{jobs}}

`🌐 Site` publishes the pressed site to the Cloudflare Pages project `upstairs`, a push to `main` as the production deployment served at [upstairs.fyi](https://upstairs.fyi) and a pull request opened from a branch of this repository as a preview deployment of its branch. `📡 Catalog` publishes the Worker `upstairs-catalog`, which serves [upstairs.fyi/catalog.bin](https://upstairs.fyi/catalog.bin), on a push to `main` alone. Each job's log is in [the workflow run]({{run}}).
