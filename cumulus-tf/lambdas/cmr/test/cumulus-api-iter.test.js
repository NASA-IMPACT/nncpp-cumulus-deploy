const test = require("ava");
const _ = require("lodash/fp");
const { asyncToArray } = require("iter-tools-es");
const { makeContinuous } = require("../src/cumulus-api-iter");

const pagedThingsByPrefix = {
  foo: [
    [
      { name: "firstThing", index: 0 },
      { name: "secondThing", index: 1 },
    ],
    [
      { name: "thirdThing", index: 0 },
      { name: "fourthThing", index: 1 },
    ],
    [
      { name: "fifthThing", index: 0 },
    ],
    [],
  ]
};

async function listThings({ prefix, query }) {
  return {
    body: JSON.stringify({
      results: pagedThingsByPrefix[prefix][query.page - 1].map(_.pick(query.fields)),
    })
  };
}

test("makeContinuous lists paged items continuously", async (t) => {
  const listThingsContinuously = makeContinuous(listThings);
  const prefix = "foo";
  const query = { fields: "name" };
  const things = await asyncToArray(listThingsContinuously({ prefix, query }));
  const expected = [
    { name: "firstThing" },
    { name: "secondThing" },
    { name: "thirdThing" },
    { name: "fourthThing" },
    { name: "fifthThing" },
  ];

  t.deepEqual(things, expected);
});
