const Flight = require('./Flight');
const producerGranuleIdRegExp = require('./producerGranuleIdRegExp');
const S = require('sanctuary');
const YAML = require('js-yaml');

/**
 * Custom YAML type for getting a flight's flight number when given the
 * granule's producer granule ID.
 *
 * @example
 * ```yaml
 * # Before YAML load
 * Flight Number: !lvis/flight LVISF1B_ABoVE2019_0807_R2003_088581.h5
 * # After YAML load
 * Flight Number: "58702_015540"
 * ```
 */
const flightType = new YAML.Type('!lvis/flight', {
  kind: 'scalar',
  resolve: resolveFlightType,
  construct: constructFlightType,
});

/**
 * Returns `true` if the specified value is a valid LVISF producer granule
 * identifier; `false` otherwise.
 *
 * @param {string} value
 * @returns {boolean} `true` if the specified value is a valid LVISF producer
 *    granule identifier; `false` otherwise
 */
function resolveFlightType(value) {
  return producerGranuleIdRegExp.test(value);
}

/**
 * Returns the flight number for the flight during which the specified granule
 * was captured.
 *
 * @param {string} producerGranuleId - a valid LVISF producer granule identifier
 * @returns {string} the flight number for the flight during which the specified
 *    granule was captured
 * @throws if no flight was found for the specified granule
 */
function constructFlightType(producerGranuleId) {
  const { year, month, day } =
    producerGranuleId.match(producerGranuleIdRegExp).groups
  const flight = Flight.startedOn({ year, month, day });

  if (S.isJust(flight)) return S.maybeToNullable(flight).flightNumber;

  throw new Error(`No flight found for granule ${producerGranuleId}`);
}

module.exports = flightType;
