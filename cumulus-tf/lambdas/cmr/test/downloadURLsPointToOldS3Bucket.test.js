const test = require('ava');
const I = require('iter-tools-es');
const downloadURLsPointToOldS3Bucket = require(
  '../src/filters/downloadURLsPointToOldS3Bucket'
);

test('downloadURLsPointToOldS3Bucket correctly filters granules', async (t) => {
  const outdatedGranules = [
    {
      files: [
        {
          filename: 's3://cumulus-map-internal/key'
        }
      ]
    },
    {
      files: [
        {
          filename: 's3://maap-cumulus-dev-internal/key'
        }
      ]
    }
  ];
  const granules = [
    {
      files: [
        {
          filename: 'http://hostname/path'
        }
      ]
    },
    ...outdatedGranules,
  ];

  t.deepEqual(
    await I.asyncToArray(downloadURLsPointToOldS3Bucket({ granules })),
    outdatedGranules,
  );
})
