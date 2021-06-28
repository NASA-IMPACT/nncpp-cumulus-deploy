const test = require('ava');
const flightType = require('../src/templates/LVIS/types/flightType');

test('flightType.resolve resolves a valid producer granule ID', (t) => {
  t.truthy(flightType.resolve("LVISF1B_ABoVE2019_0807_R2003_088581.h5"))
});

test('flightType.resolve does not resolve an invalid producer granule ID', (t) => {
  t.falsy(flightType.resolve("invalid"))
});

test('flightType.construct returns the flight number for a valid producer granule ID', (t) => {
  t.is(
    flightType.construct("LVISF1B_ABoVE2019_0807_R2003_088581.h5"),
    "58702_015540"
  );
});

test('flightType.construct throws when no flight is found', (t) => {
  t.throws(
    () => flightType.construct("LVISF1B_ABoVE2019_0806_R2003_088581.h5"),
    { message: /no flight found/i }
  );
});
