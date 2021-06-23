const CMR = require("../../cmr");

async function createContext({ collection, granule }) {
  const granuleSearchParams = CMR.buildGranuleSearchParams({ collection, granule });

  return {
    collection,
    granule: {
      ...granule,
      meta: await CMR.findGranule(granuleSearchParams, "ops"),
    }
  }
}

module.exports = createContext;
