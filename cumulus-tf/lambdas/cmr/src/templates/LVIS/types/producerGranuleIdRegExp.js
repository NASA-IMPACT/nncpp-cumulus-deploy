/**
 * Regular expression for matching LVISF producer granule identifiers.
 * A successful match will produce an object with the following named groups:
 *
 * - `collection` (name of the collection starting with `LVISF`)
 * - `campaign` (either `ABoVE` or `GEDI`)
 * - `year` (4-digit year of the start of the flight)
 * - `month` (2-digit, zero-padded month of the start of the flight)
 * - `day` (2-digit, zero-padded day of month of the start of the flight)
 * - `seconds` (6-digit, zero-padded number of seconds since midnight of the
 *   recording start time of the granule)
 * - `ext` (file extension of the granule)
 *
 * @example
 * LVISF1B_ABoVE2019_0807_R2003_083274.h5
 * LVISF2_ABoVE2019_0807_R2003_083274.TXT
 * LVISF2_GEDI2019_0512_R2003_083274.TXT
 */
const producerGranuleIdRegExp =
  /(?<collection>LVISF[^_]+)_(?<campaign>ABoVE|GEDI)(?<year>\d{4})_(?<month>\d{2})(?<day>\d{2})_R\d{4}_(?<seconds>\d{6})[.](?<ext>.+)/i;

module.exports = producerGranuleIdRegExp;
