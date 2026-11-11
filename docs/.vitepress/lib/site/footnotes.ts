import type { MarkdownRenderer } from 'vitepress'

type Rule = NonNullable<MarkdownRenderer['renderer']['rules'][string]>

const ANGLE = 48 * Math.PI / 180
const RISE  = { x: Math.cos(ANGLE), y: -Math.sin(ANGLE) }

const MORSE: Record<string, string> = { C: '-.-.', E: '.', O: '---', R: '.-.', S: '...', U: '..-' }
const NORTH = 'M7 14.32L7 6.32L7 6.32L7.02 6.19L7.1 6.03L7.21 5.88L7.35 5.73L7.5 5.62L7.65 5.54L7.79 5.5L7.9 '
            + '5.52L7.98 5.58L8 5.68L8 5.68L8 13.68L8 13.68L7.98 13.81L7.9 13.97L7.79 14.12L7.65 14.27L7.5 '
            + '14.38L7.35 14.46L7.21 14.5L7.1 14.48L7.02 14.42L7 14.32zM7.5 2L10.5 6L4.5 6zM7.97 1.56L10.97 '
            + '5.56L10.97 5.56L11 5.66L10.98 5.79L10.92 5.94L10.82 6.09L10.68 6.24L10.53 6.37L10.37 6.45L10.23 '
            + '6.5L10.11 6.49L10.03 6.44L10.03 6.44L7.03 2.44L7.03 2.44L7 2.34L7.02 2.21L7.08 2.06L7.18 '
            + '1.91L7.32 1.76L7.47 1.63L7.63 1.55L7.77 1.5L7.89 1.51L7.97 1.56zM10.18 6.5L4.18 6.5L4.18 6.5L4.08 '
            + '6.48L4.02 6.4L4 6.29L4.04 6.15L4.12 6L4.23 5.85L4.38 5.71L4.53 5.6L4.69 5.52L4.82 5.5L4.82 '
            + '5.5L10.82 5.5L10.82 5.5L10.92 5.52L10.98 5.6L11 5.71L10.96 5.85L10.88 6L10.77 6.15L10.62 '
            + '6.29L10.47 6.4L10.31 6.48L10.18 6.5zM4.17 5.93L7.17 1.93L7.17 1.93L7.3 1.78L7.45 1.65L7.6 '
            + '1.56L7.75 1.51L7.87 1.51L7.96 1.55L8 1.64L7.99 1.77L7.93 1.91L7.83 2.07L7.83 2.07L4.83 6.07L4.83 '
            + '6.07L4.7 6.22L4.55 6.35L4.4 6.44L4.25 6.49L4.13 6.49L4.04 6.45L4 6.36L4.01 6.23L4.07 6.09L4.17 5.93z'

/**
 * The marker's box, its disc centered `cx` from its left and `disc` below its
 * top.
 */
const MARK = { cx: 25, disc: 9, h: 21, w: 34 }

const round = (value: number) => +value.toFixed(2)

/**
 * A stroke from `x0`, `y0` to `x1`, `y1` that swells to `w` either side of its
 * middle and thins to a point at both ends.
 */
const flare = (x0: number, y0: number, x1: number, y1: number, w: number) => {
  const length = Math.hypot(x1 - x0, y1 - y0)
  const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2]
  const [nx, ny] = [-(y1 - y0) / length * w, (x1 - x0) / length * w]
  return `M${round(x0)} ${round(y0)}Q${round(mx + nx)} ${round(my + ny)} ${round(x1)} ${round(y1)}`
       + `Q${round(mx - nx)} ${round(my - ny)} ${round(x0)} ${round(y0)}z`
}

/**
 * The three flares climbing at 48 degrees to the marker's disc.
 */
const TRAILS = [[0, 9.5], [3.7, 12], [7.4, 9.5]].map(([x, length]) => {
  const [x0, y0] = [x + 3.3 - RISE.x * length / 2, MARK.h - 11 - RISE.y * length / 2]
  return `<path d="${flare(x0, y0, x0 + RISE.x * length, y0 + RISE.y * length, 2.2)}" fill="currentColor"/>`
}).join('')

/**
 * The marker's flares at 1.6 times their size beside an empty disc, which
 * fills once a reader lands on an entry.
 */
const EMBLEM = `<svg class="fn-emblem" viewBox="-1 -1 ${MARK.w + 2} ${MARK.h + 2}" width="${round((MARK.w + 2) * 1.6)}" `
             + `height="${round((MARK.h + 2) * 1.6)}" aria-hidden="true">${TRAILS}<circle cx="${MARK.cx}" `
             + `cy="${MARK.disc}" r="8.3" stroke="currentColor" stroke-width="1.24"/></svg>`

/**
 * Spells `word` in Morse code, one space between the marks of a letter, three
 * between letters, and seven after the word.
 */
export const morseOf = (word: string) =>
  [...word].map(letter => MORSE[letter].split('').join(' ')).join('   ') + '       '

/**
 * One column of trails at 48 degrees, `w` wide and `h` tall and 6.5 apart,
 * carrying SOURCES in Morse code read trail by trail, each dot round and each
 * dash a flare three units long, over a hairline where the code is off.
 */
