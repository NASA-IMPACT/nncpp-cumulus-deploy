const test = require('ava');
const I = require('iter-tools-es');
const R = require('ramda');
const {
  asyncFlatUnfold,
  asyncUnfold,
  asyncZipBy,
} = require('../src/async-iter');

test('asyncUnfold properly unfolds', async (t) => {
  const f = (x) => x > 0 && [x, x - 1];
  const xs = await I.asyncToArray(asyncUnfold(f)(3));

  t.deepEqual(xs, [3, 2, 1]);
});

test('asyncFlatUnfold properly unfolds flat', async (t) => {
  const f = (x) => x > 0 && [[x, x - 1], x - 2];
  const xs = await I.asyncToArray(asyncFlatUnfold(f)(4));

  t.deepEqual(xs, [4, 3, 2, 1]);
});

test('asyncZipBy successfully zips 2 ordered iterables', async (t) => {
  const generateSrcGranules = async function* () {
    yield* [
      { granuleId: '1' },
      { granuleId: '2' },
      { granuleId: '3' },
      { granuleId: '4' },
      { granuleId: '5' },
    ]
  };
  const generateDstGranules = async function* () {
    yield* [
      { granuleId: '2' },
      { granuleId: '4' },
      { granuleId: '6' },
    ]
  };
  const actualZippedGranules = await I.asyncToArray(
    asyncZipBy(R.prop('granuleId'), generateSrcGranules(), generateDstGranules())
  );
  const expectedZippedGranules = [
    [{ granuleId: '1' }, undefined],
    [{ granuleId: '2' }, { granuleId: '2' }],
    [{ granuleId: '3' }, undefined],
    [{ granuleId: '4' }, { granuleId: '4' }],
    [{ granuleId: '5' }, undefined],
    [undefined, { granuleId: '6' }],
  ]

  t.deepEqual(actualZippedGranules, expectedZippedGranules);
});
