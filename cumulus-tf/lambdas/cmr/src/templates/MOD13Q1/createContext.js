const CMR = require("../../cmr");

/**
 * Creates a Nunjucks "context" object for rendering granule metadata from the
 * corresponding Nunjucks template file.
 *
 * @param {Object} kwargs - keyword arguments
 * @param {{name, version, granuleId}} kwargs.collection - collection object
 * @param {{granuleId}} kwargs.granule - granule object
 * @returns {Object} Nunjucks template context
 */
async function createContext({ collection, granule }) {
  const params = CMR.buildGranuleSearchParams({ collection, granule });
  const granuleMeta = await CMR.findGranule(params, "ops");
  const collectionMeta = await CMR.findCollection(collection, "ops");

  if (!collectionMeta) {
    throw new ReferenceError(
      `Collection not found: ${collection.name}___${collection.version}`
    );
  }

  if (!granuleMeta) {
    throw new ReferenceError(`Granule not found: ${granule.granuleId}`)
  }

  return {
    collection: {
      ...collection,
      meta: collectionMeta
    },
    granule: {
      ...granule,
      meta: granuleMeta
    },
  };
}

module.exports = createContext;
