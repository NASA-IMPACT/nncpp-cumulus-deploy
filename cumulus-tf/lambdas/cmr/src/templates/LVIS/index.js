const Path = require("path");
const R = require("ramda");
const types = require("./types");

const LVIS = {
  resolve: (collection) => R.propOr("", "name", collection).startsWith("LVIS"),
  path: Path.join(__dirname, "LVIS.yml.njk"),
  types,
};

module.exports = LVIS;
