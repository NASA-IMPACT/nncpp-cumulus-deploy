const I = require('iter-tools-es');
const { asyncZipBy } = require('../async-iter');
const {
  discoverGranules,
  makeDiscoverGranulesParams,
} = require('../discoverGranulesCmr');

/**
 * Returns an async iterable of the granules from the specified iterable of granules
 * that are missing from the MAAP CMR.  The MAAP CMR host must be specified via the
 * `CMR_HOST` environment variable.
 *
 * Assumes that the specified `event` is configured for discovering granules from the
 * NASA CMR so that it can use the same configuration details to execute the same CMR
 * search query against the MAAP CMR (`process.env.CMR_HOST`) in order to determine
 * which granules in the NASA CMR are missing from the MAAP CMR.
 *
 * **IMPORTANT**: This assumes that the CMR search query parameters includes `GranuleUR`
 * as the primary sort key (e.g., `sortKey=GranuleUR`).
 *
 * @template {{granuleId: string}} T - a granule object
 * @param {{granules: Iterable<T> | AsyncIterable<T>}} result - result of a discovery
 *    hanlder, which must contain a `granules` property that is an iterable (possibly
 *    async) of granules, each containing at least a `granuleId` property
 * @param {*} event - the AWS Lambda Function event passed to the discoverGranules
 *    handler
 * @returns {AsyncIterable<T>} an async iterable of the granules from the specified
 *    granules that are missing from the MAAP CMR
 */
function missingFromMAAPCMR({ granules }, event) {
  const cmrGranules = discoverGranules({
    ...makeDiscoverGranulesParams(event),
    host: process.env.CMR_HOST,
  });

  return I.execPipe(
    asyncZipBy(({ granuleId }) => granuleId, granules, cmrGranules),
    I.asyncFilter(([, maapGranule]) => maapGranule === undefined),
    I.asyncMap(([granule]) => granule),
  );
}

module.exports = missingFromMAAPCMR;
