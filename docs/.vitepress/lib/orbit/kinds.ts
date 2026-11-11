export type Kind = keyof typeof KINDS

/**
 * What a satellite is for, in the order the filters list them.
 */
export const KINDS = {
  crewed     : { label: 'Crewed',     traced: true,  about: 'A crewed station.' },
  science    : { label: 'Science',    traced: true,  about: 'A space science mission.' },
  earth      : { label: 'Earth',      traced: true,  about: 'It observes the Earth.' },
  weather    : { label: 'Weather',    traced: true,  about: 'A weather satellite.' },
  navigation : { label: 'Navigation', traced: true,  about: 'A navigation satellite.' },
  comms      : { label: 'Comms',      traced: false, about: 'A communications satellite.' },
  starlink   : { label: 'Starlink',   traced: false, about: 'A SpaceX Starlink internet satellite.' },
  other      : { label: 'Other',      traced: false, about: 'Listed in the catalog without a role this site recognizes.' }
} as const
/**
 * Plain notes on well-known missions by catalog number.
 */
export const NOTES: Readonly<Record<number, string>> = {
  20580 : 'The Hubble Space Telescope.',
  25544 : 'The International Space Station, crewed since 2000.',
  25867 : 'NASA’s Chandra X-ray Observatory, on a long, high orbit.',
  25994 : 'NASA’s Terra observes the land, oceans, and atmosphere.',
  27424 : 'NASA’s Aqua studies water across the Earth.',
  28376 : 'NASA’s Aura studies the chemistry of the atmosphere.',
  39084 : 'Landsat 8 images the Earth’s land surface.',
  46984 : 'Sentinel-6 measures the height of the sea surface.',
  48274 : 'The core module of China’s Tiangong space station.',
  49260 : 'Landsat 9 images the Earth’s land surface.',
  54754 : 'SWOT maps the height of oceans, lakes, and rivers from orbit.'
}
const PATTERNS: readonly (readonly [Kind, RegExp])[] = [
  ['starlink',   /^STARLINK/],
  ['crewed',     /^(ISS|CSS|POISK|TIANHE|WENTIAN|MENGTIAN|SHENZHOU|PROGRESS|SOYUZ|CREW DRAGON|DRAGON|TIANZHOU|CYGNUS)\b/],
  ['science',    /^(HST|CXO|SWIFT|FERMI|NUSTAR|TESS|XMM|INTEGRAL|IXPE|XRISM|AIM|EUCLID|JWST|GAIA|MMS|THEMIS|VAN ALLEN|IRIS|SDO|HINODE|NICER|CHEOPS|SPEKTR)\b/],
  ['weather',    /^(NOAA|GOES|METEOR|METOP|HIMAWARI|FENGYUN|FY-|DMSP|JPSS|MTG|METEOSAT|EWS|ELEKTRO|ARKTIKA)\b/],
  ['earth',      /^(SWOT|LANDSAT|TERRA|AQUA|AURA|SUOMI|ICESAT|GRACE|JASON|SENTINEL|CRYOSAT|OCO|GCOM|SMAP|CALIPSO|CLOUDSAT|PACE|ALOS|TERRASAR|TANDEM|RADARSAT|WORLDVIEW|PLEIADES|SPOT|GAOFEN|FLOCK|LEMUR|SKYSAT|PELICAN|ICEYE|CAPELLA|UMBRA|HAIYANG|TUBSAT|NUSAT|ZIYUAN|KOMPSAT|CARTOSAT|RESOURCESAT|EOS|JILIN)\b/],
  ['navigation', /^(NAVSTAR|GPS|GLONASS|COSMOS 2[45]\d\d \(GLONASS|GSAT0|GALILEO|BEIDOU|QZS|IRNSS|NVS)/],
  ['comms',      /^(ONEWEB|IRIDIUM|ORBCOMM|GLOBALSTAR|KUIPER|INTELSAT|SES|O3B|ECHOSTAR|GALAXY|VIASAT|EUTELSAT|TELSTAR|ASTRA|QIANFAN|GUOWANG|HOTBIRD|THOR|YAHSAT|ARABSAT|INMARSAT|AMOS|NILESAT|TDRS|SKYNET|MILSTAR|AEHF|WGS|MUOS|XM|SIRIUS|DIRECTV|SATELIOT|LYNK|ASTS|BLUEBIRD|TIANTONG|CHINASAT|APSTAR|ASIASAT|JCSAT|SUPERBIRD|TURKSAT|EXPRESS|YAMAL|TELKOM|THAICOM)/]
]

export const kindOf = (name: string): Kind =>
  PATTERNS.find(([, pattern]) => pattern.test(name))?.[0] ?? 'other'
