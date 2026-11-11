import { describe, expect, it } from 'vitest'

import { HOSTS, Hosts } from '../../lib/map/hosts.ts'
import { styleOf }      from '../../lib/map/style.ts'
import { SCHEMES }      from '../../lib/site/palette.ts'

describe('the hosts the map reads from', () => {
  it('names a host for every source the style declares', () => {
    expect(Object.keys(styleOf('', '', SCHEMES.day).sources)).toEqual(Object.keys(HOSTS))
  })

  it.each(Object.entries(HOSTS))('names %s as down when it fails before loading a tile', (source, host) => {
    const hosts = new Hosts()
    hosts.fail(source)
    expect(hosts.message.value).toBe(`Could not reach ${host}`)
  })

  it('names each host once, however many of its sources fail', () => {
    const hosts = new Hosts()
    Object.keys(HOSTS).forEach(source => hosts.fail(source))
    expect(hosts.message.value).toBe('Could not reach OpenFreeMap and Terrain Tiles')
  })

  it('clears a host once one of its tiles loads', () => {
    const hosts = new Hosts()
    hosts.fail('base')
    hosts.load('base')
    expect(hosts.message.value).toBe('')
  })

  it('names the host still down once the other host recovers', () => {
    const hosts = new Hosts()
    hosts.fail('base')
    hosts.fail('dem')
    hosts.load('base')
    expect(hosts.message.value).toBe('Could not reach Terrain Tiles')
  })

  it.each([
    ['a source that has loaded a tile', 'base', true],
    ['a source the style does not declare', 'elsewhere', false],
    ['an error naming no source', undefined, false]
  ])('leaves the map as it stands on an error from %s', (_, source, loaded) => {
    const hosts = new Hosts()
    if (loaded) hosts.load(source!)
    hosts.fail(source)
    expect(hosts.message.value).toBe('')
  })
})
