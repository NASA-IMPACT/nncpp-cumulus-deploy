const CMR = require("../src/cmr");
const nock = require("nock");
const test = require("ava");

test.before(async (t) => {
  nock.disableNetConnect();
  t.context.basePath = `https://${process.env.CMR_HOST}`;
});

test.after(async (t) => {
  nock.cleanAll();
  nock.enableNetConnect();
});

test.serial(
  "publishGranule should eventually succeed after retrying",
  async (t) => {
    const granuleUR = "abc123";
    const pubGranuleUrlPattern = new RegExp(`/ingest/.+/granules/${granuleUR}`);
    const scope = nock(t.context.basePath)
      .put(pubGranuleUrlPattern)
      .times(2)
      .reply(500)
      .put(pubGranuleUrlPattern)
      .reply(201);

    const response = await CMR.publishGranule(granuleUR, "xml");

    scope.done();
    t.is(201, response.status);
  }
);

test.serial(
  "publishGranule should eventually fail after retrying",
  async (t) => {
    const granuleUR = "abc123";
    const pubGranuleUrlPattern = new RegExp(`/ingest/.+/granules/${granuleUR}`);
    const scope = nock(t.context.basePath)
      .put(pubGranuleUrlPattern)
      .times(2)
      .reply(500);

    await t.throwsAsync(() => CMR.publishGranule(granuleUR, "xml"));
    scope.done();
  }
);

test.serial(
  "publishGranule should delete existing granule on attempt to change parent collection",
  async (t) => {
    const granuleUR = "abc123";
    const pubGranuleUrlPattern = new RegExp(`/ingest/.+/granules/${granuleUR}`);
    const scope = nock(t.context.basePath)
      .put(pubGranuleUrlPattern)
      .reply(422, { "errors": ["parent collection cannot be changed"] })
      .delete(pubGranuleUrlPattern)
      .reply(200)
      .put(pubGranuleUrlPattern)
      .reply(201);

    const response = await CMR.publishGranule(granuleUR, "xml");

    scope.done();
    t.is(201, response.status);
  }
);
