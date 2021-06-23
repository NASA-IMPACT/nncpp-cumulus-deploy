const { Environment } = require("nunjucks");

const filtersByName = require("./filters");
const globalsByName = require("./globals");
const testsByName = require("./tests");

function addFunctionsByName(add, functionsByName) {
  return Object.entries(functionsByName).reduce(
    (_, [name, fn]) => add(name, fn),
    undefined
  );
}

/**
 * Adds all custom filters defined in the `filters` module to the specified
 * Nunjucks environment.
 *
 * @param {Environment} env - Nunjucks environment to add custom filters to
 * @returns {Environment} the specified environment
 */
function addFilters(env) {
  return addFunctionsByName(env.addFilter.bind(env), filtersByName);
}

/**
 * Adds all custom globals defined in the `globals` module to the specified
 * Nunjucks environment.
 *
 * @param {Environment} env - Nunjucks environment to add custom globals to
 * @returns {Environment} the specified environment
 */
function addGlobals(env) {
  return addFunctionsByName(env.addGlobal.bind(env), globalsByName);
}

/**
 * Adds all custom tests defined in the `tests` module to the specified
 * Nunjucks environment.
 *
 * @param {Environment} env - Nunjucks environment to add custom tests to
 * @returns {Environment} the specified environment
 */
function addTests(env) {
  return addFunctionsByName(env.addTest.bind(env), testsByName);
}

/**
 * Adds all custom filters, globals, and tests to the specified Nunjucks environment.
 *
 * @param {Environment} env - Nunjucks environment to add custom tests to
 * @returns {Environment} the specified environment
 */
function extendEnvironment(env) {
  return addFilters(addGlobals(addTests(env)));
}

/**
 * Collection of helper functions for extending the functionality of a
 * Nunjucks environment.
 *
 * @example
 * const NJK = require("./NJK");
 * const env = nunjucks.configure({ ... });
 *
 * NJK.addFilters(env);
 * NJK.addGlobals(env);
 * NJK.addTests(env);
 *
 * // OR
 *
 * NJK.extendEnvironment(env);
 */
const NJK = {
  addFilters,
  addGlobals,
  addTests,
  extendEnvironment,
}

module.exports = NJK;
