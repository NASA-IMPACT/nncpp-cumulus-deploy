"use strict";

const CMA = require('@cumulus/cumulus-message-adapter-js');
const {{ cookiecutter.camelCaseFunctionName }} = require('./{{ cookiecutter.camelCaseFunctionName }}');

function {{ cookiecutter.camelCaseFunctionName }}Handler(event, context) {
  return CMA.runCumulusTask({{ cookiecutter.camelCaseFunctionName }}, event, context);
}

module.exports = {
  {{ cookiecutter.camelCaseFunctionName }}, // For scripts/run.js "discovery" only
  {{ cookiecutter.camelCaseFunctionName }}Handler,
};
