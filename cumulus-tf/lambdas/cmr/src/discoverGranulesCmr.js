const CMR = require("./cmr");
const Path = require("path");
const R = require("ramda");
const I = require("iter-tools-es");
const { checkGranuleHasNoDuplicate } = require("@cumulus/discover-granules");
const providersApi = require("@cumulus/api-client/providers");
const collectionsApi = require("@cumulus/api-client/collections");

/**
 * A CMR Provider to use for discovering granules.
 *
 * @typedef {Object} Provider
 *
 * @property {string} host - hostname (or address) of the CMR
 */

/**
 * A Collection of Granules.
 *
 * @typedef {Object} Collection
 *
 * @property {string} name - name of the collection
 * @property {string} version - version of the collection
 * @property {Object} [meta] - custom properties not defined in Cumulus
 * @property {Object} [meta.cmrSearchParams] - name-value pairs of query
 *    parameters for refining the MAAP CMR search for granules in this
 *    collection
 */

/**
 * A Granule object.
 *
 * @typedef {Object} Granule
 *
 * @property {string} granuleId - unique identifier
 * @property {string} dataType - data type (typically the same as the collection
 *    name)
 * @property {string} version - collection version
 * @property {GranuleFile[]} files - list of files associated with this granule
 */

/**
 * A Granule File object.
 *
 * @typedef {Object} GranuleFile
 *
 * @property {string} type - always `"data"` for our purposes
 * @property {string} name - name of the file
 * @property {string} path - relative path of the file at the provider
 * @property {string} filename - the full path of the file
 * @property {Number} size - size of the file in bytes
 */

/**
 * Lambda Function handler that discovers granules in the collection provided in
 * the specified event object via the MAAP CMR.
 *
 * @param {object} event - Lambda Function event object
 * @param {object} event.config - configuration object supplied via the Cumulus
 *    Message Adapter
 * @param {string} event.config.stack - Cumulus stack (prefix)
 * @param {Provider} event.config.provider - the CMR to search
 * @param {"skip" | "error" | "replace" | "version"} [event.config.duplicateHandling] -
 *    the duplicate granule handling policy (defaults to `collection.duplicateHandling`
 *    or `"skip"`, if not specified on the collection)
 * @param {Collection} [event.config.collection] - the collection in which to
 *    discover granules
 * @param {{[name:string]: string}} [event.config.searchParams] - CMR search parameters
 * @returns {Promise<{granules: Granule[]}>} an object with a single property
 *    named `granules` containing a (possibly empty) list of granules discovered
 *    (possibly without duplicates that were previously ingested)
 * @throws {Error} if the `collection` is missing its `name` or `version`, or
 *    a network failure occurs
 */
async function discoverGranulesCmr(event) {
  return { granules: await discoverGranules(await makeDiscoverGranulesParams(event)) };
}

/**
 * Given a Lambda Function event, builds and returns a parameters object
 * suitable for passing to `discoverGranules`.
 *
 * Primarily, this merges any CMR search parameters specified via the specified
 * collection's `meta.cmrSearchParams` nested property with the specified search
 * parameters, giving precedence to the latter.  This is to allow CMR search
 * parameters to be specified via a `rule.meta.cmrSearchParams` property to
 * supplement and/or override search parameters specified on the rule's
 * collection.
 *
 * It also allows overriding the collection's `duplicateHandling` value, again,
 * typically via `rule.meta.duplicateHandling`.
 *
 * @param {object} event - Lambda Function event from AWS
 * @param {object} event.config - configuration values for controlling discovery
 *    behavior
 * @param {string} event.config.stack - the current Cumulus stack (prefix)
 * @param {object} event.config.provider - the CMR to query
 * @param {string} event.config.provider.host - the hostname or address of the
 *    CMR service to query
 * @param {"skip" | "error" | "replace" | "version"}
 *    [event.config.duplicateHandling] - the duplicate granule handling policy
 *    (defaults to `event.config.collection.duplicateHandling` or `"skip"`, if
 *    not specified on the collection)
 * @param {{[name:string]: any}} [event.config.searchHeaders] - request headers
 *    with the following defaults set, if not specified:
 *    `{ "Client-Id": `MAAP-Cumulus-${stack}` }`
 * @param {{[name:string]: any}} [event.config.searchParams] - request query
 *    parameters to narrow the search
 * @returns {DiscoverGranulesParams} parameters for passing to
 *    `discoverGranules`
 */
