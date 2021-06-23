const I = require('iter-tools-es');
const R = require('ramda');

const oldS3URLRegex = /^s3:[/][/](cumulus-map-internal|maap-cumulus-dev-internal)[/]/;
const isOldS3URL = oldS3URLRegex.test.bind(oldS3URLRegex);
const anyUrlPointsToOldS3Bucket = R.pipe(
  R.propOr([], 'files'),
  R.any(R.propSatisfies(isOldS3URL, 'filename')),
);

/**
 * Returns an async iterator of all of the granules from the specified granules that
 * have a download URL that points to an old UAH S3 bucket.  Assumes that each granule
 * contains a `files` property with a single object that represents the "download URL"
 * for the granule, and the object has a `filename` property that is the URL.  All
 * granules that have no such `files` property (or no such element with a `filename`
 * property) are excluded from the returned iterator.
 *
 * @template {{ files: [{ filename: string }] }} T - a granule object
 * @param {{ granules: Iterable<T> | AsyncIterable<T> }} result - result of a discovery
 *    hanlder, which must contain a `granules` property that is an iterable (possibly
 *    async) of granules, each possibly containing a `files` property set to an array of
 *    file objects with a `filename` property that may point to an S3 bucket
 * @returns {AsyncIterator<T>} an async iterator of all of the granules from the
 *    specified granules that have a download URL that points to an old UAH S3 bucket
 */
function downloadURLsPointToOldS3Bucket({ granules }) {
  return I.asyncFilter(anyUrlPointsToOldS3Bucket, granules);
}

module.exports = downloadURLsPointToOldS3Bucket;
