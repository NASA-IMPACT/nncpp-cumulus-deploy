const CMA = require("@cumulus/cumulus-message-adapter-js");
const discoverGranulesCmr = require("./discoverGranulesCmr");
const dispatchDiscoverGranules = require("./dispatchDiscoverGranules");
const { publishGranule, generateAndSaveGranuleMetadata } = require("./publishGranule");

const dispatchDiscoverGranulesHandler = (event, context) =>
  CMA.runCumulusTask(dispatchDiscoverGranules, event, context);

const discoverGranulesCmrHandler = (event, context) =>
  CMA.runCumulusTask(discoverGranulesCmr, event, context);

const publishGranuleHandler = (event, context) =>
  CMA.runCumulusTask(publishGranule, event, context);

const generateAndSaveGranuleMetadataHandler = (event, context) =>
  CMA.runCumulusTask(generateAndSaveGranuleMetadata, event, context);

module.exports = {
  discoverGranulesCmr, // For scripts/run.js "discovery" only
  discoverGranulesCmrHandler,
  dispatchDiscoverGranulesHandler,
  publishGranule, // For scripts/run.js "discovery" only
  publishGranuleHandler,
  generateAndSaveGranuleMetadataHandler
};
