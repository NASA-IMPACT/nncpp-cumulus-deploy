const Path = require("path");
const R = require("ramda");

const createContext = require("./createContext");

module.exports = {
  resolve: (collection) =>
    R.propOr("", "name", collection).startsWith("GEDI_CalVal_Lidar_Data"),
  path: Path.join(__dirname, "GEDI_CalVal_Lidar_Data.yml.njk"),
  createContext,
};
