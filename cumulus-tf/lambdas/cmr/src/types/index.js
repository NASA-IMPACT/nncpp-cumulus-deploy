const FS = require("fs");
const Path = require("path");
const R = require("ramda");
const YAML = require("js-yaml");

/**
 * Array of all custom YAML types exported by files within this directory, with
 * file names ending with `type.js` or `types.js` (case-insensitive).  Each such
 * file may export either a single `YAML.Type` or an object with values of type
 * `YAML.Type`.
 *
 * This is a convenience for importing types elsewhere without having to modify
 * imports when new types are added. When new types are added to this directory,
 * no code changes are required to use the new types, as the code here picks
 * them up automatically.
 *
 * @example
 * // baz-type.js
 * const YAML = require("js-yaml");
 *
 * const bazType = new YAML.Type(...);
 *
 * module.exports = bazType;
 *
 * // foobar-types.js
 * const YAML = require("js-yaml");
 *
 * const fooType = new YAML.Type(...);
 * const barType = new YAML.Type(...);
 *
 * module.exports = {
 *   fooType,
 *   barType,
 * };
 *
 * // some-client.js
 * const YAML = require("js-yaml");
 * const types = require("path/to/types"); // import all types automatically
 * const schema = YAML.Schema.create(YAML.DEFAULT_FULL_SCHEMA, types);
 *
 * @type YAML.Type[]
 */
const types =
  FS.readdirSync(__dirname, { withFileTypes: true })
    .filter((dirent) => dirent.isFile() && dirent.name.match(/types?.js$/i))
    .map((dirent) => require(Path.join(__dirname, dirent.name)))
    .flatMap(R.ifElse(R.is(YAML.Type), R.of, R.values))
    .filter(R.is(YAML.Type));

module.exports = Object.freeze(types);
