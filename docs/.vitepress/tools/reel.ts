/**
 * Records the README's preview of the home map in each scheme from the site
 * served locally, writing one GIF per scheme under `.github/`.
 */
import { writeFile }     from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import { GIFEncoder, applyPalette, quantize } from 'gifenc'
import { chromium, type Page }               from 'playwright'
import sharp                                 from 'sharp'
import { createServer }                      from 'vitepress'

import type { SchemeName } from '../lib/site/palette.ts'

/**
 * The offsets of a pixel's red, green, and blue in a raw frame.
 */
const CHANNELS = [0, 1, 2]
/**
 * The color of the palette's entry past its quantized colors, the index a frame
 * writes for each pixel the frame before it already shows.
 */
const CLEAR = [0, 0, 0]
/**
 * The committed catalog the reel's map reads in place of the live one.
 */
const FIXTURE = fileURLToPath(new URL('../tests/fixtures/catalog.bin', import.meta.url))
/**
 * The folder the reel's files are written to, beside the README that shows
 * them.
 */
const GITHUB = new URL('../../../.github/', import.meta.url)
/**
 * The README's preview, the home map at `spot` with its time running at the
 * lapse speed from `lead` milliseconds past `start`, each frame a screenshot of
 * `band` at `density` taken after the page's clock runs on by `step`
 * milliseconds, scaled to `width` pixels and played for `step` milliseconds.
 * Every frame is written on one palette quantized from every `palette.every`th
 * frame, holding `palette.colors` colors, at most 255 so the transparent entry
 * fits among the 256 a GIF palette holds. The map is dragged `pan.by` pixels
 * sideways in `pan.steps` moves before the first frame, a frame takes up to
 * `tries` screenshots past its first to settle, and each wait is in
 * milliseconds. The readout sets its clock in the time zone `zone` and the
 * locale `locale`, so the reel shows the spot's local time wherever it is
 * recorded.
 */
export const REEL = {
  band     : { height: 496, width: 1280, x: 0, y: 64 },
  density  : 2,
  frames   : 340,
  hold     : 8,
  lead     : 60_000,
  locale   : 'en-US',
  palette  : { colors: 255, every: 10 },
  pan      : { by: -48, steps: 24 },
  refresh  : 4,
  spot     : '42.36,-71.06',
  start    : Date.parse('2026-11-07T02:50:00Z'),
  step     : 20,
  tries    : 8,
  viewport : { height: 720, width: 1280 },
  waits    : { frame: 60, load: 4000, pan: 300, shot: 80, tiles: 3000, tracing: 90_000 },
  width    : 880,
  zone     : 'America/New_York'
}
/**
 * The bytes of one pixel in a raw frame, its red, green, blue, and alpha.
 */
const RGBA = 4
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

const record = async (page: Page, reel: typeof REEL) => {
  const frames: Buffer[] = []
  await page.click('button[aria-label^="Run the rest"]')
  for (let frame = 0; frame < reel.frames; frame++) {
    await page.clock.runFor(reel.step)
    await page.waitForTimeout(reel.waits.frame)
    const shot = await steadyShotOf(page, reel)
    frames.push(await sharp(shot).resize(reel.width, reelHeightOf(reel)).ensureAlpha().raw().toBuffer())
  }
  return frames
}

/**
 * Records the reel in `scheme` from the site served at `site`, the map reading
 * the committed catalog.
 */
const recordReel = async (scheme: SchemeName, site: string, reel = REEL) => {
  const browser = await chromium.launch({ channel: 'chromium' })
  const context = await browser.newContext({
    colorScheme       : SCHEMES_SHOWN[scheme],
    deviceScaleFactor : reel.density,
    locale            : reel.locale,
    timezoneId        : reel.zone,
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
  const gif = reelGifOf(heldFramesOf(frames, reel), { height: reelHeightOf(reel), width: reel.width }, reel)
  await writeFile(new URL(reelFileOf(scheme), GITHUB), gif)
}

/**
 * Takes screenshots of the band `waits.shot` apart until two in a row match,
 * returning the last one taken once `tries` run out.
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
 * Copies each pixel of each frame from the frame before it where every channel
 * sits within `hold` levels, or within one level on every `refresh`th frame, so
 * the encoder writes only the pixels that move. Each held frame is a copy on a
 * buffer of its own.
 */
export const heldFramesOf = (
  frames : readonly Uint8Array[],
  reel   : Pick<typeof REEL, 'hold' | 'refresh'> = REEL
) => {
  const held   = frames.map(frame => new Uint8Array(frame))
  const pixels = held.map(frame => new Uint32Array(frame.buffer))
  const near   = (a: Uint8Array, b: Uint8Array, at: number, within: number) =>
    Math.abs(a[at]! - b[at]!) <= within
  for (let i = 1; i < held.length; i++) {
    const [before, next] = [held[i - 1]!, held[i]!]
    const within         = i % reel.refresh ? reel.hold : 1
    for (let pixel = 0; pixel < next.length / RGBA; pixel++)
      if (CHANNELS.every(channel => near(next, before, pixel * RGBA + channel, within)))
        pixels[i]![pixel] = pixels[i - 1]![pixel]!
  }
  return held
}

/**
 * Returns the file under `.github/` the reel in `scheme` is written to.
 */
export const reelFileOf = (scheme: SchemeName) => `reel-${scheme}.gif`

/**
 * Encodes `frames` of raw RGBA pixels at `size` as one GIF that loops forever,
 * each frame shown for `step` milliseconds and written on one palette quantized
 * from every `palette.every`th frame. Each frame after the first writes the
 * index one past the quantized colors, which the GIF reads as transparent, for
 * each pixel whose index matches the frame before it. `gifenc` reads the whole
 * buffer under a frame, so each frame starts at the head of a buffer of its
 * own.
 */
export const reelGifOf = (
  frames : readonly Uint8Array[],
  size   : { height: number, width: number },
  reel   : Pick<typeof REEL, 'palette' | 'step'> = REEL
) => {
  const gif     = GIFEncoder()
  const sample  = new Uint8Array(Buffer.concat(frames.filter((_, at) => at % reel.palette.every === 0)))
  const colors  = quantize(sample, reel.palette.colors)
  const indexes = frames.map(frame => applyPalette(frame, colors))
  const clear   = colors.length
  const palette = [...colors, CLEAR]
  indexes.forEach((index, at) => gif.writeFrame(
    at ? index.map((value, pixel) => value === indexes[at - 1]![pixel] ? clear : value) : index,
    size.width,
    size.height,
    {
      delay            : reel.step,
      dispose          : 1,
      palette          : at ? undefined : palette,
      transparent      : at > 0,
      transparentIndex : clear
    }
  ))
  gif.finish()
  return gif.bytes()
}

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
    console.log(`Wrote .github/${reelFileOf(scheme)}`)
  }
  await server.close()
}
