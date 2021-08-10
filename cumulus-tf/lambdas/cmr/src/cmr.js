const _ = require("lodash/fp");
const Axios = require("axios");
const R = require("ramda");
const RAX = require("retry-axios");
const xml2js = require("xml2js");
const { asyncFlatUnfold } = require("./async-iter");
const { camelCase } = require("camel-case");

const nasaCmrHost = "cmr.earthdata.nasa.gov";
const maapCmrProvider = process.env.CMR_PROVIDER || "NASA_MAAP";

const isNotMissing = R.complement(R.either(R.isNil, R.isEmpty));

/**
 * Creates an Axios instance using the specified configuration object.
 *
 * By default, the `baseURL` uses the `https` protocol with the CMR host
 * specified by the `CMR_HOST` environment variable, but may be overridden by
 * supplying a `baseURL` property on the `config` parameter.
 *
 * In addition, default request retry logic uses an
 * {@link https://cloud.google.com/storage/docs/retry-strategy#exponential-backoff exponential backoff}
 * for 1xx, 429, and 5xx errors, but this may also be overridden by supplying
 * appropriate properties on the `raxConfig` property of the `config` parameter.
 *
 * @param {RAX.RaxConfig} [config] - Retry-Axios client configuration object
 * @returns {Axios.AxiosInstance} an Axios instance configured with the
 *    specified configuration object
 */
function createAxiosClient(config = {}) {
  const protocol = process.env.CMR_PROVIDER == "NNCPP_DEV" ? "http" : "https";
  const baseURL = process.env.CMR_HOST.includes(protocol) ? process.env.CMR_HOST : `${protocol}://${process.env.CMR_HOST}`;
  const client = Axios.create({ baseURL, ...config });
  const onRetryAttempt = R.pathOr(() => { }, ["raxConfig", "onRetryAttempt"], config);

  client.defaults.raxConfig = {
    ...(client.defaults.raxConfig || {}),
    // We use 0 retryDelay with 'linear' backoffType to force retry-axios to not
    // delay at all, then we correctly compute an exponential backoff based on
    // https://cloud.google.com/storage/docs/retry-strategy#exponential-backoff
    // since the exponential algorithm built into retry-axios is flawed
    // (see https://github.com/JustinBeckwith/retry-axios/issues/122)
    retryDelay: 0,
    backoffType: "linear",
    instance: client,
    onRetryAttempt: exponentiallyDelay(onRetryAttempt),
    retry: 6,
  };

  RAX.attach(client);

  return client;
}

/**
 * Decorates the specified function by delaying its invocation by an
 * exponentially increasing amount, up to the specified maxiumum number of
 * milliseconds.
 *
 * @param {<T>(err: Axios.AxiosError) => T | Promise<T>} onRetryAttempt -
 *    function to decorate, which is called by retry-axios on each retry
 *    attempt, passing it the current error
 * @param {Number} [maxDelayMillis=32000] - maximum number of milliseconds to
 *    delay the call to the decorated function
 * @returns {<T>(err: Axios.AxiosError) => Promise<T>} a function that expects
 *    an axios error with a 1-based `currentRetryAttempt` property configured
 *    by retry-axios, which computes an exponential delay (capped by
 *    `maxDelayMillis`) using that property as the exponent, and delays
 *    execution of the decorated function by the computed delay
 * @see [exponential backoff](https://cloud.google.com/storage/docs/retry-strategy#exponential-backoff)
 */
function exponentiallyDelay(onRetryAttempt, maxDelayMillis = 32_000) {
  return async function onDelayedRetryAttempt(error) {
    const attempt = RAX.getConfig(error).currentRetryAttempt;
    const exponentialDelayMillis = (2 ** (attempt - 1) + Math.random()) * 1000 | 0;
    const delayMillis = Math.min(exponentialDelayMillis, maxDelayMillis);

    const message = enhancedRequestError(error).message;
    const method = error.config.method.toUpperCase();
    const url = `${error.config.baseURL}${Axios.getUri(error.config)}`;

    console.warn(`Will retry after ${delayMillis}ms: ${message}: ${method} ${url}`);

    await new Promise((resolve) => setTimeout(resolve, delayMillis));
    return onRetryAttempt(error);
  }
}

