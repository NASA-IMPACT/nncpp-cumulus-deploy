require('dotenv-safe').config({
  example: process.env.DOTENV_CONFIG_EXAMPLE,
  path: process.env.DOTENV_CONFIG_PATH,
});

import _ from "lodash/fp";
import { authorizer } from "./cumulus-api/edl";
import AWS from "aws-sdk";
import axios, { AxiosError, AxiosInstance } from "axios";
import fs from "fs";
import path from "path";
import { URL } from "url";

const rejectIfNil = (error: any) => (arg: any) =>
  arg == null ? Promise.reject(error) : arg;
const isFile = (dirent: fs.Dirent) => dirent.isFile();
const isDirectory = (dirent: fs.Dirent) => dirent.isDirectory();
const direntsIn = (dir: string) => fs.readdirSync(dir, { withFileTypes: true });
const dirNamesIn = _.pipe(direntsIn, _.filter(isDirectory), _.map(_.prop("name")!));
const fileNamesIn = _.pipe(direntsIn, _.filter(isFile), _.map(_.prop("name")!));
const absoluteFileIn = (dir: string) => (file: string) =>
  path.resolve(dir, file);
const readFile = (file: string) => fs.readFileSync(file, "utf8");
const isJsonFile = (fileName: string) => path.extname(fileName) === ".json";
const parseJson = (text: string) => JSON.parse(text);

const resourceId = (data: any) =>
  data.id ?? (data.version ? `${data.name}/${data.version}` : data.name);

const region = AWS.config.region;
const apiGateway = new AWS.APIGateway({ apiVersion: "2015-07-09" });
const getCumulusRestApiUrl = (stack: string) =>
  apiGateway
    .getRestApis({ limit: 500 })
    .promise()
    .then(_.prop("items"))
    .then(_.find(_.pipe(_.prop("name"), _.equals(`${stack}-archive`))))
    .then(rejectIfNil(`No REST API found for Cumulus stack '${stack}'`))
    .then(_.prop("id"))
    .then(id => `https://${id}.execute-api.${region}.amazonaws.com/dev`);

const buildError = (resource: string, error: AxiosError): Error => {
  if (!error.config) return error;

  const { method, baseURL, url } = error.config;
  const endpoint = `${method!.toUpperCase()} ${baseURL ?? ""}${url}`;
  const message = _.prop("response.data.message", error) ||
    (error.code === 'ENOTFOUND' ? "Your Cumulus API is not public" : "");
  const errorMessage = message ? `${endpoint}: ${message}` : endpoint;

  return new Error(`Failed to upsert ${resource}: ${error}: ${errorMessage}`);
};

/**
 *
 * @param api
 * @param endpoint
 */
const upsertResource = (api: AxiosInstance, endpoint: string) => async (
  data: any
) => {
  const resource = `${endpoint}/${resourceId(data)}`;

  try {
    // Assume the record already exists and attempt an update (replace).  This
    // is more efficient to try first because this will fail on only the first
    // attempt, since it will exist on all subsequent attempts.
    await api.put(resource, data);
    console.info(`Updated ${resource}`);
  } catch (putError) {
    // If the PUT did not cause a 404 (NotFound), then rethrow immediately
    // because not found would mean that the record doesn't exist yet.  Thus,
    // only when it doesn't exist (404) do we want to attempt create it (below).
    if (putError?.response?.status !== 404) {
      throw buildError(resource, putError);
    }

    try {
      await api.post(endpoint, data);
      console.info(`Inserted ${resource}`);
    } catch (postError) {
      throw buildError(resource, postError);
    }
  }
};

/**
 *
 * @param api
 */
const upsertResources = (api: AxiosInstance) => (dir: string) =>
  Promise.all(
    _.map(
      _.compose(
        upsertResource(api, path.basename(dir)),
        parseJson,
        readFile,
        absoluteFileIn(dir),
      ),
      _.filter(isJsonFile, fileNamesIn(dir))
    )
  );

/**
 *
 * @param stack
 */
const main = async (stack: string, dataDir: string) => {
  try {
    const restApiUrl = await getCumulusRestApiUrl(stack);
    const api = axios.create({ baseURL: new URL(restApiUrl).href });

    api.interceptors.request.use(authorizer());

    await Promise.all(
      _.map(
        _.compose(
          upsertResources(api),
          absoluteFileIn(dataDir)
        ),
        dirNamesIn(dataDir)
      )
    );
  } catch (e) {
    console.error();
    console.error(e);
    console.error();
    process.exit(1);
  }
};

if (require.main === module) {
  const dataDir = process.argv[2];

  if (!process.env.CUMULUS_STACK)
    throw new Error('Environment variable CUMULUS_STACK is not set.');

  if (!dataDir)
    throw new Error('First argument must be path to data directory.');

  main(process.env.CUMULUS_STACK, dataDir);
}
