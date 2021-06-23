const _ = require('lodash/fp');
const I = require('iter-tools-es');
const { discoverGranules } = require('@cumulus/discover-granules');

/**
 * Discovers granules by dispatching invocations to a configurable granule discovery
 * handler and a filter.
 *
 * A discovery hander is optional, but can be supplied on the specified event at the
 * path `config.meta.discoverGranulesHandler`.  If not supplied, the handler function
 * defaults to the `discoverGranules` function provided by the
 * `@cumulus/discover-granules` package.
 *
 * If a handler is specified, it must be a value that can be `require`d from this
 * module, and the `require`d value must be the desired handler function.  This means
 * that the handler function must be the default export of the `require`d module.
 *
 * A handler is expected to return an object with at least a `granules` property set to
 * an iterable (possibly an async iterable) of the discovered granules.
 *
 * Further, a discovery "filter" (also optional) may be supplied on the specified event
 * at the path `config.meta.discoverGranulesFilter`.  If supplied, it too must be a
 * value that can be `require`d from this module, and must be the default export.
 *
 * Such a filter must take accept 2 arguments: (a) the object returned by the handler,
 * and (b) optionally, the original AWS Lambda Function event that was also passed to
 * the handler, in case the filter requires access to any of the configuration values on
 * the event.  The filter must return an iterable (possibly an async iterable) of the
 * granules selected.
 *
 * Otherwise, if no filter is specified, all granules returned by the handler are
 * selected (considered "discovered").
 *
 * This dispatch function simply returns the result returned by the handler, but with
 * the value of the `granules` property filtered by the filter (if supplied), unless in
 * "dry run" mode, which is specified by setting a "truthy" value on the event at the
 * path `config.meta.dryRun`.  During a "dry run", the handler and filter (if supplied)
 * are still invoked, but this function returns an empty granules list to avoid queuing
 * the discovered granules.  This can be used to test a discovery handler and filter
 * without triggering further processing.
 *
 * @param {DiscoverGranulesEvent} event - AWS Lambda Function event
 * @param {*} context - AWS Lambda Function context object
 * @returns {Promise<{granules: Object[]}>} a Promise that resolves to an object
 *    containing at least a `granules` property with a value of the (possibly empty)
 *    array of granules discovered by the granule discovery handler and filtered by the
 *    discovery filter (if specified)
 */
async function dispatchDiscoverGranules(event, context) {
  try {
    const { dryRun, handler, filter } = parseEvent(event);
    const result = await handler(event, context);
    const granules = await I.execPipe(
      await filter(result, event),
      I.asyncBuffer(16),
      I.asyncToArray,
    );

    console.info(
      `${dryRun ? 'Would have d' : 'D'}iscovered %s granule%s%s`,
      granules.length || 'no',
      granules.length === 1 ? '' : 's',
      granules.length === 0 ? '' : ` (Example: ${JSON.stringify(granules[0])})`
    );

    return {
      ...result,
      granules: dryRun ? [] : granules,
    };
  } catch (error) {
    const stringifiedError = JSON.stringify(error);
    console.error(stringifiedError === '{}' ? error : stringifiedError);
    throw error;
  }
}

/**
 * Returns an object containing a `dryRun` flag, a `handler` function for discovering
 * granules, and a `filter` function for filtering granules, from the following paths
 * on the specified event object, respectively: `config.meta.dryRun`,
 * `config.meta.discoverGranulesHandler`, and `config.meta.discoverGranulesFilter`.
 *
 * @param {*} event - an AWS Lambda Function event
 * @returns {{dryRun: boolean, handler: Function, filter: Function}} an object
 *    containing a `dryRun` flag, a `handler` function for discovering granules, and a
 *    `filter` function for filtering granules
 */
function parseEvent(event) {
  const dryRun = _.path('config.meta.dryRun', event);
  const handlerRef = _.path('config.meta.discoverGranulesHandler', event);
  const filterRef = _.path('config.meta.discoverGranulesFilter', event);
  const handler = resolveFunction(handlerRef, discoverGranules);
  const filter = resolveFunction(filterRef, ({ granules = [] }) => granules);

  return { dryRun, handler, filter };
}

/**
 * Returns the function specified via the function specification.
 *
 * @param {string} functionSpec - a module path relative to the location of this
 *    function that this function will `require`, and the result must be a function
 *    (not an object)
 * @param {Function} [defaultFunction] - a function (optional) to use if the function
 *    spec is a falsy value
 * @returns {Function | undefined | never} the function specified by the spec (if not
 *    falsy), or the default function (if provided)
 * @throws if the given function spec either cannot be `require`d by this module
 *    (module not found), or the `require`d value is not a function
 */
function resolveFunction(functionSpec, defaultFunction) {
  const fn = functionSpec ? require(functionSpec) : defaultFunction;

  if (typeof fn !== 'function') {
    throw new Error(
      `'${functionSpec}' did not resolve to a function` +
      ` and the default value '${defaultFunction}' is not a function`
    );
  }

  return fn;
}

module.exports = Object.assign(dispatchDiscoverGranules, {
  dispatchDiscoverGranules,
  parseEvent,
  resolveFunction,
});