/**
 * Returns a possibly empty array of error messages extracted from the specified
 * error's `response.data`.
 *
 * @param {Error} error - an Axios error object
 * @returns {String[]} a possibly empty array of error messages extracted from
 *    the specified error's `"response.data.errors"` property (which is assumed
 *    to be a parsed object)
 */
function extractErrors(error) {
  return R.pipe(
    R.pathOr([], ["response", "data", "errors"]),
    R.unless(
      Array.isArray,
      R.pipe(
        R.prop("error"),
        R.unless(Array.isArray, R.of)
      ),
    )
  )(error);
}

function enhancedRequestError(error) {
  const errors = extractErrors(error).join(", ");
  const message = [error.message, errors].filter(Boolean).join(": ");
  const { code, config, name, response = {} } = error;
  const props = R.pickBy(isNotMissing, {
    code,
    config,
    name,
    response: R.omit(['config', 'request'], response),
  });

  return Object.assign(new Error(message), props);
}

function throwEnhancedRequestError(error) {
  throw enhancedRequestError(error);
}

function publishGranuleUrlPath(granuleUR) {
  return `/ingest/providers/${maapCmrProvider}/granules/${granuleUR}`;
}

async function findCollection(collection, cmrEnv = "maap", format = "umm_json") {
  const { name, version } = collection;
  // The metadata for some collections is stored with an "unpadded" version
  // number (e.g., "1" rather than "001", such as the LVISF collections).
  // Therefore, we'll search with both "padded" and "unpadded" version numbers.
  const { unpaddedVersion } =
    (collection.version.match(/^0+(?<unpaddedVersion>.+)$/) || {}).groups || {};
  const cmrSearchParams = R.pathOr({}, ["meta", "cmrSearchParams"], collection);
  const findConceptsParams = {
    host: cmrEnv === "ops" ? nasaCmrHost : process.env.CMR_HOST,
    protocol: cmrEnv === "ops" ? "https" : "http",
    type: "collections",
    format,
    queryParams: {
      shortName: name,
      version: unpaddedVersion ? [version, unpaddedVersion] : version,
      ...toCanonicalQueryParams(cmrSearchParams),
      scroll: false,
      pageSize: 1,
    },
  };

  for await (const collection of findConcepts(findConceptsParams)) {
    return collection;
  }
}

async function findGranule(params, cmrEnv = "ops", format) {
  const findConceptsParams = {
    host: cmrEnv === "ops" ? nasaCmrHost : process.env.CMR_HOST,
    protocol: cmrEnv === "ops" ? "https" : "http",
    type: "granules",
    // TODO: use only umm_json throughout, for consistency (using json was
    // necessary only for UAH's CMR because it didn't support umm_json for some
    // reason, but GCC's CMR does)
    format: format || (cmrEnv === "ops" ? "umm_json" : "json"),
    queryParams: {
      ...params,
      scroll: false,
      pageSize: 1,
    },
  };

  for await (const granule of findConcepts(findConceptsParams)) {
    return granule;
  }
}

/**
 * Publishes the specified granule's metadata to the CMR.
 *
 * If publishing fails because the granule was previously published with a
 * different parent collection, an attempt to unpublish (delete) the granule
 * from the CMR is made, followed by another attempt to publish the granule's
 * metadata.
 *
 * If either the attempt to unpublish fails, or the second attempt to publish
 * fails, returns a rejected promise with this subsequent error.
 *
 * @param {string} granuleUR - UR of the granule to publish to the CMR
 * @param {string} xml - ECHO-10 XML of the granule's metadata
 * @return {Promise.<any>} Promise of the CMR's HTTP response
 */
