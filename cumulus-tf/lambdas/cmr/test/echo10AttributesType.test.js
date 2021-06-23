const test = require('ava');
const echo10AttributesType = require('../src/types/echo10AttributesType');

test('echo10AttributesType.resolve resolves a simple mapping', (t) => {
  t.truthy(echo10AttributesType.resolve({ a: 1, b: 2 }))
});

test('echo10AttributesType.resolve resolves a complex mapping', (t) => {
  t.truthy(echo10AttributesType.resolve({ a: 1, b: ['x', 'y'] }))
});

test('echo10AttributesType.resolve does not resolve a number', (t) => {
  t.falsy(echo10AttributesType.resolve(1))
});

test('echo10AttributesType.resolve does not resolve a string', (t) => {
  t.falsy(echo10AttributesType.resolve('a'))
});

test('echo10AttributesType.resolve does not resolve an empty array', (t) => {
  t.falsy(echo10AttributesType.resolve([]))
});

test('echo10AttributesType.resolve does not resolve a non-empty array', (t) => {
  t.falsy(echo10AttributesType.resolve([1]))
});

test('echo10AttributesType.construct creates no attributes from an empty mapping', (t) => {
  t.deepEqual(
    echo10AttributesType.construct({}),
    { AdditionalAttribute: [] }
  )
});

test('echo10AttributesType.construct creates attributes from a simple mapping', (t) => {
  t.deepEqual(
    echo10AttributesType.construct({ a: 1 }),
    {
      AdditionalAttribute: [
        {
          Name: "a",
          Values: [
            {
              Value: 1,
            }
          ]
        }
      ]
    }
  )
});

test('echo10AttributesType.construct creates attributes from a complex mapping', (t) => {
  t.deepEqual(
    echo10AttributesType.construct(
      {
        a: 1,
        b: ['x', 'y'],
      }
    ),
    {
      AdditionalAttribute: [
        {
          Name: "a",
          Values: [
            {
              Value: 1,
            }
          ]
        },
        {
          Name: "b",
          Values: [
            {
              Value: "x",
            },
            {
              Value: "y",
            },
          ]
        },
      ]
    }
  )
});
