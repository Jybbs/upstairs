import { fileURLToPath } from 'node:url'

import { chromium, type Page } from 'playwright'
import sharp                   from 'sharp'
import { createServer }        from 'vitepress'

import type { SchemeName } from '../lib/site/palette.ts'

/**
 * The offsets of a pixel's red, green, and blue in a raw frame.
 */
const CHANNELS = [0, 1, 2]
/**
 * The committed catalog the reel's map reads in place of the live one.
 */
const FIXTURE = fileURLToPath(new URL('../tests/fixtures/catalog.bin', import.meta.url))
/**
 * The folder the reel's files are written to.
 */
const PUBLIC = new URL('../../public/', import.meta.url)
/**
 * The README's preview, the home map at `spot` with its time running at the
 * lapse speed from `lead` milliseconds past `start`, each frame a screenshot
 * of `band` at `density` taken after the page's clock runs on by `step`
 * milliseconds, scaled to `width` pixels and played for `step` milliseconds.
 * The map is dragged `pan.by` pixels sideways in `pan.steps` moves before the
 * first frame, a frame takes up to `tries` screenshots to settle, and each
 * wait is in milliseconds.
 */
export const REEL = {
  band     : { height: 496, width: 1280, x: 0, y: 64 },
  density  : 2,
  frames   : 340,
  hold     : 8,
  lead     : 60_000,
  pan      : { by: -48, steps: 24 },
  refresh  : 4,
  spot     : '42.36,-71.06',
  start    : Date.parse('2026-11-07T02:50:00Z'),
  step     : 20,
  tries    : 8,
  viewport : { height: 720, width: 1280 },
  waits    : { frame: 60, load: 4000, pan: 300, shot: 80, tiles: 3000, tracing: 90_000 },
  width    : 880
}
/**
 * The color scheme Chromium reports for each of the site's schemes.
 */
const SCHEMES_SHOWN = { day: 'light', night: 'dark' } as const satisfies Record<SchemeName, string>

const drag = async (page: Page, reel: typeof REEL) => {
  const { height, width } = reel.viewport
  await page.mouse.move(width / 2, height / 2)
  await page.mouse.down()
  await page.mouse.move(width / 2 + reel.pan.by, height / 2, { steps: reel.pan.steps })
  await page.waitForTimeout(reel.waits.pan)
  await page.mouse.up()
}

const encode = async (frames: Buffer[], reel: typeof REEL, scheme: SchemeName) => {
  const raw  = { channels: 3, height: reelHeightOf(reel), width: reel.width } as const
  const pngs = await Promise.all(frames.map(frame => sharp(frame, { raw }).png().toBuffer()))
  await sharp(pngs, { join: { animated: true } })
    .gif({
      delay                : reel.step,
      dither               : 0,
      effort               : 7,
      interPaletteMaxError : 256,
      keepDuplicateFrames  : true,
      loop                 : 0
    })
    .toFile(fileURLToPath(new URL(reelFileOf(scheme), PUBLIC)))
}

const record = async (page: Page, reel: typeof REEL) => {
  const frames: Buffer[] = []
  await page.click('button[aria-label^="Run the rest"]')
  for (let frame = 0; frame < reel.frames; frame++) {
    await page.clock.runFor(reel.step)
    await page.waitForTimeout(reel.waits.frame)
    const shot = await steadyShotOf(page, reel)
    frames.push(await sharp(shot).resize(reel.width, reelHeightOf(reel)).removeAlpha().raw().toBuffer())
  }
  return frames
}

/**
 * Records the reel in `scheme` from the site served at `site`, the map
 * reading the committed catalog.
 */
const recordReel = async (scheme: SchemeName, site: string, reel = REEL) => {
  const browser = await chromium.launch({ channel: 'chromium' })
  const context = await browser.newContext({
    colorScheme       : SCHEMES_SHOWN[scheme],
    deviceScaleFactor : reel.density,
    viewport          : reel.viewport
  })
  await context.route('**/catalog.bin', route => route.fulfill({ path: FIXTURE }))
  const page = await context.newPage()
  await page.clock.install({ time: reel.start })
  await page.goto(`${site}#${reel.spot}`)
  await page.waitForSelector('main canvas')
  await page.waitForTimeout(reel.waits.load)
  await page.waitForFunction(() => !/tracing/i.test(document.body.innerText), null, {
    timeout: reel.waits.tracing
  })
  await drag(page, reel)
  await page.waitForTimeout(reel.waits.tiles)
  await page.clock.pauseAt(reel.start + reel.lead)
  const frames = await record(page, reel)
  await browser.close()
  await encode(heldFramesOf(frames, reel), reel, scheme)
}

/**
 * Takes screenshots of the band `waits.shot` apart until two match or
 * `tries` run out, so the frame holds every position the worker posts for
 * the clock's current time.
 */
const steadyShotOf = async (page: Page, reel: typeof REEL) => {
  let shot = await page.screenshot({ clip: reel.band })
  for (let attempt = 0; attempt < reel.tries; attempt++) {
    await page.waitForTimeout(reel.waits.shot)
    const next = await page.screenshot({ clip: reel.band })
    if (next.equals(shot)) break
    shot = next
  }
  return shot
}

/**
 * Copies each pixel of each frame from the frame before it where every
 * channel sits within `hold` levels, or within one level on every `refresh`th
 * frame, so the encoder writes only the pixels that move.
 */
export const heldFramesOf = (
  frames : readonly Buffer[],
  reel   : Pick<typeof REEL, 'hold' | 'refresh'> = REEL
) => {
  const held = frames.map(frame => Buffer.from(frame))
  const near = (a: Buffer, b: Buffer, at: number, within: number) => Math.abs(a[at]! - b[at]!) <= within
  for (let i = 1; i < held.length; i++) {
    const [before, next] = [held[i - 1]!, held[i]!]
    const within         = i % reel.refresh ? reel.hold : 1
    for (let at = 0; at < next.length; at += 3)
      if (CHANNELS.every(channel => near(next, before, at + channel, within)))
        before.copy(next, at, at, at + 3)
  }
  return held
}

/**
 * Returns the file under `docs/public/` the reel in `scheme` is written to.
 */
export const reelFileOf = (scheme: SchemeName) => `reel-${scheme}.gif`

/**
 * Returns the reel's height in pixels, the band scaled to the reel's width.
 */
export const reelHeightOf = (reel: Pick<typeof REEL, 'band' | 'width'> = REEL) =>
  Math.round(reel.width * reel.band.height / reel.band.width)

if (import.meta.main) {
  const server = await createServer('.')
  await server.listen()
  for (const scheme of Object.keys(SCHEMES_SHOWN) as SchemeName[]) {
    await recordReel(scheme, server.resolvedUrls!.local[0]!)
    console.log(`Wrote docs/public/${reelFileOf(scheme)}`)
  }
  await server.close()
}
