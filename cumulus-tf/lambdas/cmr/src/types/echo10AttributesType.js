const yaml = require('js-yaml');

/**
 * Custom YAML type for simplifying listing of AdditionalAttributes within a
 * YAML file so that they are ECHO-10-compatible.
 *
 * @example
 * ```yaml
 * AdditionalAttributes: !echo10/attributes
 *   x: 1
 *   ys:
 *     - 10
 *     - 20
 * ```
 */
const echo10AttributesType = new yaml.Type('!echo10/attributes', {
  kind: 'mapping',
  resolve: resolveAdditionalAttributes,
  construct: constructAdditionalAttributes,
});

/**
 * Returns `true` iff the specified data is an object, but not an array, and
 * every value of the object is either a scalar value or an array of scalar
 * values.
 *
 * @param {*} data - value to resolve
 * @returns {boolean} `true` iff the specified value is an object and every
 *    value of the object is either a scalar value or an array of scalar values
 */
function resolveAdditionalAttributes(data) {
  return typeof data === 'object' &&
    !Array.isArray(data) &&
    Object
      .values(data)
      .every((value) => isScalar(value) || isArrayOfScalars(value));
}

/**
 * Returns an `AdditionalAttributes` object constructed from the specified
 * name-value mapping, making it ready for conversion to ECHO-10 XML format.
 * Attributes with a value of `"NA"` are excluded.
 *
 * @example
 * additionalAttributes({ x: 1, ys: [10, 20], z: "NA", na: ["NA"] })
 *
 * // Returns:
 * //
 * // {
 * //   AdditionalAttribute: [
 * //     {
 * //       Name: 'x',
 * //       Values: [
 * //         { Value: 1 }
 * //       ]
 * //     },
 * //     {
 * //       Name: 'ys',
 * //       Values: [
 * //         { Value: 10 },
 * //         { Value: 20 },
 * //       ]
 * //     },
 * //   ]
 * // }
 *
 * // Create (partial) object suitable for conversion to ECHO-10 XML
 * const attr = { AdditionalAttributes: additionalAttributes(...) };
 *
 * @param {Object} mapping - mapping of names to values, where a value may be
 *    either a single value or an array of values
 * @returns {Object} an `AdditionalAttributes` object constructed from the
 *    specified name-value pairs
 */
function constructAdditionalAttributes(mapping) {
  return {
    AdditionalAttribute: Object.entries(mapping)
      .filter(([, value]) => !isNA(value))
      .map(([name, value]) =>
      ({
        Name: name,
        Values: (Array.isArray(value) ? value : [value])
          .map((v) => ({ Value: v }))
      }))
  }
}

/**
 * Returns `true` if the specified value is a scalar (boolean, number, string)
 * value; `false` otherwise.
 *
 * @param {*} value - the value to check
 * @returns {boolean} `true` if the specified value is a scalar (boolean,
 *    number, string) value; `false` otherwise.
 */
function isScalar(value) {
  return ['boolean', 'number', 'string'].includes(typeof value);
}

/**
 * Returns `true` if the specified value is the string `"NA"`, or it is an
 * array that contains the string `"NA"`; `false` otherwise.
 *
 * @param {boolean | number | string | boolean[] | number[] | string[]} value -
 *    the value to check
 * @returns `true` if the specified value is the string `"NA"`, or it is an
 *    array that contains the string `"NA"`; `false` otherwise
 */
function isNA(value) {
  return value === "NA" || Array.isArray(value) && value.includes("NA");
}

/**
 * Returns `true` if the specified value is an array of scalar (boolean, number,
 * string) values; `false` otherwise.
 *
 * @param {*} value - the value to check
 * @returns {boolean} `true` if the specified value is an array of scalar
 *    (boolean, number, string) values; `false` otherwise.
 */
function isArrayOfScalars(value) {
  return Array.isArray(value) && value.every(isScalar);
}

module.exports = echo10AttributesType;
