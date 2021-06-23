const _ = require("lodash/fp");
const { asyncFlatUnfold } = require("./async-iter");

/**
 * Parameters passed to CumulusAPILister functions.
 *
 * @typedef CumulusAPIListerParams
 * @type {{prefix: string, query: {[key: string]: string}}}
 * @param {*} params - named parameters
 * @param {string} params.prefix - Cumulus stack prefix
 * @param {[key: string]: string} params.query - Cumulus API query parameters
 */

/**
 * A Cumulus API function that lists objects (e.g., granules, rules, etc.),
 * a page at a time, persisted in a specific stack (specified by the `prefix`
 * parameter) and matching the specified `query` parameters.
 *
 * Returns a Promise of an object with a `body` property containing the JSON
 * string response.  When the `body` property is parsed into an object, the
 * object will contain a `meta` property and, if no error occurred, a `results`
 * property containing a (possibly empty) list of the fetched objects.
 *
 * @callback CumulusAPILister
 * @param {CumulusAPIListerParams} params -
 * @returns {Promise<{body: string}>} a Promise of an object with a `body`
 *    property containing the JSON string response, which must be parsed to
 *    obtain the `results` property containing the list of fetched objects
 * @template T
 */

/**
 * A convenience function that returns an async generator function that uses
 * the specified Cumulus API page listing function to retrieve objects as a
 * continuous list.
 *
 * @example
 * const { listGranules } = require("@cumulus/api-client/granules");
 * const prefix = ...;
 * const query = { ... };
 *
 * // CUMBERSOME approach (more so when checking for error messages)
 *
 * const getPageOfGranules = (page) => {
 *   return listGranules({ prefix, query: { ...query, page } })
 *     .then(({ body }) => JSON.parse(body).results);
 * }
 *
 * let page = 1;
 * let granules = await getPageOfGranules(page);
 *
 * while (granules.length > 0) {
 *   for (const granule of granules) {
 *     // PROCESS granule
 *   }
 *
 *   // Potential linting warning about using `await` within a `while` loop
 *   granules = await getPageOfGranules(++page);
 * }
 *
 * // CONVENIENT approach using this function
 *
 * const listGranulesContinuously = makeContinuous(listGranules);
 *
 * for await (const granule of listGranulesContinuously({ prefix, query })) {
 *   // PROCESS granule
 * }
 *
 * @param {CumulusAPILister<T>} lister - Cumulus API function that fetches
 *    objects a page at a time
 * @returns {(CumulusAPIListerParams) => AsyncGenerator<T, void, undefined>}
 *    an async generator function that yields objects one at a time from the
 *    pages of objects fetched by the `lister` function, automatically handling
 *    paging
 * @template T
 */
function makeContinuous(lister) {
  /**
   * @param {CumulusAPIListerParams}
   * @returns {AsyncGenerator<T, void, undefined>}
   */
  return async function* findBy({ prefix, query }) {
    /**
     * @param {number} page - page number (1-based)
     * @returns {[T[], number] | false}
     */
    async function getPage(page) {
      const items = await lister({ prefix, query: { ...query, page } })
        .then(_.prop("body"))
        .then(JSON.parse)
        .then(_.tap(checkResponse))
        .then(_.prop("results"));

      return items.length > 0 && [items, page + 1];
    }

    yield* asyncFlatUnfold(getPage)(1);
  }
}

/**
 * Checks the response object of a Cumulus API list query, throwing an error if
 * no `"results"` were returned.
 *
 * @param response - response object returned by a call to a Cumulus API list
 *    query
 * @throws an error if there is an error indicated in the response (consisting
 *    of the comma-separated concatenation of the `"reason"` properties of the
 *    array at the path `"meta.body.error.root_cause"`), or if no `"results"`
 *    property exists in the specified response
 */
function checkResponse(response) {
  const reasons = _.map(
    _.prop("reason"),
    _.pathOr([], ["meta", "body", "error", "root_cause"], response),
  );

  if (reasons.length > 0) throw new Error(reasons.join(", "));
  if (!_.prop("results", response)) throw new Error(
    `No 'results' in response: ${JSON.stringify(response)}`
  );
}

module.exports = {
  makeContinuous,
};
