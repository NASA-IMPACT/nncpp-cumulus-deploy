const R = require("ramda");

// The Nunjucks documentation is missing details regarding built-in tests.  To
// see the built-in tests, you must refer to the source code in GitHub at
// https://github.com/mozilla/nunjucks/blob/master/nunjucks/src/tests.js

/*
 * A name/function mapping to use as "tests" in a Nunjucks environment.
 */
module.exports = {
  endswith: R.flip(R.endsWith),
  includes: R.flip(R.includes),
};
