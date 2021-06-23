const test = require("ava");
const CMR = require("../src/cmr");

test.before(async (t) => {
  // Stub out Date.now() so we can test against fixed Date values, but set the
  // mocked value to the current date/time, as there are dependencies that use
  // Date.now(), but which fail when the value returned is not the current
  // date/time (within some tolerance).
  const now = Date.now();
  t.context.realDateNow = Date.now.bind(Date);
  Date.now = () => now;
});

test.after(async (t) => {
  // Restore original Date.now() function.
  Date.now = t.context.realDateNow;
});

test("toCanonicalQueryParams should substitute single occurrence of `now`", (t) => {
  const start = "P56D";
  const now = new Date(Date.now()).toISOString();
  const expectedParams = { temporal: `${start}/${now}` };
  const actualParams = CMR.toCanonicalQueryParams({ temporal: `${start}/now` });

  t.deepEqual(expectedParams, actualParams);
});

test("toCanonicalQueryParams should substitute all occurrences of `now`", (t) => {
  const now = new Date(Date.now()).toISOString();
  const expectedParams = { temporal: `${now}/${now}` };
  const actualParams = CMR.toCanonicalQueryParams({ temporal: `now/now` });

  t.deepEqual(expectedParams, actualParams);
});

test("toCanonicalQueryParams should not add temporal param when not supplied", (t) => {
  const expectedParams = { param: "value" };
  const actualParams = CMR.toCanonicalQueryParams(expectedParams);

  t.deepEqual(expectedParams, actualParams);
});

test("toCanonicalQueryParams should convert snake_case names to camelCase", (t) => {
  const expectedParams = { paramName: "value" };
  const actualParams = CMR.toCanonicalQueryParams({ param_name: "value" });

  t.deepEqual(expectedParams, actualParams);
});

test("toCanonicalQueryParams should remove page_num when scroll is truthy", (t) => {
  const expectedParams = { scroll: true };
  const actualParams = CMR.toCanonicalQueryParams({ page_num: 1, scroll: true });

  t.deepEqual(expectedParams, actualParams);
});

test("toCanonicalQueryParams should remove pageNum when scroll is truthy", (t) => {
  const expectedParams = { scroll: true };
  const actualParams = CMR.toCanonicalQueryParams({ pageNum: 1, scroll: true });

  t.deepEqual(expectedParams, actualParams);
});

test("toCanonicalQueryParams should remove params with nil or empty values", (t) => {
  const expectedParams = { a: 1, b: "foo" };
  const actualParams = CMR.toCanonicalQueryParams(
    { a: 1, b: "foo", x: null, y: undefined, z: "" }
  );

  t.deepEqual(expectedParams, actualParams);
});
