const yaml = require("js-yaml");

/**
 * Custom YAML type for inserting the current date/time as an ISO 8601
 * formatted string.
 *
 * This is intended to be used in conjunction with mocking the `Date.now()`
 * method so that when the current date/time is inserted into generated
 * metadata, the _same_ (mocked) date/time value can be dynamically inserted
 * into the associated test metadata fixture file.  This ensures that the
 * actual and expected date/time values are equal.
 *
 * @example
 * ```yaml
 * Granule:
 *   GranuleUR: "AfriSAR_AGB_Maps.Mabounie_AGB_50m.tif"
 *   InsertTime: !iso8601/now
 *   ...
 * ```
 */
const iso8601Now = new yaml.Type("!iso8601/now", {
  kind: "scalar",
  resolve: () => true,
  construct: () => new Date(Date.now()).toISOString(),
});

module.exports = {
  iso8601Now,
};
