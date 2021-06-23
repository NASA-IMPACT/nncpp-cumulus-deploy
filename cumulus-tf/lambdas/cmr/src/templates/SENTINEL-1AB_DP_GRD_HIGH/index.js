const Path = require("path");
const R = require("ramda");
const types = require("./types");

const SENTINEL_1AB_DP_GRD_HIGH = {
  resolve: (collection) =>
    R.propOr("", "name", collection).match(/^SENTINEL-1[AB]_DP_GRD_HIGH/) !== null,
  path: Path.join(__dirname, "SENTINEL-1AB_DP_GRD_HIGH.yml.njk"),
  createContext: require("./createContext"),
  types,
};

module.exports = SENTINEL_1AB_DP_GRD_HIGH;
