const configFactory = require("../ava.config.cjs");

module.exports = ({ projectDir }) => ({
  ...configFactory({ projectDir })
});
