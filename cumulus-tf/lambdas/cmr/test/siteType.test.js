const test = require('ava');
const siteType = require('../src/templates/LVIS/types/siteType');

test('siteType.resolve resolves a valid producer granule ID', (t) => {
  t.truthy(siteType.resolve("LVISF1B_ABoVE2019_0807_R2003_088581.h5"))
});

test('siteType.resolve does not resolve an invalid producer granule ID', (t) => {
  t.falsy(siteType.resolve("invalid"))
});

test('siteType.construct returns the site name for a valid producer granule ID', (t) => {
  t.is(
    siteType.construct("LVISF1B_ABoVE2019_0807_R2003_088581.h5"),
    "Salt Lake City to Houston, GEDI Reference Ground Tracks"
  );
});

test('siteType.construct throws when no flight is found', (t) => {
  t.throws(
    () => siteType.construct("LVISF1B_ABoVE2019_0806_R2003_088581.h5"),
    { message: /no flight found/i }
  );
});
