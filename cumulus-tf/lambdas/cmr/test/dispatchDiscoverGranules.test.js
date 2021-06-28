const test = require("ava");
const FS = require("fs");
const R = require("ramda");
const discoverGranulesCmr = require("../src/discoverGranulesCmr");
const discoverGranulesIngestFailures = require("../src/discoverGranulesIngestFailures");

const {
  dispatchDiscoverGranules,
  resolveFunction,
} = require("../src/dispatchDiscoverGranules");

const granule1 = {
  granuleId: "1",
  files: [
    {
      filename: "http://host",
    }
  ]
};

const granule2 = {
  granuleId: "2",
  files: [
    {
      filename: "s3://cumulus-map-internal/file-staging/nasa-map/foo.bar",
    }
  ]
};

async function discover() {
  return {
    granules: [
      granule1,
      granule2,
    ],
  }
}

test("resolveFunction throws when no function is resolved", (t) => {
  t.throws(() => resolveFunction(), { message: /undefined/ });
});

test("resolveFunction returns discoverGranulesCmr", (t) => {
  const handler = resolveFunction("./discoverGranulesCmr");

  t.is(handler, discoverGranulesCmr);
});

test("resolveFunction returns discoverGranulesIngestFailures", (t) => {
  const handler = resolveFunction("./discoverGranulesIngestFailures");

  t.is(handler, discoverGranulesIngestFailures);
});

test("resolveFunction throws when module not found", (t) => {
  t.throws(() => resolveFunction("./no-such-module"), { code: "MODULE_NOT_FOUND" });
});

test("resolveFunction throws when module's default export is not a function", (t) => {
  t.throws(() => resolveFunction("./CMR"), { message: /not.* a function/ });
});

test("dispatchDiscoverGranules dispatches discovery to handler and returns unfiltered discovered granules",
  async (t) => {
    const event = {
      config: {
        provider: { id: "foo" },
        meta: {
          discoverGranulesHandler: "../test/dispatchDiscoverGranules.test"
        },
      }
    };
    const { granules } = await dispatchDiscoverGranules(event);

    t.deepEqual(granules, [granule1, granule2]);
  }
);

test("dispatchDiscoverGranules dispatches discovery to handler and returns filtered discovered granules",
  async (t) => {
    const event = {
      config: {
        provider: { id: "foo" },
        meta: {
          discoverGranulesHandler: "../test/dispatchDiscoverGranules.test",
          discoverGranulesFilter: "../src/filters/downloadURLsPointToOldS3Bucket",
        },
      }
    };
    const { granules } = await dispatchDiscoverGranules(event);

    t.deepEqual(granules, [granule2]);
  }
);

test("dispatchDiscoverGranules dispatches discovery to handler but returns no granules during dry run",
  async (t) => {
    const event = {
      config: {
        provider: { id: "foo" },
        meta: {
          dryRun: true,
          discoverGranulesHandler: "../test/dispatchDiscoverGranules.test",
        },
      }
    };
    const { granules } = await dispatchDiscoverGranules(event);

    t.deepEqual(granules, []);
  }
);

test.skip("dispatchDiscoverGranules finds missing MAAP CMR granules",
  async (t) => {
    const event = {
      config: {
        provider: { host: "cmr.earthdata.nasa.gov" },
        collection: {
          "name": "SENTINEL-1A_DP_GRD_HIGH",
          "version": "1",
          "duplicateHandling": "replace"
        },
        "discoveryDuplicateHandling": "replace",
        "searchParams": {
          "sortKey": "GranuleUR",
          "temporal": "2014-01-01T00:00:00.000Z/2017-12-31T23:59:59.999Z"
        },
        meta: {
          "dryRun": false,
          "discoverGranulesHandler": "../src/discoverGranulesCmr",
          "discoverGranulesFilter": "../src/filters/missingFromMAAPCMR",
        },
      }
    };
    const { granules } = await dispatchDiscoverGranules(event);

    t.pass();
  }
);

test.skip("dispatchDiscoverGranules finds granules with old S3 URLs",
  async (t) => {
    const event = {
      config: {
        provider: { host: "cmr.uat.maap-project.org" },
        "collection": {
          "duplicateHandling": "skip"
        },
        searchParams: {
          "provider": "NASA_MAAP",
        },
        "discoveryDuplicateHandling": "replace",
        "ingestMessageCustomMeta": {
          "granuleMetadataTemplateName": "NASA_MAAP",
          "granuleDownloadURLTemplate": "s3://${downloadBucket}${url.pathname}"
        },
        "meta": {
          "dryRun": false,
          "discoverGranulesHandler": "../src/discoverGranulesCmr",
          "discoverGranulesFilter": "../src/filters/downloadURLsPointToOldS3Bucket",
        },
      }
    };

    const { granules } = await dispatchDiscoverGranules(event);

    const records = granules
      .map(({ granuleId, dataType, version, files }) => {
        const filenames = files.map(R.prop('filename')).join('|');
        return [granuleId, dataType, version, filenames].join(',');
      })
      .join('\n');

    FS.writeFileSync('badurls.csv', records, { encoding: 'utf8' });

    t.pass();
  }
);

// Expose dummy handler to allow dispatchDiscoverGranules to load it during test
module.exports = discover;
