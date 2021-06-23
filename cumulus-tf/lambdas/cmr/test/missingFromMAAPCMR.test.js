const test = require('ava');
const I = require('iter-tools-es');
const missingFromMAAPCMR = require('../src/filters/missingFromMAAPCMR');
const nock = require('nock');

test.before(async (t) => {
  nock.disableNetConnect();
  t.context = {
    basePath: `https://${process.env.CMR_HOST}`,
    event: {
      config: {
        provider: {
          host: 'dummy'
        },
        discoveryDuplicateHandling: 'replace',
      }
    }
  }
});

test.after(async (t) => {
  nock.cleanAll();
  nock.enableNetConnect();
});

test('missingFromMAAPCMR returns empty list for existing granules', async (t) => {
  const searchGranulesURLPattern = new RegExp('/search/granules.*');
  const scope = nock(t.context.basePath)
    .get(searchGranulesURLPattern)
    .reply(200, {
      items: [
        {
          umm: {
            GranuleUR: 'foo',
            CollectionReference: {
              ShortName: 'shorty',
              Version: '1',
            },
            RelatedUrls: [
              {
                URL: 's3://bucket/path/file.ext',
                Type: 'GET DATA',
              }
            ]
          }
        }
      ]
    }, {
      'cmr-hits': 1,
    })
    .get(searchGranulesURLPattern)
    .reply(200, { items: [] });

  try {
    const missingGranules = await I.asyncToArray(missingFromMAAPCMR(
      {
        granules: [
          { granuleId: 'foo' }
        ]
      },
      t.context.event,
    ));

    t.like({ granules: missingGranules }, { granules: [] });
  } finally {
    scope.done();
  }
});

test('missingFromMAAPCMR returns non-empty list for missing granules', async (t) => {
  const searchGranulesURLPattern = new RegExp('/search/granules.*');
  const scope = nock(t.context.basePath)
    .get(searchGranulesURLPattern)
    .reply(200, { items: [] });

  try {
    const missingGranules = await I.asyncToArray(missingFromMAAPCMR(
      {
        granules: [
          { granuleId: 'missing' }
        ]
      },
      t.context.event,
    ));

    t.like({ granules: missingGranules }, { granules: [{ granuleId: 'missing' }] });
  } finally {
    scope.done();
  }
});
