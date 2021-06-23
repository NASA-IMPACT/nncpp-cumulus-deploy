const FS = require("fs");
const Path = require("path");

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
  const { granuleId } = granule;
  const metadataCSV = FS.readFileSync(Path.join(__dirname, "metadata.csv"));
  const metadata = parse(metadataCSV, {
    columns: true,
    skipEmptyLines: true,
    trim: true,
  });
  const granuleMetadata = metadata.find(({ GranuleURPrefix }) =>
    granuleId.startsWith(GranuleURPrefix)
  );

  if (!granuleMetadata) throw new ReferenceError(`Unknown granule: ${granuleId}`);

  return {
    collection,
    granule: {
      ...granule,
      meta: {
        ...granuleMetadata,
        ...temporal(granuleId, granuleMetadata),
      }
    }
  };
}

function temporal(granuleId, granuleMetadata) {
  return (
    existingTemporal(granuleMetadata) ||
    classifiedTemporal(granuleId) ||
    unclassifiedTemporal(granuleId) ||
    undeterminedTemporal(granuleId)
  );
}

function existingTemporal(granuleMetadata) {
  const { BeginningDateTime, EndingDateTime } = granuleMetadata;

  if (BeginningDateTime && EndingDateTime) {
    return {
      BeginningDateTime,
      EndingDateTime,
    }
  }
}

function classifiedTemporal(granuleId) {
  const match = granuleId.match(/^(?<prefix>[^_]+_[^_]+)_(?<year>\d{4}).*/);

  if (match) {
    const { prefix, year } = match.groups;
    return lookupTemporal(prefix, year);
  }
}

function lookupTemporal(prefix, year) {
  const temporalCSV = FS.readFileSync(Path.join(__dirname, "temporal.csv"));
  const temporals = parse(temporalCSV, {
    columns: true,
    skipEmptyLines: true,
    trim: true,
  });
  const temporal = temporals.find(({ GranuleURPrefix, Year }) =>
    GranuleURPrefix === prefix && Year === year
  );

  if (temporal) {
    return {
      BeginningDateTime: temporal.BeginningDateTime,
      EndingDateTime: temporal.EndingDateTime,
    }
  }
}

function unclassifiedTemporal(granuleId) {
  const match = granuleId.match(
    /.*_(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})(?<hour>\d{2})_unclassified_.*/
  );

  if (match) {
    const { year, month, day, hour } = match.groups;

    return {
      BeginningDateTime: `${year}-${month}-${day}T${hour}:00:00Z`,
      EndingDateTime: `${year}-${month}-${day}T23:59:59Z`,
    }
  }
}

function undeterminedTemporal(granuleId) {
  throw new Error(`Cannot determine temporal values for granule: ${granuleId}`);
}

module.exports = createContext;
