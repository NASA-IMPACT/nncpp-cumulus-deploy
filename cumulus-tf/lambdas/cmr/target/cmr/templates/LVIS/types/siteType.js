const Flight = require('./Flight');
const producerGranuleIdRegExp = require('./producerGranuleIdRegExp');
const S = require('sanctuary');
const YAML = require('js-yaml');

/**
 * Custom YAML type for getting a flight's site name when given the granule's
 * producer granule ID.
 *
 * @example
 * ```yaml
 * # Before YAML load
 * Site Name: !lvis/site LVISF1B_ABoVE2019_0807_R2003_088581.h5
 * # After YAML load
 * Site Name: "Salt Lake City to Houston, GEDI Reference Ground Tracks"
 * ```
 */
const siteType = new YAML.Type('!lvis/site', {
  kind: 'scalar',
  resolve: resolveSiteType,
  construct: constructSiteType,
});

/**
 * Returns `true` if the specified value is a valid LVISF producer granule
 * identifier; `false` otherwise.
 *
 * @param {string} value
 * @returns {boolean} `true` if the specified value is a valid LVISF producer
 *    granule identifier; `false` otherwise
 */
function resolveSiteType(value) {
  return producerGranuleIdRegExp.test(value);
}

/**
 * Returns the site name for the flight during which the specified granule was
 * captured.
 *
 * @param {string} producerGranuleId - a valid LVISF producer granule identifier
 * @returns {string} the site name for the flight during which the specified
 *    granule was captured
 * @throws if no flight was found for the specified granule
 */
function constructSiteType(producerGranuleId) {
  const { year, month, day } =
    producerGranuleId.match(producerGranuleIdRegExp).groups
  const flight = Flight.startedOn({ year, month, day });

  if (S.isJust(flight)) return S.maybeToNullable(flight).site;

  throw new Error(`No flight found for granule ${producerGranuleId}`);
}

module.exports = siteType;
