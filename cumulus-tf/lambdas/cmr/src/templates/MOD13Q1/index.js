const Path = require("path");
const R = require("ramda");

const createContext = require("./createContext");

module.exports = {
  resolve: (collection) =>
    R.propOr("", "name", collection).startsWith("MOD13Q1"),
  path: Path.join(__dirname, "MOD13Q1.yml.njk"),
  createContext,
};
