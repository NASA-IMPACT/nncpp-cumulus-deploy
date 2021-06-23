/**
 * Filters an iterable of objects by applying a test to the specified attribute
 * of each object, and only selecting the objects for which the test succeeds.
 * If no test is specified, the built-in `truthy` test is used by default,
 * which succeeds when the attribute value is a "truthy" value.
 *
 * When a test is specified, it must be the name of either a built-in test
 * function, or a custom test function added to the same Nunjucks environment
 * in which this filter is used. Further, additional test arguments may be
 * supplied after the name of the test. When the test function is invoked, the
 * value of the specified attribute of the current object from the iterable is
 * passed as the first argument to the test function, followed by all additional
 * arguments specified, if any.
 *
 * Although there is a built-in Nunjucks filter of the same name, it implements
 * only a 1-argument form, meaning that it always uses the `truthy` test
 * function described above. This is a drop-in replacement for the built-in
 * filter that also supports additional arguments, mimicking the
 * [Jinja selectattr filter](https://jinja.palletsprojects.com/en/2.11.x/templates/#selectattr).
 *
 * @example
 * {% set files = [{ type: "data" }, { type: "other" }] %}
 * {% set dataFiles = files | selectattr("type", "eq", "data") %}
 * {{ dataFiles === [{ type: "data" }] }}
 *
 * @param {Iterable.<Object>} objects - iterable of objects to filter
 * @param {string} attr - name of object attribute to test
 * @param {string} [test="truthy"] - name of test function to use, which must be
 *    the name of either a Nunjucks built-in test function, or a custom test
 *    function in current Nunjucks environment
 * @param  {...any} [testArgs] - additional arguments to pass to the test
 *    function, following the value of the object attribute
 * @returns {Object[]} an array of objects from the specified iterable where the
 *    test function returns true for the value of the specified attribute, or
 *    an empty array if the iterable is empty
 * @see {@link https://github.com/mozilla/nunjucks/blob/master/nunjucks/src/tests.js|Nunjucks Tests}
 */
function selectattr(objects, attr, test = "truthy", ...testArgs) {
  const testFn = this.env.getTest(test);

  // Spread `objects` into array so `objects` can be any type of iterable
  return [...objects].filter((obj) => testFn(obj[attr], ...testArgs));
}

module.exports = selectattr;
