const Path = require("path");
const R = require("ramda");

const createContext = require("./createContext");

module.exports = {
  resolve: (collection) =>
    R.propOr("", "name", collection).startsWith("{{ cookiecutter.collectionNamePrefix }}"),
  path: Path.join(__dirname, "{{ cookiecutter.collectionNamePrefix }}.yml.njk"),
  createContext,
};
