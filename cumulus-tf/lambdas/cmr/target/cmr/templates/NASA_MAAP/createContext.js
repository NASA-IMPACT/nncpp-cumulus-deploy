const _ = require("lodash");
const CMR = require("../../cmr");
const Path = require("path");
const R = require("ramda");
const S3 = require("@cumulus/aws-client/S3");

/**
 * Creates a Nunjucks "context" object for rendering granule metadata from the
 * corresponding Nunjucks template file.
 *
 * @param {Object} params - named parameters
 * @param {*} params.granule - minimal granule object for querying the MAAP CMR
 * @param {string} params.downloadBucket
 * @param {string} params.meta
 * @returns {Promise<{granule: {[property: string]: any}}>} Nunjucks template context
 */
async function createContext({
  granule,
  downloadBucket,
  meta,
  headObject = s3HeadObject
}) {
  const shortName = granule.dataType;
  const version = granule.version;
  const readableGranuleName = granule.granuleId;
  const params = { shortName, version, readableGranuleName };
  const metadata = await CMR.findGranule(params, "maap", "echo10");
  const { granuleDownloadURLTemplate } = meta;

  if (!metadata) {
    throw new ReferenceError(
      `Granule not found in MAAP CMR: ${JSON.stringify(params)}`
    );
  }

  return {
    granule: {
      ...metadata,
      // We're also inserting the Collection here because on some granules, the
      // Collection contains *only* an EntryTitle, which causes a publishing
      // error when someone has changed the title on the Collection itself.
      Collection: {
        ShortName: shortName,
        VersionId: version,
      },
      OnlineAccessURLs: await updatedOnlineAccessURLs(
        metadata,
        downloadBucket,
        granuleDownloadURLTemplate,
        headObject,
      ),
      OnlineResources: await updatedOnlineResources(
        metadata,
        downloadBucket,
        granuleDownloadURLTemplate,
        headObject,
      )
    }
  };
}

async function updatedOnlineAccessURLs(metadata, downloadBucket, template, headObject) {
  const toArray = R.pipe(R.propOr([], "OnlineAccessURL"), R.unless(R.is(Array), R.of));
  const onlineAccessURLs = toArray(metadata.OnlineAccessURLs);
  const isDownloadURL = R.propSatisfies(R.includes("download"), "URLDescription");
  const downloadURL = onlineAccessURLs.find(isDownloadURL);

  if (!downloadURL) {
    throw new Error(`Granule has no download URL: ${JSON.stringify(metadata)}`);
  }

  const updatedDownloadURL = updateDownloadURL(downloadURL, downloadBucket, template);
  const nonDownloadOnlineAccessURLs =
    onlineAccessURLs.filter(R.complement(isDownloadURL));

  await checkURLs(downloadURL.URL, updatedDownloadURL.URL, headObject);

  return {
    OnlineAccessURL: R.isEmpty(nonDownloadOnlineAccessURLs)
      ? updatedDownloadURL
      : [...nonDownloadOnlineAccessURLs, updatedDownloadURL]
  };
}

async function updatedOnlineResources(metadata, downloadBucket, template, headObject) {
  const toArray = R.pipe(R.propOr([], "OnlineResource"), R.unless(R.is(Array), R.of));
  const onlineResources = toArray(metadata.OnlineResources);
  const isDownloadURL = R.propSatisfies(R.includes("download"), "Description");
  const [
    downloadResources,
    nonDownloadResources
  ] = R.partition(isDownloadURL, onlineResources);
  const updatedDownloadResources = downloadResources.map(
    (downloadResource) => updateDownloadURL(downloadResource, downloadBucket, template)
  );
  const downloadResourcePairs = R.zip(downloadResources, updatedDownloadResources);
  const updatedOnlineResources = [...updatedDownloadResources, ...nonDownloadResources];

  await Promise.all(downloadResourcePairs.map(([resource, updatedResource]) =>
    checkURLs(resource.URL, updatedResource.URL, headObject)
  ));

  return {
    OnlineResource: updatedOnlineResources.length === 1
      ? updatedOnlineResources[0]
      : updatedOnlineResources
  };
}

function updateDownloadURL(downloadURL, downloadBucket, template) {
  const url = {
    href,
    origin,
    protocol,
    username,
    password,
    host,
    hostname,
    port,
    pathname,
    search,
    hash,
    dirname = Path.dirname(pathname),
    extname = Path.extname(pathname),
    basename = Path.basename(pathname, extname),
  } = new URL(downloadURL.URL);

  return {
    ...downloadURL,
    URL: _.template(template)({ downloadBucket, url }),
  }
}

async function checkURLs(oldURL, newURL, headObject) {
  const { ETag: oldETag } = await headObject(oldURL);
  const { ETag: newETag, LastModified: lastModified } = await headObject(newURL);
  const ageSeconds = (Date.now() - lastModified.getTime()) / 1000;

  // If the ETags don't match, it could be because SyncGranule just copied the
  // file via MultipartUpload, which will NOT produce the same ETag.  Therefore,
  // fallback to checking the lastModified time.  If it's more than a minute
  // ago (arbitrary), assume SyncGranule did NOT do the copying, and thus, the
  // mismatched ETags indeed represents an error.
  if (newETag !== oldETag && ageSeconds > 60) {
    throw new Error(
      `ETag of ${newURL} (${newETag}) does not match ETag of ${oldURL} (${oldETag})`
    );
  }
}

async function s3HeadObject(url) {
  const { Bucket: bucket, Key: key } = S3.parseS3Uri(url);
  return S3.headObject(bucket, key);
}

module.exports = createContext;
