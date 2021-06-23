const Path = require("path");

const createContext = require("./createContext");

module.exports = {
  resolve: (collection) => !collection || !collection.name,
  path: Path.join(__dirname, "NASA_MAAP.yml.njk"),
  createContext,
};
