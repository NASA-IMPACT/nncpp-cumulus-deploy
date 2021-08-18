"use strict";

const CMA = require('@cumulus/cumulus-message-adapter-js');
const queueGranules = require('./queueGranules');

function queueGranulesHandler(event, context) {
  return CMA.runCumulusTask(queueGranules, event, context);
}

module.exports = {
  queueGranules, // For scripts/run.js "discovery" only
  queueGranulesHandler,
};
