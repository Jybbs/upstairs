/**
 * Builds the body of the 403 CelesTrak answers while its data has not updated
 * since the last download from the same address, byte for byte as CelesTrak
 * sends it, line breaks included, naming the download at `since`.
 */
export const unchangedBody = (since: string) =>
    'GP data has not updated since your last successful\r\n'
  + `download of GROUP=active at ${since} UTC.\r\n`
  + 'Data is updated once every 2 hours.'
