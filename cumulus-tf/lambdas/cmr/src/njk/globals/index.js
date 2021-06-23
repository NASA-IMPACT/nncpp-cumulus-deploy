/*
 * A name/function mapping to use as "globals" in a Nunjucks environment.
 */
module.exports = {
  /**
   * Returns the ISO string of the current time, as determined by `Date.now()`.
   */
  nowISOString: () =>
    // Although passing the result of Date.now() to the Date constructor behaves
    // the same as passing no value, using Date.now() allows us to stub it out
    // during test execution.
    new Date(Date.now()).toISOString(),
}