async function publishGranule(granuleUR, xml) {
  console.log(xml)
  const url = publishGranuleUrlPath(granuleUR);
  const client = createAxiosClient({
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/echo10+xml",
      "Echo-Token": process.env.CMR_ECHO_TOKEN || "",
    },
    raxConfig: {
      retry: 6,
      shouldRetry: R.either(isParentChangeError, RAX.shouldRetryRequest),
      onRetryAttempt: (error) => {
        if (isParentChangeError(error)) {
          console.log(`Changing parent collection for ${granuleUR}`);
          return unpublishGranule(granuleUR);
        }
      },
    },
  });

  console.info(
    `Attempting to publish granule '${granuleUR}': PUT ${client.defaults.baseURL}${url}`
  );

  return client
    .put(url, xml)
    .then(_.tap(({ status, data }) =>
      console.info(
        `Successfully published granule '${granuleUR}': ${status}:`,
        data ? (typeof data === 'string' ? data : JSON.stringify(data)) : '<no data>',
      )))
    .catch(throwEnhancedRequestError);
}

/**
 * Returns `true` if the specified error represents a failed attempt to change
 * the parent collection of a previously published granule; `false` otherwise.
 *
 * @param {Error} error - the request error to check
 * @returns {boolean} `true` if the specified error represents a failed attempt
 *    to change the parent collection of a previously published granule; `false`
 *    otherwise
 */
function isParentChangeError(error) {
  return (
    R.pathEq(['response', 'status'], 422, error) &&
    R.pathOr([], ['response', 'data', 'errors'], error)
      .some(R.includes("parent collection cannot be changed"))
  );
}

/**
 * Unpublishes (deletes) the granule with the specified UR from the CMR.
 *
 * @param {string} granuleUR - UR of the granule to unpublish (delete) from the CMR
 * @returns {Promise.<any>} Promise of the CMR's HTTP response
 */
async function unpublishGranule(granuleUR) {
  const client = createAxiosClient({
    headers: {
      "Accept": "application/json",
      "Echo-Token": process.env.CMR_ECHO_TOKEN || "",
    }
  });

  return client
    .delete(publishGranuleUrlPath(granuleUR))
    .catch(throwEnhancedRequestError);
}

/**
 * Validates the specified granule's metadata.
 *
 * Returns a resolved promise if the metadata is valid; otherwise a rejected
 * promise with the error details.
 *
 * @param {string} granuleUR - UR of the granule to validate
 * @param {string} xml - ECHO-10 XML of the granule's metadata
 * @returns {Promise.<any>} Promise of the CMR's HTTP response, which rejects
 *    when the HTTP status code is not in the 2xx range
 */
async function validateGranule(granuleUR, xml) {
  const validateUrl =
    `/ingest/providers/${maapCmrProvider}/validate/granule/${granuleUR}`;
  const client = createAxiosClient({
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/echo10+xml",
      "Echo-Token": process.env.CMR_ECHO_TOKEN || "",
    }
  });

  return client.post(validateUrl, xml).catch(throwEnhancedRequestError);
}

/**
 * Returns an async generator of CMR search results found based on the specified
 * parameters.  Convenience function to use in place of an instance of the
 * `CMRSearchConceptQueue` class provided by Cumulus.
 *
 * @example
 * const params = { ... };
 *
 * // Using CMRSearchConceptQueue
 * const results = CMRSearchConceptQueue(params);
 *
 * while (await results.peek()) {
 *   const result = await results.shift();
 *   ...
 * }
 *
 * // Using this findConcepts function instead
 * for await (const result of findConcepts(params)) {
 *   ...
 * }
 *
 * @param {{[key:string]: any}} params - named arguments
 * @param {string} params.host - hostname (or address) of the CMR server
 * @param {string} params.type - concept type to search for (`"granules"`
 *    or `"collections"`)
 * @param {string} params.protocol - protocol to use for CMR request default "https"
 * @param {string} [params.baseURL="https://${params.host}/search"] - base URL for CMR
 *    search requests
 * @param {{[key:string]: string}} [params.headers={}] - CMR search request headers (see
 *    {@link https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html#headers Headers})
 * @param {{[key:string]: string}} [params.queryParams={}] - CMR search query parameters
 *    (see {@link https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html CMR Search API})
 * @param {string} [params.format="json"] - a supported response format (see
 *    {@link https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html#extensions Extensions})
 * @param {(response: any) => any} [params.handler] - a function to handle marshalling
 *    each page of results; default handlers are provided for `format` values of `json`,
 *    `umm_json`, and `echo10`
 * @returns {AsyncGenerator<any>} an async generator yielding search results
 *    one at a time
 */
