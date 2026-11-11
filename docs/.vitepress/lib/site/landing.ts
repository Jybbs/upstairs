/**
 * Marks the footnote a page's address lands on, the marker in the text or the
 * entry in the list, and the return link on that entry back to the marker the
 * reader followed. The focus the router gives a marker's empty anchor moves to
 * the marker's link beside it.
 */
export const followFootnotes = (page: Document) => {
  let from = ''
  page.addEventListener('click', event => {
    const link = (event.target as Element).closest('.footnote-ref > a:first-child')
    if (link) from = link.parentElement!.querySelector('.footnote-anchor')!.id
  })

  page.addEventListener('focusin', event => {
    const anchor = event.target as Element
    if (anchor.matches('.footnote-anchor')) anchor.parentElement!.querySelector('a')!.focus({ preventScroll: true })
  })

  const land = () => requestAnimationFrame(() => {
    for (const node of page.querySelectorAll('.is-target')) node.classList.remove('is-target')
    for (const node of page.querySelectorAll('.footnote-backref[aria-current]')) node.removeAttribute('aria-current')
    const to = page.getElementById(decodeURIComponent(location.hash.slice(1)))
    if (to?.matches('.footnote-item')) {
      to.classList.add('is-target')
      to.querySelector(`.footnote-backref[href="#${CSS.escape(from)}"]`)?.setAttribute('aria-current', 'true')
    } else if (to?.matches('.footnote-anchor')) to.parentElement!.classList.add('is-target')
  })

  addEventListener('hashchange', land)
  land()
}
