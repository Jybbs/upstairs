import { glob, mkdir, mkdtempDisposable, readFile, symlink, writeFile } from 'node:fs/promises'
import { tmpdir }        from 'node:os'
import { join }          from 'node:path'
import { fileURLToPath } from 'node:url'

import { build }      from 'vitepress'
import { expect, it } from 'vitest'

import { FIGURES } from '../../docs/.vitepress/lib/site/markdown.ts'

const LINKS    = ['one', 'two', 'three', 'four', 'five'].map(word => `[${word}](https://${word}.example/)`)
const MARKDOWN = fileURLToPath(new URL('../../docs/.vitepress/lib/site/markdown.ts', import.meta.url))

it(
  'keeps a paragraph of five links ahead of a figure whole in the lean page chunk',
  { tags: ['slow'] },
  async () => {
    await using scratch = await mkdtempDisposable(join(tmpdir(), 'upstairs-hydration-'))
    const assets        = join(scratch.path, '.vitepress/dist/assets')
    await symlink(new URL('../../node_modules', import.meta.url), join(scratch.path, 'node_modules'))
    await mkdir(join(scratch.path, '.vitepress'))
    await writeFile(join(scratch.path, '.vitepress/config.mts'),
      `import { markdownOf } from '${MARKDOWN}'\nexport default { markdown: { config: markdownOf() } }\n`)
    await writeFile(join(scratch.path, 'index.md'), `Read from ${LINKS.join(', ')} at {{ home }}.\n`)
    await build(scratch.path)
    const [paragraph]  = (await readFile(join(scratch.path, '.vitepress/dist/index.html'), 'utf8'))
      .match(/<p>Read from .*?<\/p>/)!
    const names        = (await Array.fromAsync(glob('index.md.*.js', { cwd: assets }))).sort()
    const [full, lean] = await Promise.all(names.map(name => readFile(join(assets, name), 'utf8')))
    expect(paragraph).toContain(`five</a> at ${FIGURES.home}.</p>`)
    expect(full).toContain(`\`${paragraph}\`,1)`)
    expect(lean).toBe(full!.replace(`\`${paragraph}\``, '""'))
  }
)
