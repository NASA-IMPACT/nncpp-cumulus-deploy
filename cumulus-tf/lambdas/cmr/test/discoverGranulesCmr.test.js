"use strict";

const test = require("ava");
const {
  discoverGranules,
  discoverGranulesCmr,
} = require("../src/discoverGranulesCmr");
const { asyncToArray } = require('iter-tools-es');

const stack = process.env.CUMULUS_STACK;
const provider = {
  host: "cmr.earthdata.nasa.gov"
};

test("should correctly round granule file size in bytes", async (t) => {
  async function* findConcepts() {
    yield* [
      {
        GranuleUR: "UR",
        CollectionReference: {
          ShortName: "foo",
          Version: "1",
        },
        DataGranule: {
          ArchiveAndDistributionInformation: [
            {
              // When converted to MiBs, this truncates to 525468, but rounds to 525469
              Size: 0.501126289,
              SizeUnit: 'MB',
            },
          ],
          Identifiers: [
            {
              IdentifierType: "ProducerGranuleId",
              Identifier: "ID",
            }
          ],
        },
        RelatedUrls: [
          {
            URL: "s3://bucket/path/to/filename",
            Type: "GET DATA",
            Description: "File to download",
          }
        ],
      }
    ];
  };

  const granules = await asyncToArray(await discoverGranules({
    host: provider.host,
    discoveryDuplicateHandling: "replace",
    findConcepts,
  }));

  const expected = [
    {
      dataType: "foo",
      version: "1",
      granuleId: "UR",
      files: [
        {
          path: "path/to",
          name: "filename",
          size: 525469,
          type: "data",
          filename: "s3://bucket/path/to/filename",
        },
      ],
      meta: {
        provider: {
          protocol: "s3",
          host: "bucket",
        },
        collection: {
          name: "foo",
          version: "1",
          duplicateHandling: "skip",
          files: [],
        },
      },
    },
  ];

  t.deepEqual(expected, granules);
});

test("should discover granules from CMR for a collection", async (t) => {
  const collection = {
    name: "AfriSAR_AGB_Maps_1681",
    version: "1",
    duplicateHandling: "replace",
    meta: {
      cmrSearchParams: {
        pageSize: 2,
      }
    }
  };

  const { granules } = await discoverGranulesCmr({
    config: {
      stack,
      provider,
      collection,
    }
  });

  t.is((await asyncToArray(granules)).length, 4);
});

test("should discover granules from CMR using search parameters", async (t) => {
  const collection = {
    name: "AfriSAR_AGB_Maps_1681",
    version: "1",
    duplicateHandling: "replace",
    meta: {
      cmrSearchParams: {
        bounding_box: "10.4,-1,10.6,0"
      }
    },
  };

  const { granules: actualGranules } = await discoverGranulesCmr({
    config: {
      stack,
      provider,
      collection,
    }
  });

  const expectedGranules = [
    {
      granuleId: "AfriSAR_AGB_Maps.Mabounie_AGB_50m.tif",
      dataType: "AfriSAR_AGB_Maps_1681",
      version: "1",
      files: [
        {
          type: "data",
          name: "Mabounie_AGB_50m.tif",
          path: "daacdata/afrisar/AfriSAR_AGB_Maps/data",
          size: 239976,
          filename: "https://daac.ornl.gov/daacdata/afrisar/AfriSAR_AGB_Maps/data/Mabounie_AGB_50m.tif"
        },
      ],
      meta: {
        provider: {
          protocol: "https",
          host: "daac.ornl.gov",
        },
        collection: {
          name: "AfriSAR_AGB_Maps_1681",
          version: "1",
          duplicateHandling: "replace",
          files: [],
        },
      },
    },
  ];

  t.deepEqual(await asyncToArray(actualGranules), expectedGranules);
});

test.skip("should discover very large granule set from CMR", async (t) => {
  const collection = {
    name: "SENTINEL-1A_DP_GRD_HIGH",
    version: "1",
    duplicateHandling: "replace",
    meta: {
      cmrSearchParams: {
        providerShortName: "ASF",
      }
    }
  };

  const start = Date.now();
  const granuleOutput = await discoverGranulesCmr({
    config: {
      stack,
      provider,
      collection,
      searchParams: { temporal: "2014-01-01T00:00:00Z,2015-03-31T23:59:59Z" },
    }
  });
  const elapsed = Date.now() - start;
  console.log("Elapsed seconds:", elapsed / 1000 | 0);

  t.is(granuleOutput.granules.length, 16_704);
});
