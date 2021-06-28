const _ = require("lodash/fp");
const test = require("ava");
const {
  discoverGranulesIngestFailures,
} = require("../src/discoverGranulesIngestFailures");
const { asyncToArray } = require('iter-tools-es');

async function* findGranules() {
  yield storedGranule1;
  yield storedGranule2;
}

const discoveredGranule1 = {
  dataType: "SENTINEL-1A_DP_GRD_HIGH",
  version: "1",
  granuleId: "S1A_S3_GRDH_1SDH_20140615T034627_20140615T034652_001055_00107C_CE76",
  files: [
    {
      "name": "S1A_S3_GRDH_1SDH_20140615T034627_20140615T034652_001055_00107C_CE76.zip",
      "path": "/GRD_HD/SA",
      "size": 245105645,
      "type": "data"
    }
  ],
};

const discoveredGranule2 = {
  dataType: "ATL08_ARD-beta",
  version: "001",
  granuleId: "ATL08_ARD-beta.Peru",
  files: [
    {
      "type": "data",
      "name": "ept.json",
      "path": "file-staging/nasa-map/ATL08_ARD-beta___001/peru/ept",
      "size": 0
    }
  ],
};

const storedGranule1 = {
  collectionId: "SENTINEL-1A_DP_GRD_HIGH___1",
  status: "failed",
  ..._.omit(["dateType", "version"], discoveredGranule1),
};

const storedGranule2 = {
  collectionId: "ATL08_ARD-beta___001",
  status: "failed",
  ..._.omit(["dateType", "version"], discoveredGranule2),
};

test("discoverGranulesIngestFailures correctly discovers granules", async (t) => {
  const { granules } = await discoverGranulesIngestFailures({ findGranules });
  t.deepEqual(await asyncToArray(granules), [discoveredGranule1, discoveredGranule2]);
});