async function makeDiscoverGranulesParams(event) {
  const {
    stack,
    provider,
    collection = {},
    searchHeaders = {},
    searchParams = {},
    discoveryDuplicateHandling = collection.duplicateHandling,
    ingestMessageCustomMeta = {},
    ingestProviderId,
    ingestCollection = {}
  } = event.config;
  const { host } = provider;
  const headers = {
    ...CMR.toCanonicalHeaders({ "Client-Id": `MAAP-Cumulus-${stack}` }),
    ...CMR.toCanonicalHeaders(searchHeaders),
  };
  const queryParams = {
    downloadable: true,
    ...CMR.toCanonicalQueryParams(R.pathOr({}, ["meta", "cmrSearchParams"], collection)),
    ...CMR.toCanonicalQueryParams(searchParams),
  };

  // Using GET /providers endpoint because it will return a response
  // including the provider password
  const getProvidersResponse = await providersApi.getProviders({
    prefix: stack,
    queryStringParameters: {
      id: ingestProviderId
    },
  });
  const getProvidersBody = JSON.parse(getProvidersResponse.body)
  const [ingestProvider] = getProvidersBody.results;

  // Using GET /collectionss endpoint because it will return a response
  // including the full collection
  const ingestCollectionFull = await collectionsApi.getCollection({
    prefix: stack,
    collectionName: ingestCollection.name,
    collectionVersion: ingestCollection.version,
  });

  return {
    host,
    collection,
    headers,
    queryParams,
    discoveryDuplicateHandling,
    ingestMessageCustomMeta,
    ingestProvider,
    ingestCollectionFull
  };
}

/**
 * @callback FindConceptsFn
 *
 * @param {string} host - hostname (or address) of the CMR server
 * @param {string} type - concept type to find (e.g., `"granules"`)
 * @param {{[name:string]: string}} [headers] - request headers
 * @param {{[name:string]: any}} [queryParams] - request query parameters
 *    to narrow the search
 * @returns {AsyncGenerator<{[name:string]: any}[]>}
 */

/**
 * @typedef {Object} DiscoverGranulesParams
 *
 * @property {string} host - hostname (or address) of the CMR server
 * @property {"skip" | "error" | "replace" | "version"} [duplicateHandling] - the
 *    duplicate granule handling policy (defaults to `collection.duplicateHandling`
 *    or `"skip"`, if not specified on the collection)
 * @property {Collection} [collection] - the granule's parent collection
 * @property {{[name:string]: string}} [headers] - request headers
 * @property {{[name:string]: any}} [queryParams] - request query parameters
 *    to narrow the search
 * @property {FindConceptsFn} [findConcepts=CMR.findConcepts] - function
 *    used to search for concepts
 */

/**
 * Returns a (possibly filtered) list of granules found via a CMR search.
 *
 * Searches the specified CMR for granules in the specified collection,
 * filtering results based upon how duplicate granules should be handled.
 * A granule is considered a "duplicate" when there exists a record for it in
 * the Cumulus `<stack>-GranulesTable` DynamoDB table.  A record is written for
 * a granule only once its file has been synched (regardless of success or
 * failure).
 *
 * Duplicate handling is configured via either the collection's
 * `duplicateHandling` property (defaults to `"skip"`).  The supported values
 * are `"skip"` (_exclude_ the duplicate from the list), `"replace"` or
 * `"version"` (_include_ the duplicate in the list), and `"error"` (throw an
 * error when a duplicate is found, causing discovery to fail).
 *
 * @param {DiscoverGranulesParams} - params
 * @returns {AsyncIterator<Granule>} a (possibly empty) async iterator of granules
 *    discovered (possibly without duplicates that were previously ingested)
 * @throws {Error} if a duplicate granule is found and duplicate handling is
 *    configured as `"error"`, or a network or service error occurs
 */
function discoverGranules({
  host,
  collection = {},
  headers = {},
  queryParams = {},
  discoveryDuplicateHandling = collection.duplicateHandling,
  ingestMessageCustomMeta = {},
  ingestProvider,
  ingestCollectionFull,
  findConcepts = CMR.findConcepts,
}) {
  const type = "granules";
  const format = "umm_json";
  const syncDuplicateHandling = ingestCollectionFull.duplicateHandling || "skip";
  const toUMM = makeToUMMFn(host);
  const toGranule = makeToGranuleFn(
    syncDuplicateHandling,
    ingestMessageCustomMeta,
    ingestProvider,
    collection
  );
  const isNotDuplicate = makeIsNotDuplicateFn(
    discoveryDuplicateHandling || syncDuplicateHandling
  );
  const defaultQueryParams = {
    shortName: ingestCollectionFull.name,
    version: ingestCollectionFull.version,
  };
  const query = {
    ...CMR.toCanonicalQueryParams(defaultQueryParams),
    ...CMR.toCanonicalQueryParams(queryParams),
  };

  return I.execPipe(
    findConcepts({ host, type, format, headers, queryParams: query }),
    I.asyncMap(R.pipe(toUMM, toGranule)),
    I.asyncFilter(R.hasPath(["files", 0])),
    I.asyncFilter(isNotDuplicate),
    I.asyncBuffer(16),
  );
}

