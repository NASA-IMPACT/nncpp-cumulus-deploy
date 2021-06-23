const Path = require("path");
const R = require("ramda");

const createContext = require("./createContext");

const GEDI_CalVal_Field_Data = {
  resolve: (collection) =>
    R.propOr("", "name", collection).startsWith("GEDI_CalVal_Field_Data"),
  path: Path.join(__dirname, "GEDI_CalVal_Field_Data.yml.njk"),
  types: [],
  createContext,
};

module.exports = GEDI_CalVal_Field_Data;
