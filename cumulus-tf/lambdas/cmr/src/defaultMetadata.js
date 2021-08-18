const CMR = require('./cmr');
const { fileToDownload } = require('./helpers');

module.exports.defaultMetadata = async (args) => {
  const { collection, granule } = args;
  const collectionMetadata = await CMR.findCollection(collection, 'maap');
  const fileToDownloadUrl = fileToDownload(granule);
  const rangeDateTime = collectionMetadata.TemporalExtents[0].RangeDateTimes;

  const Spatial = collectionMetadata.SpatialExtent;
  // Because order matters ¯\_(ツ)_/¯. For some reason the order of a
  // collection's spatial metadata is in a different order than what is required
  // to validate the granule spatial metadata.
  const {
    WestBoundingCoordinate,
    EastBoundingCoordinate,
    NorthBoundingCoordinate,
    SouthBoundingCoordinate
  } = Spatial.HorizontalSpatialDomain.Geometry.BoundingRectangles[0];

  Spatial.HorizontalSpatialDomain.Geometry.BoundingRectangle = {
    WestBoundingCoordinate,
    NorthBoundingCoordinate,
    EastBoundingCoordinate,
    SouthBoundingCoordinate
  }

  // These key/values are reassigned for the purposes of publishing granule
  // metadata, which has a slightly different structure than collection metadata
  delete Spatial.HorizontalSpatialDomain.Geometry.BoundingRectangles;
  delete Spatial.SpatialCoverageType;
  delete Spatial.GranuleSpatialRepresentation;
  delete Spatial.HorizontalSpatialDomain.Geometry.CoordinateSystem;
  delete Spatial.HorizontalSpatialDomain.ResolutionAndCoordinateSystem;
  const now = new Date(Date.now()).toISOString();
  return {
    "Granule": {
      "GranuleUR": `${collection.name}.${granule.granuleId}`,
      // Todo - pull existing granule metadata from CMR in case we are updating an existing granule
      "InsertTime": now,
      "LastUpdate": now,
      "Collection": {
        "ShortName": collection.name,
        "VersionId": collection.version
      },
      "DataGranule": [],
      "Temporal": {
        "RangeDateTime": rangeDateTime
      },
      "Spatial": Spatial,
      "MeasuredParameters": [],
      "Platforms": [],
      "Campaigns": [],
      "Price": [],
      "AdditionalAttributes": [],
      "OnlineAccessURLs": {
        "OnlineAccessURL": {
          "URL": fileToDownloadUrl,
          "URLDescription": "File to download"
        }
      },
      "OnlineResources": [],
      "Orderable": "true",
      "DataFormat": "ASCII",
      "Visible": "true"
    }
  }
};
