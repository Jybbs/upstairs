## 🛰️ Deploy

| **Job** | **Result** |
|---|---|
{{jobs}}

`🌐 Site` publishes the pressed site to the Cloudflare Pages project `upstairs`, served at [upstairs.fyi](https://upstairs.fyi), and `📡 Catalog` publishes the Worker `upstairs-catalog`, which serves [upstairs.fyi/catalog.bin](https://upstairs.fyi/catalog.bin). A run from a branch other than `main` skips both. Each job's log is in [the workflow run]({{run}}).
