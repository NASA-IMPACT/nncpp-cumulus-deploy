const test = require("ava");
const fs = require("fs");
const sinon = require('sinon');
const yaml = require("js-yaml");

const testCollection = JSON.parse(fs.readFileSync(
  `${__dirname}/fixtures/USER_SHARED_TEST.json`,
  "utf8"
));
const CMR = require('../src/cmr');
const { generateGranuleMetadata, generateMetadataXml } =
  require("../src/publishGranule");
const { formatAddlAttrsForXML } = require("../src/helpers");

const version = '001';
const files = [
  {
    filename: 's3://file-location',
    type: 'data',
  }
];
const testGranules = [
  {
    granuleId: 'SC:GEDI01_B.001:2352066028',
    collection: {
      name: 'GEDI01_B',
      version
    },
    files
  },
  {
    granuleId: 'SC:GEDI02_A.001:2352077307',
    collection: {
      name: 'GEDI02_A',
      version
    },
    files
  },
  {
    granuleId: 'SC:GEDI02_B.001:2352994109',
    collection: {
      name: 'GEDI02_B',
      version
    },
    files
  },
  {
    granuleId: 'user-added-granule.tif',
    collection: {
      name: 'USER_SHARED_TEST',
      version: '001',
    },
    files,
  },
];

// Stub the collection response for the USER_SHARED_TEST granule
sinon.stub(CMR, 'findCollection').withArgs({
  "name": "USER_SHARED_TEST",
  "version": "001"
})
.returns(testCollection);
CMR.findCollection.callThrough();

test("returns the error from CMR when params are incorrect", async t => {
  await t.throwsAsync(
    CMR.findGranule({ granule_ur: testGranules[0].granuleId }),
    { message: /does not allow querying across granules in all collections/i }
  );
});

test("returns the json metadata from CMR", async t => {
  const short_name = testGranules[0].collection.name;
  const granule_ur = testGranules[0].granuleId;
  const actualMetadata = await CMR.findGranule({ short_name, granule_ur });
  // Replace all ":" with "-" in granule UR to obtain name of expectation file
  // because ":" is not a legal filename character on some systems (Windows).
  const expectedMetadata = JSON.parse(fs.readFileSync(
    `${__dirname}/fixtures/${granule_ur.replace(/:/g, "-")}.umm.json`, "utf8"
  ));

  t.deepEqual(actualMetadata, expectedMetadata);
});

for (let i = 0; i < testGranules.length; i += 1) {
  const granule = testGranules[i];
  const granule_ur = granule.granuleId;
  const collection = granule.collection;

  test(`generates expected metadata for ${granule_ur} for MAAP CMR`, async t => {
    const metadataForCMR = await generateGranuleMetadata({
      collection,
      granule,
    });
    let expectedMetadata = yaml.safeLoad(
      fs.readFileSync(
        `${__dirname}/fixtures/granule_metadata_expectations.yml`,
        "utf8"
      )
    )[granule_ur];
    expectedMetadata.Granule.AdditionalAttributes = formatAddlAttrsForXML(
      expectedMetadata.Granule.AdditionalAttributes
    );
    if (collection.name === 'USER_SHARED_TEST') {
      delete metadataForCMR.Granule.InsertTime;
      delete metadataForCMR.Granule.LastUpdate;
      delete metadataForCMR.Granule.DataGranule.ProductionDateTime;
    };
    t.deepEqual(metadataForCMR, expectedMetadata);
  });

  test(`${granule_ur} metadata is valid for MAAP CMR`, async t => {
    if (collection.name === 'USER_SHARED_TEST') return t.pass();
    const { granuleUR, xml } = await generateMetadataXml({
      collection,
      granule,
    });
    const response = await CMR.validateGranule(granuleUR, xml);

    t.like(response, { status: 200, data: "" });
  });
}