/**
 * Returns a possibly `async` predicate function that determines whether or not
 * a specified granule has been discovered before, based upon the specified
 * duplicate handling policy.
 *
 * @param {"skip" | "error" | "replace" | "version"} duplicateHandling - the
 *    duplicate granule handling policy
 * @returns {(granule: Granule) => boolean | Promise.<boolean>} a predicate
 *    function that accepts a granule and returns `true` if `duplicateHandling`
 *    is `"replace"`, or `"version"`, or it is `"skip"` _and_ the granule has
 *    not been discovered previously; `false` otherwise, unless
 *    `duplicateHandling` is `"error"` and the granule has been previously
 *    discovered, in which case it throws an error
 */
function makeIsNotDuplicateFn(duplicateHandling) {
  return ["skip", "error"].includes(duplicateHandling)
    ? ({ granuleId }) => checkGranuleHasNoDuplicate(granuleId, duplicateHandling)
    : R.T
}

function makeToUMMFn(host) {
  const findCollectionByTitle = R.memoizeWith(R.identity, async (title) => {
    const findConceptsParams = {
      host,
      type: 'collections',
      format: 'umm_json',
      queryParams: {
        'options[entryTitle][pattern]': true,
        entryTitle: `${title}*`,
        scroll: false,
        pageSize: 1
      },
    };

    for await (const collection of CMR.findConcepts(findConceptsParams)) {
      return collection;
    }

    // No collection was found, so we'll return a "dummy" value that should at
    // least help with debugging the problem, if necessary.
    return { ShortName: title, Version: '0' };
  });

  function sizeInBytes(umm, { URL: url, Type: type }) {
    const distros = umm.ArchiveAndDistributionInformation
      .filter(({ Size, SizeInBytes }) => Size || SizeInBytes);
    // Find distro with name matching the URL, or, if there is not match and the type
    // is 'GET DATA' and there is only 1 distro, assume it is the corresponding distro.
    const distro = distros.find(({ Name }) => url.href.endsWith(`/${Name}`)) ||
      type === 'GET DATA' && distros.length === 1 && distros[0] ||
      {};
    const { Size: size, SizeUnit: unit, SizeInBytes: bytes } = distro;
    const unitFactor = {
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'TB': 1024 * 1024 * 1024 * 1024,
      'PB': 1024 * 1024 * 1024 * 1024 * 1024,
    }

    return (
      /* */ bytes ? Number(bytes) :
      /* */  size ? Math.round(size * (unitFactor[unit] || 1)) :
      /* else */    undefined
    );
  }

  return (rawUMM) => ({
    ...rawUMM,
    get ArchiveAndDistributionInformation() {
      return R.pathOr(
        [],
        ['DataGranule', 'ArchiveAndDistributionInformation'],
        this,
      );
    },
    /**
     * Returns this granule's `CollectionReference` property, if it contains non-empty
     * values for both the `ShortName` and `Version` properties; otherwise returns a
     * Promise of such an object if it contains an `EntryTitle` property, and a CMR
     * search finds a collection with such a title; otherwise returns a Promise that
     * resolves to `undefined`.
     *
     * **IMPORTANT:** Since the caller cannot know whether or not an async call to
     * perform a CMR search for the collection is necessary, this property should
     * always be accessed with the `await` keyword.
     *
     * @example
     * const collection = await umm.CollectionReference;
     *
     * @returns {Promise<{ShortName, Version} | undefined>} a Promise of this granule's
     *    parent collection, if available; `undefined` otherwise
     */
    get CollectionReference() {
      const ref = rawUMM.CollectionReference || {};
      if (ref.ShortName && ref.Version) return ref;
      if (!ref.EntryTitle) return { ShortName: 'unknown', Version: 'unknown' };
      return findCollectionByTitle(ref.EntryTitle);
    },
    get RelatedUrls() {
      return R.propOr([], "RelatedUrls", rawUMM)
        .map(R.tryCatch(
          (relatedUrl) => {
            const enhancedUrl = { ...relatedUrl, URL: new URL(relatedUrl.URL) };
            return { ...enhancedUrl, SizeInBytes: sizeInBytes(this, enhancedUrl) };
          },
          (error) => {
            console.error(`${error.message}: ${JSON.stringify(rawUMM)}`);
            return { error };
          },
        ))
        .filter(({ error }) => !error);
    },
    get ProducerGranuleId() {
      const ids = R.pathOr([], ['DataGranule', 'Identifiers'], this);
      const id = ids.find(R.propEq('IdentifierType', 'ProducerGranuleId')) || {};
      return id.Identifier;
    },
    get ReadableGranuleName() {
      return this.GranuleUR || this.ProducerGranuleId;
    },
  });
}

