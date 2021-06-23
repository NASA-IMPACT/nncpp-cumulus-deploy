const FS = require("fs");
const Path = require("path");

const endsWith = require("lodash/fp/endsWith");
const partition = require("lodash/fp/partition");
const test = require("ava");
const types = require("../src/types");
const YAML = require("js-yaml");

const CMR = require("../src/cmr");
const {
  generateGranuleMetadata,
  generateMetadataXml
} = require("../src/publishGranule");

function loadCollection(collection) {
  if (!collection || !collection.name || !collection.version) return;
  const { name, version } = collection;
  const path = Path.join(
    __dirname,
    "..",
    "..",
    "..",
    "..",
    "data",
    "collections"
  );

  try {
    return JSON.parse(FS.readFileSync(Path.join(path, `${name}.json`), "utf-8"));
  } catch {
    return JSON.parse(
      FS.readFileSync(Path.join(path, `${name}___${version}.json`), "utf-8")
    );
  }
}

function createDefaultEvent(ymlFile, { Granule }) {
  return {
    config: {
      collection: {
        name: Granule.Collection.ShortName,
        version: Granule.Collection.VersionId
      },
      downloadBucket: "download-bucket",
    },
    input: {
      granules: [
        {
          // Use the basename of the metadata fixture file as the granuleId, as
          // it may differ from the generated granuleId (e.g., for SRTMGL1_COD).
          granuleId: Path.basename(ymlFile, ".yml"),
          dataType: Granule.Collection.ShortName,
          version: Granule.Collection.VersionId,
          files: [
            {
              name: Granule.DataGranule.ProducerGranuleId,
              filename: "s3://file-location",
              type: "data",
              size: 0.1,
              created: "2020-01-01T00:00:00.000Z",
            }
          ]
        }
      ]
    }
  }
}

function filesInDir(...paths) {
  return FS
    .readdirSync(Path.join(...paths), { withFileTypes: true })
    .filter((file) => file.isFile())
    .map((file) => Path.join(...paths, file.name));
}

function granuleFixtures() {
  const files = filesInDir(__dirname, "fixtures", "metadata");
  const [ymlFiles, otherFiles] = partition(endsWith("yml"), files);
  const jsonFileFor = (ymlFile) =>
    otherFiles.find((file) => file === `${ymlFile.slice(0, -4)}.json`);

  return ymlFiles.map((ymlFile) => ({ ymlFile, jsonFile: jsonFileFor(ymlFile) }));
}

test.before(async (t) => {
  // Stub out Date.now() so we can test against fixed Date values, but set the
  // mocked value to the current date/time, as there are dependencies that use
  // Date.now(), but which fail when the value returned is not the current
  // date/time (within some tolerance).
  const now = Date.now();
  t.context.realDateNow = Date.now.bind(Date);
  Date.now = () => now;
});

test.after(async (t) => {
  // Restore original Date.now() function.
  Date.now = t.context.realDateNow;
});

granuleFixtures().map(({ ymlFile, jsonFile }) => {
  const granuleId = Path.basename(ymlFile, ".yml");

  test(
    `should generate and validate MAAP CMR metadata for granule ${granuleId}`,
    async (t) => {
      if (process.env.DATA_STORE_BUCKET !== 'nasa-maap-data-store') {
        t.pass();
      } else {
        const yml = FS.readFileSync(ymlFile, "utf8");
        const schema = YAML.Schema.create(types);
        const expectedMetadata = YAML.safeLoad(yml, { schema });
        const event = jsonFile
          ? JSON.parse(FS.readFileSync(jsonFile, "utf8"))
          : createDefaultEvent(ymlFile, expectedMetadata);
        const collection = loadCollection(event.config.collection);
        const granule = event.input.granules[0];
        const params = { ...event.config, collection, granule };
        const actualMetadata = await generateGranuleMetadata(params);

        t.deepEqual(actualMetadata, expectedMetadata);

        const { granuleUR, xml } =
          await generateMetadataXml(params);
        const response = await CMR.validateGranule(granuleUR, xml);

        t.is(granuleUR, expectedMetadata.Granule.GranuleUR);
        t.like(response, { status: 200, data: "" });
      }
    }
  )
});
