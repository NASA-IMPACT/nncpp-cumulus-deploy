const FS = require('fs');
const Path = require('path');

/**
 * List of all custom YAML types defined within `*Type.js` files within this
 * `types` directory. This is a convenience for importing types elsewhere
 * without having to modify imports when new types are added.
 *
 * For example, this easily enables creating a YAML schema that includes all of
 * the custom YAML types in this directory:
 *
 * ```javascript
 * const types = require("path/to/types");
 * const schema = YAML.Schema.create(YAML.DEFAULT_FULL_SCHEMA, types);
 * ```
 *
 * When new types are added, the example code above would not need to change,
 * and the new types would be picked up automatically.
 */
const types = FS.readdirSync(__dirname, { withFileTypes: true })
  .filter((dirent) => dirent.isFile() && dirent.name.endsWith('Type.js'))
  .map((dirent) => require(Path.join(__dirname, dirent.name)));

module.exports = Object.freeze(types);
