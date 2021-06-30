"use strict";

const test = require('ava');
const {{ cookiecutter.camelCaseFunctionName }} = require('../src/{{ cookiecutter.camelCaseFunctionName }}');

test('should do something', async (t) => {
  const result = await {{ cookiecutter.camelCaseFunctionName }}({
    eventKey1: "value1",
    eventKey2: "value2"
  });

  t.is(result.foo, "bar");
});
