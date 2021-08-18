"use strict";

const _ = require("lodash");
const get = require("lodash/get");
const pmap = require("p-map");
const { getJsonS3Object } = require("@cumulus/aws-client/S3");
const { sendSQSMessage } = require("@cumulus/aws-client/SQS");
const { buildQueueMessageFromTemplate } = require("@cumulus/message/Build");
const { buildExecutionArn } = require("@cumulus/message/Executions");
const { getWorkflowFileKey, templateKey } = require("@cumulus/common/workflows");

/**
 * Lambda Function handler to enqueue an SQS message on the specified queue
 * for each granule in the specified list of granules.
 *
 * @param {Object} event - Lambda event object
 * @param {Object[]} event.input.granules - list of granules to enqueue
 * @param {Object} [event.input.pdr] - optional PDR
 * @param {Object} event.config.collection - the parent collection of the granules
 * @param {string} event.config.queueUrl - URL of the queue to use
 * @param {string} event.config.stackName - name of the current stack
 * @param {string} event.config.granuleIngestWorkflow - name of the workflow to
 *    trigger to handle each message on the queue
 * @param {string} event.config.internalBucket - name of the bucket that holds
 *    the workflow template file of the specified `granuleIngestWorkflow`
 * @param {string} event.cumulus_config.state_machine -
 * @param {string} event.cumulus_config.execution_name -
 * @returns {Promise}
 */
async function queueGranules(event) {
  const { granules = [], pdr } = event.input;
  const {
    collection,
    granuleIngestWorkflow,
    internalBucket,
    provider,
    queueUrl,
    stackName,
    executionNamePrefix,
  } = event.config;

  const arn = buildExecutionArn(
    get(event, "cumulus_config.state_machine"),
    get(event, "cumulus_config.execution_name")
  );

  const enqueueGranuleIngestMessage = await buildEnqueueGranuleIngestMessageFunction({
    queueUrl,
    granuleIngestWorkflow,
    provider,
    collection,
    pdr,
    parentExecutionArn: arn,
    stack: stackName,
    systemBucket: internalBucket,
    executionNamePrefix,
  });

  console.log(`Enqueuing ${granules.length} granules`);

  const executionArns = await pmap(
    granules,
    enqueueGranuleIngestMessage,
    { concurrency: 16 },
  );

  return {
    running: executionArns,
    pdr,
  };
}

/**
 * Returns an async function to use to enqueue granules to be ingested.
 *
 * @param {Object} params
 * @param {string} params.queueUrl - the SQS queue to add the message to
 * @param {string} params.granuleIngestWorkflow - name of the workflow to use to
 *    ingest messages enqueued by the function returned by this function
 * @param {Object} params.provider - the provider config to be attached to the message
 * @param {Object} params.collection - the collection config to be attached to the
 *   message
 * @param {Object} [params.pdr] - an optional PDR to be configured in the message payload
 * @param {string} params.parentExecutionArn - parent workflow execution arn to add to
 *    the message
 * @returns {Promise<Function<Object, Promise<string>>>} a function that takes a
 *    granule object, enqueues it to the specified queue, and returns a Promise
 *    of the execution ARN for the current workflow
 */
async function buildEnqueueGranuleIngestMessageFunction({
  collection,
  granuleIngestWorkflow,
  parentExecutionArn,
  pdr,
  provider,
  stack,
  systemBucket,
  queueUrl,
  executionNamePrefix,
}) {
  const messageTemplate = await getJsonS3Object(systemBucket, templateKey(stack));
  const workflowKey = getWorkflowFileKey(stack, granuleIngestWorkflow)
  const { arn: ingestGranuleArn } = await getJsonS3Object(systemBucket, workflowKey);
  const workflow = {
    name: granuleIngestWorkflow,
    arn: ingestGranuleArn
  };

  return async function enqueueGranuleIngestMessage(granule) {
    const payload = {
      granules: [
        _.omit(granule, ["meta"])
      ]
    };
    const message = buildQueueMessageFromTemplate({
      messageTemplate,
      parentExecutionArn,
      payload,
      queueUrl,
      workflow,
      customMeta: {
        collection,
        provider,
        pdr,
        ...get(granule, "meta", {}),
      },
      executionNamePrefix,
    });

    const arn = buildExecutionArn(
      message.cumulus_meta.state_machine,
      message.cumulus_meta.execution_name
    );

    // TODO Refactor to leverage SQS.sendBatchMessage to batch 10 messages at
    // a time to improve speed and reduce cost
    await sendSQSMessage(queueUrl, message);

    return arn;
  }
}

module.exports = queueGranules;
