const FS = require("fs");
const path = require("path");

const parse = require("csv-parse/lib/sync");

/**
 * Creates a Nunjucks "context" object for rendering granule metadata from the
 * corresponding Nunjucks template file.  Looks up the specified granule's
 * metadata from the `metadata.csv` file using the granule's `granuleId`, and
 * places it at the path `granule.meta` in the returned context object.  No
 * collection metadata is included.  The specified collection and granule
 * objects are included in the output context object under the property names
 * `collection` and `granule`, respectively.
 *
 * @param {Object} kwargs - keyword arguments
 * @param {{name, version}} kwargs.collection - collection object
 * @param {{granuleId}} kwargs.granule - granule object
 * @returns {Object} Nunjucks template context
 * @throws {ReferenceError} if the specified granule is not found in the
 *    metadata file
 */
function createContext({ collection, granule }) {
  const metadataCSV = FS.readFileSync(path.join(__dirname, "metadata.csv"));
  const metadata = parse(metadataCSV, { columns: true, skipEmptyLines: true });
  const { granuleId } = granule;
  const meta = metadata.find(({ GranuleUR }) => GranuleUR === granuleId);

  if (!meta) throw new ReferenceError(`Unknown granule: ${granuleId}`);

  return { collection, granule: { ...granule, meta } };
}

module.exports = createContext;
