require('dotenv-safe').config({
  example: process.env.DOTENV_CONFIG_EXAMPLE,
  path: process.env.DOTENV_CONFIG_PATH,
});

const path = require('path');
const fs = require('fs');
const isFunction = require('lodash/fp/isFunction');
const template = require('lodash/fp/template');

// --- BEGIN TODO
// Use the Cumulus API instead, to get rid of config.yml.
const { buildAndExecuteWorkflow } = require('@cumulus/integration-tests');
// --- END TODO
const Collections = require('@cumulus/api-client/collections');
const Providers = require('@cumulus/api-client/providers');

const stack = process.env.CUMULUS_STACK;
const bucket = process.env.BUCKET;
const buckets = {
  internal: {
    name: bucket,
    type: 'internal'
  }
};

const fetchCollection = ({ name, version }) =>
  Collections.getCollection({
    prefix: stack,
    collectionName: name,
    collectionVersion: version
  });

const fetchProvider = ({ id }) =>
  Providers
    .getProvider({ prefix: stack, providerId: id })
    .then((response) => JSON.parse(response.body));

/**
 * Returns the Lambda function with the specified name, if it is a non-default
 * export of one of the `index.js` files found in the Lambda subdirectories
 * of the `cumulus-tf/lambdas` directory.
 *
 * @param {string} - name of the Lambda function to find
 * @returns {function} the Lambda function with the specified name
 * @throws if no Lambda function with the specified name is found
 */
const findLambdaFunction = (name) => {
  const lambdasDir = path.join(__dirname, "../cumulus-tf/lambdas");
  const lambdaExports = fs.readdirSync(lambdasDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map(({ name }) => path.join(lambdasDir, name, "src", "index.js"))
    .filter(fs.existsSync)
    .map(require)
    .find((lambdaExports) => isFunction(lambdaExports[name]));

  if (!lambdaExports) {
    throw new Error(`No such Lambda function: ${name}`);
  }

  return lambdaExports[name];
};

/**
 * Returns an object parsed from the specified JSON template file.  The given
 * file should include a path relative to the root of the repository structure,
 * and the template file may contain references to environment variables.
 *
 * Such references are replaced by the values of the corresponding environment
 * variables.  A reference should be in the form `${VAR}`, where `VAR` is the
 * name of an environment variable.  The entire expression, including the dollar
 * sign and curly braces, will be replaced by the value of the variable.
 *
 * @param {string} - path of the JSON template file to read; which may be
 *    absolute or relative to the current directory
 * @returns {object} the object parsed from the JSON contained in the specified
 *    JSON template file, after environment variable substitution has been
 *    performed
 */
const generateInput = (templateFile) =>
  JSON.parse(template(fs.readFileSync(templateFile))(process.env));

/**
 * Runs either a Lambda function or a Workflow.
 */
const run = async () => {
  const args = process.argv;
  const awsService = args[2];
  const collectionName = args[3];
  const collectionVersion = args[4];
  const providerId = args[5];
  const input = args[7] ? generateInput(args[7]) : {};
  const collection = await fetchCollection({
    name: collectionName,
    version: collectionVersion
  });
  const provider = await fetchProvider({ id: providerId });

  if (awsService === 'lambda') {
    const lambdaName = args[6];
    const event = {
      config: { collection, buckets, provider, stack, downloadBucket: bucket },
      input,
    };
    const lambdaFunction = findLambdaFunction(lambdaName);

    return lambdaFunction(event);
  }

  if (awsService === 'workflow') {
    process.env.CollectionsTable = `${stack}-CollectionsTable`;
    process.env.ProvidersTable = `${stack}-ProvidersTable`;

    const workflowName = args[6];
    const workflowExecution = await buildAndExecuteWorkflow(
      stack, bucket, workflowName, collection, provider, input);
    return workflowExecution;
  }

  throw new Error(`Unsupported service: ${awsService}`);
}

run()
  .then(result => console.log(JSON.stringify(result, null, 2)))
  .catch(console.error);
