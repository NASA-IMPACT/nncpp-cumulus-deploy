const Path = require("path");
const R = require("ramda");
const types = require("./types");

const ATL08 = {
  resolve: (collection) => R.propOr("", "name", collection).startsWith("ATL08"),
  path: Path.join(__dirname, "ATL08.yml.njk"),
  types,
};

module.exports = ATL08;