/**
 * Returns a function that takes a single CMR metadata object (obtained from a
 * search) and converts it to a granule object.
 *
 * If an `ingestMessageCustomMeta` object is specified, it is added as the
 * `meta` property of each granule object produced by the function that this
 * function returns.  This allows the `QueueGranule` step to add such metadata
 * to the message that it enqueus for each granule, thus injecting values into
 * the `meta` property of the Cumulus message made available to the "ingest and
 * publish" workflow.
 *
 * @param {"skip" | "error" | "replace" | "version"} syncDuplicateHandling -
 *    the duplicate granule handling policy to use during the `SyncGranule` step
 * @param {Object} [ingestMessageCustomMeta={}] - custom Cumulus metadata to add
 *    to each granule object produced by the function returned by this function
 * @returns {Function<Granule>} a function that takes a single metadata
 *    object (from a list of metadata objects returned from a CMR search query),
 *    and converts it to a granule object
 */
function makeToGranuleFn(
  syncDuplicateHandling,
  ingestMessageCustomMeta = {},
  ingestProvider,
  collection
) {
  return async function toGranule(umm) {
    const granuleId = umm.ReadableGranuleName;
    const downloadUrls = umm.RelatedUrls
      .filter(R.propSatisfies(R.startsWith('GET DATA'), 'Type'));

    return {
      granuleId,
      dataType: collection.name,
      version: collection.version,
      files: downloadUrls.map(({ URL: url, Type: type, SizeInBytes: size }) => {
        const { path, name } = splitURL({ url, collection });
        return {
          type: type === 'GET DATA' ? 'data' : undefined,
          path,
          name,
          filename: url.href
          // size, /* TODO re-enable verifying downloaded file adding size back to granule */
        }
      }),
      meta: {
        ingestProvider,
        collection,
        ...ingestMessageCustomMeta,
      },
    }
  }
}

/**
 * Splits the specified URL's `pathname` into a `path` and a `name`, correctly
 * handling the case where the URL is a file staging URL.
 *
 * If the URL's pathname includes the specified collection's name and version,
 * the URL is assumed to point to a staged file in S3.  In such a case, we don't
 * want to simply split the filename from the end of the pathname because in
 * we assume that we will end up synching from one file staging location to
 * another one.  Given the way that Cumulus constructs the destination file
 * staging URL from the path and name of the file in a granule's `files` list,
 * a simple split will not produce the correct destination URL in all cases.
 *
 * For example, given `s3://src-bucket/file-staging/NAME___VERSION/file.ext`,
 * where `NAME` and `VERSION` are the specified collection's name an version,
 * respectively, extracting the `path` as `file-staging/NAME___VERSION` and the
 * `name` as `file.ext`, the destination URL would be correctly constructed as
 * `s3://dst-bucket/file-staging/NAME___VERSION/file.ext` because only the
 * `name` is used, wherease the `path` is ignored and instead constructed solely
 * from the `file-staging` directory and the collection ID.
 *
 * However, the _same_ destination URL would be constructed for the URL
 * `s3://src-bucket/file-staging/NAME___VERSION/path/to/file.ext` as well, when
 * only `file.ext` is specified as the `name`.  To address such a situation,
 * this function splits such a URL such that `path` is
 * `file-staging/NAME___VERSION` and `name` is `path/to/file.ext`.  Thus, the
 * resulting destination URL would be correctly constructed from
 * `file-staging/NAME___VERSION` and `path/to/file.ext`.
 *
 * @param {Object} params - named parameters
 * @param {URL} params.url - the granule URL to split into a path and a name
 * @param {Collection} params.collection - the granule's parent collection
 * @returns {{ path: string, name: string }} an object with `path` and `name`
 *    properties, representing the specified URL's `pathname` split into a path
 *    part and a name part
 */
function splitURL({ url, collection }) {
  // const re = new RegExp(
  //   `^(?<path>/.+/${collection.name}[^/]+${collection.version})/(?<name>.+)$`
  // );
  // const pathname = url.pathname;
  // const match = pathname.match(re);
  // const { path, name } = match
  //   ? match.groups
  //   : { path: Path.dirname(pathname), name: Path.basename(pathname) };

  // Drop leading forward slash from path
  return {
    path: Path.dirname(url.pathname).slice(1),
    name: Path.basename(url.pathname),
  }
}


module.exports = Object.assign(discoverGranulesCmr, {
  discoverGranules,
  discoverGranulesCmr,
  makeDiscoverGranulesParams,
});
