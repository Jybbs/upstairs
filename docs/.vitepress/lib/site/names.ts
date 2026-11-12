const ALIAS  = /^(.*?)\s*([([][^()[\]]*[)\]])$/
const SERIAL = /^(.*?[A-Z])([-\s]\d.*)$/

/**
 * Splits a satellite's name into its base word and what follows it, meaning
 * the number set off by a hyphen or a space and the alias the catalog closes
 * the name with in parentheses or brackets, so `STARLINK-31414` reads as
 * `STARLINK` and `-31414`.
 */
export const weighedOf = (name: string): { base: string, rest: string } => {
  const [, own, alias] = ALIAS.exec(name) ?? [name, name, '']
  const [, base, serial] = SERIAL.exec(own) ?? [own, own, '']
  return { base, rest: `${serial}${alias && ` ${alias}`}` }
}
