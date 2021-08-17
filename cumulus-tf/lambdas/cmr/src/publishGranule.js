'use strict';

const xml2js = require('xml2js');
const { defaultMetadata } = require('./defaultMetadata');
const CMR = require('./cmr');
const GranuleMetadata = require('./granuleMetadata');
const NJK = require("./njk");
const nunjucks = require("nunjucks");
const R = require("ramda");
const Templates = require("./templates");
const types = require('./types');
const YAML = require("js-yaml");

const generateGranuleMetadata = async (params) => {
  const { collection, granule } = params;
  // TODO: Migrate everything to use generateGranuleMetadataNG. For reference,
  // see how things are structured under src/templates/LVIS and also under
  // test/fixtures/metadata
  const metadata = await generateGranuleMetadataNG(params);
  if (metadata) return metadata;

  const granuleMetadata = new GranuleMetadata({ collection, granule });
  await granuleMetadata.build();
  return granuleMetadata.metadata;
}

/**
 * Generates the MAAP CMR metadata object for the specified granule that is part
 * of the specified collection.
 *
 * @param {*} params - collection and granule objects, and anything else set on
 *    the task_config
 * @returns {Object} MAAP CMR metadata object for the specified granule
 */
async function generateGranuleMetadataNG(params) {
  const { collection, meta } = params;
  const template = Templates.resolve(collection, meta);

  // TODO: Once everything is migrated to use this templating approach, throw
  // an exception when no template is found. (Alternatively, return an S.Left.)
  if (!template) return;

  const environmentOptions = { autoescape: false, throwOnUndefined: true };
  const createContext = template.createContext || createDefaultContext;
  const context = await createContext(params);
  const environment = NJK.extendEnvironment(nunjucks.configure(environmentOptions));
  const renderedYAML = environment.render(template.path, context);
  const schema = YAML.Schema.create(YAML.DEFAULT_FULL_SCHEMA,
    [...types, ...(template.types || [])]);

  return YAML.safeLoad(renderedYAML, { schema });
}

/**
 * Returns a context object for use with rendering a metadata template, which
 * includes the specified collection and granule objects, each with an added
 * `meta` property containing metatdata retrieved from both the NASA Operational
 * as well as the MAAP CMR.
 *
 * @example
 * {
 *   collection: {
 *     name: ...,
 *     version: ...,
 *     meta: {
 *       ops: {
 *         SpatialExtent: {
 *           ...
 *         },
 *         ...
 *       },
 *       maap: {
 *         ...,
 *       }
 *     }
 *   },
 *   granule: {
 *     granuleId: ...,
 *     meta: {
 *       ops: {
 *         DataGranule: {
 *           ...
 *         },
 *         ...,
 *       },
 *       maap: {
 *         ...,
 *       }
 *     }
 *   }
 * }
 * @param {{ collection, granule }} params - collection and granule objects
 * @returns {Object} context object for use with rendering a metadata template,
 *    which includes the specified collection and granule objects, each with
 *    an added `meta` property containing metatdata retrieved from the NASA
 *    Operational CMR (at `meta.ops`) as well as from the MAAP CMR (at
 *    `meta.maap`)
 */
async function createDefaultContext({ collection, granule }) {
  const collectionMetadata = {
    ops: await CMR.findCollection(collection, "ops"),
    maap: await CMR.findCollection(collection, "maap"),
  };
  const granuleSearchParams = CMR.buildGranuleSearchParams({ collection, granule });
  const granuleMetadata = {
    ops: await CMR.findGranule(granuleSearchParams, "ops"),
    maap: await CMR.findGranule(granuleSearchParams, "maap"),
  };

  return {
    collection: R.assoc("meta", collectionMetadata, collection),
    granule: R.assoc("meta", granuleMetadata, granule),
  }
}

/**
 * Generates ECHO-10 XML granule metadata.
 *
 * @returns {Promise<String>} granule metadata as an ECHO-10 XML string
 */
const generateMetadataXml = async (params) => {
  const metaObject = R.path(["meta", "userAdded"], params.collection)
    ? await defaultMetadata(params)
    : await generateGranuleMetadata(params);
  const metaXML = new xml2js.Builder({ cdata: true }).buildObject(metaObject);

  return {
    granuleUR: metaObject.Granule.GranuleUR,
    xml: metaXML,
  }
}

/**
 * Handler function for generating and publishing granule metadata.
 *
 * @returns {Promise<Object>} response body from CMR publish request
 */
const publishGranule = async (event) => {
  const granule = event.input.granules[0];
  const { granuleUR, xml } = await generateMetadataXml({ ...event.config, granule });

  // If CMR_DRY_RUN is set to a truthy value, DON'T publish.  Also, if it is
  // NOT set at all, it defaults to being "truthy".
  if ((process.env.CMR_DRY_RUN || "true").toLowerCase() === "true") {
    console.log(`Would publish granule '${granuleUR}'; but validating only: ${xml}`);
    await CMR.validateGranule(granuleUR, xml);
  } else {
    try {
      const response = await CMR.publishGranule(granuleUR, xml);
      granule.cmrLink = `${process.env.CMR_HOST}/search/concepts/${response.data["concept-id"]}.umm_json`;
    } catch (error) {
      // HACK: The "native ID" used to initially publish the metadata for a granule
      // might not be the same as the GranuleUR.  There are cases where the GranuleUR
      // is prefixed with the granule's data type (typically the parent collection's
      // name), plus a dot (`.`), but the "native ID" does NOT include the prefix.
      // Therefore, when we get a 409 response, we'll strip off the prefix from the
      // GranuleUR, if it is prefixed with the data type, and try publishing again.

      const prefix = `${granule.dataType}.`;

      if (
        R.pathEq(['response', 'status'], 409, error) &&
        granuleUR.startsWith(prefix)
      ) {
        // Conflict error, so try again, but with prefix removed
        console.log(`stripping prefix=${prefix} from granuleUR for publishGranule`);
        const response = await CMR.publishGranule(granuleUR.substring(prefix.length), xml);
        granule.cmrLink = `${process.env.CMR_HOST}/search/concepts/${response.data["concept-id"]}.umm_json`;
      } else {
        throw error;
      }
    }
  }

  // manually set published status
  granule.published = true;
  console.log(`granule=${granule}`)

  return { granules: [granule] };
};

module.exports = {
  publishGranule,
  generateGranuleMetadata,
  generateMetadataXml
}
