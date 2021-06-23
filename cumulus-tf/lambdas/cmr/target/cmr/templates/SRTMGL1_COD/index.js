const Path = require("path");
const R = require("ramda");

const SRTMGL1_COD = {
  resolve: (collection) => R.propOr("", "name", collection).startsWith("SRTMGL1_COD"),
  path: Path.join(__dirname, "SRTMGL1_COD.yml.njk"),
  types: [],
};

module.exports = SRTMGL1_COD;