const spineOf = (w: number, h: number) => {
  const unit   = 2.2
  const code   = morseOf('SOURCES')
  const stream = [...code].flatMap(c => c === '.' ? ['dot'] : c === '-' ? ['dash', 'dash', 'dash'] : ['off'])
  const length = w / RISE.x
  const step   = 6.5 / RISE.x
  let [at, hair, marks] = [0, '', '']
  for (let c = 0; c < h + w * Math.tan(ANGLE); c += step) {
    hair += `M0 ${round(c)}l${round(length * RISE.x)} ${round(length * RISE.y)}`
    for (let i = 0; i < Math.floor(length / unit); i++, at++) {
      const t = (i + 0.5) * unit
      if (stream[at % stream.length] === 'dot')
        marks += `M${round(t * RISE.x + 1)} ${round(c + t * RISE.y)}a1 1 0 1 1-2 0a1 1 0 1 1 2 0z`
      else if (stream[at % stream.length] === 'dash' && stream[(at - 1) % stream.length] !== 'dash') {
        const [b, e] = [t - unit * 0.45, t + unit * 2.45]
        marks += flare(b * RISE.x, c + b * RISE.y, e * RISE.x, c + e * RISE.y, 1.5)
      }
    }
  }
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMin slice" aria-hidden="true">`
       + `<path d="${hair}" stroke="currentColor" stroke-width=".6" opacity=".45" fill="none"/>`
       + `<path d="${marks}" fill="currentColor"/></svg>`
}

const SPINE = spineOf(16, 1600)

/**
 * Draws the marker, the source's figure on a satellite's disc climbing out of
 * its three flares.
 */
const markerOf = (figure: string) =>
  `<span class="fn-mark"><svg viewBox="0 0 ${MARK.w} ${MARK.h}" width="${MARK.w}" height="${MARK.h}" `
  + `aria-hidden="true">${TRAILS}</svg><b>${figure}</b></span>`

/**
 * Names a source by the surname and year its key carries, `vallado2006` as
 * Vallado 2006.
 */
export const nameOf = (key: string) => key.replace(/^(\w)([a-z]*)(\d{4})$/, (_, first, rest, year) =>
  `${first.toUpperCase()}${rest} ${year}`)

/**
 * Sets each footnote marker on the page as the Trails marker and the list at
 * the page's foot as the Spine section, each entry opening on its own marker
 * and each return drawn as the marker with the Northbound shaft on its disc,
 * lettered where a source is cited more than once.
 */
export const drawFootnotes = (md: MarkdownRenderer) => {
  const { rules } = md.renderer
  const anchor    = rules.footnote_anchor_name!
  const sub: Rule = (tokens, idx) => tokens[idx].meta.subId > 0 ? `:${tokens[idx].meta.subId}` : ''
  const note: Rule = (tokens, idx, _, env) => env.footnotes.list[tokens[idx].meta.id].label

  rules.footnote_ref = (tokens, idx, options, env, self) => {
    const id = anchor(tokens, idx, options, env, self)
    return `<sup class="footnote-ref"><a href="#footnote${id}" aria-label="Source ${tokens[idx].meta.id + 1}, `
         + `${nameOf(note(tokens, idx, options, env, self))}">${markerOf(`${tokens[idx].meta.id + 1}`)}</a>`
         + `<a class="footnote-anchor" id="footnote-ref${id}${sub(tokens, idx, options, env, self)}"></a></sup>`
  }

  rules.footnote_block_open = () =>
    `<section class="footnotes"><div class="fn-head">${EMBLEM}<h2 class="fn-title">Sources</h2></div>`
    + `<div class="fn-spine">${SPINE}</div><ol class="footnotes-list">\n`

  rules.footnote_open = (tokens, idx, options, env, self) => {
    const id = anchor(tokens, idx, options, env, self)
    return `<li id="footnote${id}" class="footnote-item" tabindex="-1">`
         + `<span class="fn-lead">${markerOf(`${tokens[idx].meta.id + 1}`)}</span>`
  }

  rules.footnote_anchor = (tokens, idx, options, env, self) => {
    const { id, subId } = tokens[idx].meta
    const count         = Number(env.footnotes.list[id].count) || 1
    const name          = nameOf(note(tokens, idx, options, env, self))
    const label         = count > 1 ? `Back to citation ${subId + 1} of ${name}` : `Back to the citation of ${name}`
    const letter        = count > 1 ? `<span class="fn-of">${String.fromCharCode(65 + subId)}</span>` : ''
    const north         = `<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">`
                        + `<path d="${NORTH}" fill="currentColor"/></svg>`
    return (subId === 0 ? '<span class="fn-backs">' : '')
         + `<a href="#footnote-ref${anchor(tokens, idx, options, env, self)}${sub(tokens, idx, options, env, self)}" `
         + `class="footnote-backref" aria-label="${label}">${markerOf(north)}${letter}</a>`
         + (subId === count - 1 ? '</span>' : '')
  }
}