async function* findConcepts({
  host,
  type,
  protocol = "https",
  headers = {},
  queryParams = {},
  format = "json",
  transform = transformersByFormat[format],
}) {
  const baseURL = host.includes(protocol) ? host : `${protocol}://${host}`;
  const client = createAxiosClient({
    baseURL: baseURL,
    headers,
    validateStatus: (status) => 200 <= status && status < 300 || status === 404,
  });
  const url = `/search/${type}.${format}`;
  const params = toCanonicalQueryParams({ scroll: true, ...queryParams });
  const options = {
    transformResponse: transform,
    params: { pageSize: 2000, ...params },
  };
  const continuousSearch = asyncFlatUnfold(pagedSearch);

  yield* continuousSearch({ client, url, options });
}

async function pagedSearch({ client, url, options = {}, _hits = 0, _count = 0 }) {
  const scrollIdPath = ['headers', 'cmr-scroll-id'];
  const pageNumPath = ['params', 'pageNum'];
  const getScrollId = R.path(scrollIdPath);
  const getPageNum = R.pathOr(1, pageNumPath);
  const getPageSize = R.pathOr(10, ['params', 'pageSize']);
  const nextOptions = (id) => id
    ? R.assocPath(scrollIdPath, id, options)
    : R.assocPath(pageNumPath, getPageNum(options) + 1, options);

  try {
    const response = await client.get(url, options);
    const results = response.status === 404 ? [] : response.data;
    const scrollId = getScrollId(options) || getScrollId(response);
    const hits = Number(response.headers['cmr-hits']) || _hits;
    const ignoring404 = response.status === 404 && hits > 0;
    const skippedPageSize = Math.min(getPageSize(options), hits - _count);
    const uri = `${response.config.baseURL}${Axios.getUri(response.config)}`;
    const params = {
      client,
      url,
      options: nextOptions(scrollId),
      _hits: hits,
      _count: _count + (ignoring404 ? skippedPageSize : results.length),
    };

    console.info(`(${params._count}/${hits}) [${response.status}] GET ${uri}`);

    return results.length > 0 || ignoring404
      ? [results, params]
      : void clearScroll(client, scrollId);
  } catch (error) {
    clearScroll(client, getScrollId(options));
    throw enhancedRequestError(error);
  }
}

/**
 * Clears the scroll session associated with the specified scroll ID.
 *
 * This should be called at the end of a scrolled search in order to release
 * resources on the CMR.
 *
 * @param {string} scrollId - scroll ID obtained from the `cmr-scroll-id` header
 *    from a CMR search query response with the `scroll` parameter set to `true`
 * @see [Clear scroll session](https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html#clear-scroll)
 */
