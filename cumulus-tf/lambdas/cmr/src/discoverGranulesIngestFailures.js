const _ = require("lodash/fp");
const I = require("iter-tools-es");
const { listGranules } = require("@cumulus/api-client/granules");
const { makeContinuous } = require("./cumulus-api-iter");

/**
 * Convenience function that creates an AsyncGenerator that yields granules one
 * at a time for simplified processing.
 *
 * @param {*} params - named parameters
 * @param {string} params.prefix - Cumulus stack prefix
 * @param {{[key:string]: string}} params.query - Cumulus API query parameters
 * @function
 */
const listGranulesContinuously = makeContinuous(listGranules);

/**
 * AWS Lambda handler for discoverying granules that match specified criteria,
 * such as having a "failed" status.
 *
 * Expects the name of the workflow to be specified at
 * `event.config.granuleIngestWorkflow`, and the time interval to be specified
 * at `event.config.timeInterval`.  The time interval is a string representing an
 * [ISO 8601 time interval](https://en.wikipedia.org/wiki/ISO_8601#Time_intervals).
 *
 * @param {*} event - AWS Lambda event
 * @param {string} event.config.stack - stack resource name prefix
 * @param {string} event.config.meta.query -
 * @returns {Promise<{granules: Object[]}>} Promise of an object with a single
 *    property named `granules` with a value that is a list of granule objects,
 *    each with the properties `dataType`, `version`, `granuleId`, and `files`
 */
async function handler({ config }) {
  return discoverGranulesIngestFailures({
    prefix: config.stack,
    query: _.pathOr({}, "meta.query", config),
  });
}

/**
 * Returns an object containing a (possibly empty) list of granules discovered
 * in the specified Cumulus stack (`prefix`) meeting the specified search
 * criteria (`query`).
 *
 * @param {*} params - named parameters
 * @param {string} params.prefix - Cumulus stack prefix
 * @param {Object} params.query - Cumulus API query parameters
 * @param {(CumulusAPIListerParams) => AsyncGenerator<Object, void, undefined>}
 *    params.findGranules - an async generator function that expects the
 *    specified `prefix` and `query` as named parameters and individually
 *    yields each granule object found in the stack that matches the query
 *    (default: the `listGranules` function from the Cumulus API, decorated with
 *    the `makeContinuous` function)
 * @returns {Promise<{granules: Object[]}>} Promise of an object with a single
 *    property named `granules` with a value that is a list of granule objects,
 *    each with the properties `dataType`, `version`, `granuleId`, and `files`
 */
async function discoverGranulesIngestFailures({
  prefix,
  query,
  findGranules = listGranulesContinuously,
}) {
  const trimGranule = (granule) => {
    const { collectionId, granuleId, files } = granule;
    const [dataType, version] = collectionId.split("___");
    return { dataType, version, granuleId, files };
  };

  return {
    granules: I.asyncMap(trimGranule, findGranules({ prefix, query }))
  }
}

module.exports = Object.assign(handler, {
  discoverGranulesIngestFailures,
  handler,
});
