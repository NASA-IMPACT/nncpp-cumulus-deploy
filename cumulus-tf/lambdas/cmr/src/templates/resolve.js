const FS = require("fs");
const Path = require("path");
const R = require("ramda");

/**
 * List of "template" objects, each providing a metadata template file for a
 * specific collection "group". For example, "LVIS" group encompasses the
 * "LVISF1B" and "LVISF2" collections, and thus the templates/LVIS directory
 * contains the metadata template applicable to those collections.
 */
const templates = FS.readdirSync(__dirname, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => ({
    name: dirent.name,
    template: require(Path.join(__dirname, dirent.name))
  }));

/**
 * Returns the template object applicable to the specified collection, or
 * `undefined` if no such template was resolved.
 *
 * @param {{ name, version }} collection - collection object with a name and
 *    version property
 * @returns {{ resolve, path, types, [createContext] }} the template object
 *    applicable to the specified collection, or `undefined` if no such template
 *    was resolved
 */
function resolve(collection, meta = {}) {
  const predicate = meta.granuleMetadataTemplateName
    ? R.propEq("name", meta.granuleMetadataTemplateName)
    : ({ template }) => template.resolve(collection, meta);
  // TODO: consider returning S.Maybe
  const { template } = templates.find(predicate) || {};

  return template;
}

module.exports = resolve;