async function clearScroll(client, scrollId) {
  if (!scrollId) return;

  try {
    await client.post(
      "/search/clear-scroll",
      { scroll_id: scrollId },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    // We don't want to throw an exception here because failure to clean up the
    // scrolling session should not cause the related search operation to fail,
    // so we'll just log the error.
    error.message = [error.message, extractErrors(error).join(", ")].join(": ");
    console.warn(JSON.stringify(error.toJSON()));
  }
}

/**
 * Response transformer used by {@link findConcepts} when called with the
 * value `"umm_json"` for the `format` parameter.  Returns a possibly empty array
 * of the `umm` properties of the `items` in the specified response object (see
 * {@link https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html#umm-json UMM JSON Result Format}).
 *
 * @param {*} ummJSON - CMR search response in UMM JSON format
 * @returns {Object[]} a possibly empty array of the `umm` properties of the
 *    `items` in the specified response object
 */
const transformUMMJSONResponse = R.pipe(
  R.tryCatch(JSON.parse, (_parseError, response) => { throw new Error(response) }),
  R.when(R.hasIn("items"), R.pipe(R.prop("items"), R.map(R.prop("umm")))),
);

/**
 * Response transformer used by {@link findConcepts} when called with the
 * value `"json"` for the `format` parameter.  Returns a possibly empty array
 * at the `feed.entry` path of the specified response object (see
 * {@link https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html#json JSON Result Format}).
 *
 * @param {string} json - CMR search response in "standard" JSON format
 * @returns {Object[]} the possibly empty array at the `feed.entry` path of the
 *    specified response object
 * @function
 */
const transformJSONResponse = R.pipe(
  JSON.parse,
  R.when(R.hasPath(["feed", "entry"]), R.path(["feed", "entry"])),
);

/**
 * Response transformer used by {@link findConcepts} when called with the
 * value `"echo10"` for the `format` parameter.  Returns a possibly empty array
 * at the `results/result` path of the specified response object (see
 * {@link https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html#echo-10 ECHO 10 Result Format}).
 * Each element of the array is an object with properties as specified by the
 * {@link https://earthdata.nasa.gov/esdis/eso/standards-and-references/echo-metadata-standard ECHO Metadata Standard}.
 *
 * Always returns an array (possibly empty), even when there is only a single
 * result.  Further, each object in the array is stripped of its top level
 * "wrapper".  For example, in the case of a query for granules, rather than
 * each object being of the form `{Granule: {GranuleUR: ...}}`, where `Granule`
 * is the sole property at the top level, the top level property is removed,
 * resulting in an object of the form `{GranuleUR: ...}`.
 *
 * @example
 * const data = "<xml><results><result><Granule><GranuleUR>ABC123</GranuleUR>...</xml>";
 * const results = handleECHO10Response(data);
 *
 * results === [{GranuleUR: "ABC123", ...}, ...]
 *
 * @param {string} echo10XML - CMR search response in ECHO 10 XML format
 * @returns {Object[]} the possibly empty array at the `results/result` path of
 *    the specified response object
 */
function transformECHO10Response(echo10XML) {
  // Since the value at the path `results/result` might be a single object, we
  // convert it to an array if it is not already an array.  Then, for each
  // object in the array (even if a singleton array), we remove the top-level
  // of nesting.  This unnesting gives us, for example, an array of objects like
  // [{GranuleUR: ...}, ...] instead of [{Granule: {GranuleUR: ...}}, ...]
  const extractResults = R.when(
    R.has("results"),
    R.pipe(
      R.pathOr([], ["results", "result"]),  // Grab array or single object
      R.unless(Array.isArray, R.of),        // If single object, make an array
      R.map(R.compose(R.head, R.values)),   // Strip top level nesting on all items
    )
  );
  const parseOptions = {
    ignoreAttrs: true,    // We don't care about attributes
    explicitArray: false, // Explicit arrays everywhere are a headache
  };

  let results = [];

  xml2js.parseString(echo10XML, parseOptions, (err, data) => {
    try {
      // If XML parsing fails, fall back to JSON parsing
      results = (err ? JSON.parse : extractResults)(data);
    } catch {
      // If parsing/extraction fails, log offending input and throw original
      // error to aid debugging
      console.error(echo10XML);
      throw err;
    }
  });

  return results;
}

const transformersByFormat = {
  echo10: transformECHO10Response,
  json: transformJSONResponse,
  umm_json: transformUMMJSONResponse,
};

/**
 * Returns a copy of the specified HTTP request headers, but with all header
 * names converted to all lowercase, and all headers with "nil" or empty values
 * omitted.
 *
 * @param {{[name: string]: string}} headers - HTTP request headers to canonicalize
 * @returns {{[name: string]: string}} a canonical copy of the specified headers
 */
function toCanonicalHeaders(headers) {
  const canonicallyNamed = R.pipe(
    R.toPairs,
    R.map(([name, value]) => [name.toLowerCase(), value]),
    R.fromPairs,
    R.pickBy(isNotMissing),
  );

  return canonicallyNamed(headers);
}

/**
 * Canonicalizes the specified CMR search query parameters, returning a new set
 * of CMR search query parameters.
 *
 * Query parameters are canonicalized as follows:
 *
 * - Converts all "snake case" parameter names to "camel case" (e.g.,
 *   `"page_size"` is converted to `"pageSize"`)
 *
 * - Omits all parameters with values that are "nil" or "empty"
 *
 * - If the `scroll` parameter is a truthy value, the `page_num` and `pageNum`
 *   parameters are omitted since specifying a page number is mutually exclusive
 *   with scrolling. See [CMR Search Scrolling Details](
 *   https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html#scrolling-details)
 *
 * - If the `temporal` parameter includes the string `now` (case-insensitive),
 *   each occurrence is replaced with the current data/time in ISO 8601 format.
 *
 *   This is provided in order to support the start or end (or both) as an
 *   [ISO 8601 Duration](https://en.wikipedia.org/wiki/ISO_8601#Durations).
 *   This is not directly supported by [CMR Temporal Range Searches](
 *   https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html#temporal-range-searches),
 *   but a range that is bound by a duration on one end and by an ISO 8601
 *   date/time on the other end is supported.
 *
 *   For example, a `temporal` value of `P56D/now` is canonicalized by replacing
 *   `now` with the current date/time (as of execution of this function) in ISO
 *   8601 UTC format, representing the temporal range spanning the most recent
 *   56 days (`56D`).
 *
 *   Further, a temporal value of `now/now` would be canonicalized by replacing
 *   both occurences of `now` with the current date/time.  This is not generally
 *   useful, but can be used to easily specify a temporal range that includes
 *   no granules to prevent discovering anything, if the need should arise.
 *
 * @param {{[name:string]: any}} queryParams - CMR search query parameters to
 *    canonicalize
 * @returns {{[name:string]: any}} a canonicalized copy of the specified query
 *    parameters
 */
function toCanonicalQueryParams(queryParams) {
  const canonical = R.pipe(
    R.toPairs,
    R.map(([name, value]) => [camelCase(name, { stripRegexp: /[^A-Z\d\[\]]/ig }), value]),
    R.fromPairs,
    R.when(R.prop("scroll"), R.omit(["pageNum"])),
    R.when(R.prop("temporal"), (params) =>
      // Replace all occurences of `now` in temporal with the current date/time.
      // Passing `Date.now()` to the `Date` constructor is not necessary, but
      // doing so allows us to mock a value during unit testing.
      R.assoc(
        "temporal",
        params.temporal.replace(/now/gi, new Date(Date.now()).toISOString()),
        params,
      )
    ),
    R.pickBy(isNotMissing),
  );

  return canonical(queryParams);
}

/**
 * Builds a search parameters object suitable for a CMR search of the specified
 * granule of the specified collection.
 *
 * @param {Object} params - named parameters
 * @param {Object} params.collection - collection object containing a `name`,
 *    `version`, `granuleId` (regex), and optionally `meta.cmrSearchParams`
 * @param {Object} params.granule - granule object containing a `granuleId`
 *    property specifying the granule to be searched for
 * @returns {{shortName, readableGranuleName}} parameters to use to search for
 *    the specified granule of the specified collection
 */
function buildGranuleSearchParams({ collection, granule }) {
  const { name, version, granuleId: granuleIdPattern } = collection;
  const { granuleId } = granule;
  const metaParams = R.pathOr({}, ["meta", "cmrSearchParams"], collection);
  const shortName = metaParams.short_name || metaParams.shortName || name;
  const searchVersion = metaParams.version || version;

  // If the granuleId matches the granuleIdExtraction regex, then it is the same
  // as the producerGranuleId (a filename), so we use it directly as the
  // readable granule name for searching.  Otherwise, we assume the granuleId is
  // the granuleUR, which includes the collection name and version, so we'll
  // replace the collection name and version with the values specified in the
  // collection's meta.cmrSearchParams instead, if they were configured.
  const readableGranuleName = new RegExp(granuleIdPattern).test(granuleId)
    ? granuleId
    : granuleId.replace(name, shortName).replace(version, searchVersion);

  // Find granule matching either granule ur or producer granule id
  // See https://cmr.earthdata.nasa.gov/search/site/docs/search/api.html#g-granule-ur-or-producer-granule-id
  return { shortName, readableGranuleName };
}

module.exports = {
  buildGranuleSearchParams,
  findCollection,
  findConcepts,
  findGranule,
  publishGranule,
  toCanonicalHeaders,
  toCanonicalQueryParams,
  validateGranule,
};
