const yaml = require("js-yaml");
const fs = require("fs");
const _ = require("lodash");
const CMR = require('./cmr');
const { formatAddlAttrsForXML, fileToDownload, getValueFromGranuleFile } = require("./helpers");
const { nowISOString } = require('./njk/globals')
const spatialParentPath = 'SpatialExtent.HorizontalSpatialDomain.Geometry.BoundingRectangles[0]';

const maapDefaultCollectionPaths = {
  BeginningDateTime: 'TemporalExtents[0].SingleDateTimes[0]',
  EndingDateTime: 'TemporalExtents[0].SingleDateTimes[1]',
  WestBoundingCoordinate: `${spatialParentPath}.WestBoundingCoordinate`,
  NorthBoundingCoordinate: `${spatialParentPath}.NorthBoundingCoordinate`,
  EastBoundingCoordinate: `${spatialParentPath}.EastBoundingCoordinate`,
  SouthBoundingCoordinate: `${spatialParentPath}.SouthBoundingCoordinate`
};

const opsDefaultGranulePaths = {
  SizeMBDataGranule: 'DataGranule.ArchiveAndDistributionInformation[0].Size',
  ProducerGranuleId: 'DataGranule.Identifiers[0].Identifier',
  InsertTime: 'ProviderDates[0].Date',
  LastUpdate: 'ProviderDates[1].Date',
  Temporal: 'TemporalExtent',
  AscendingCrossing: 'SpatialExtent.HorizontalSpatialDomain.Orbit.AscendingCrossing',
  StartLat: 'SpatialExtent.HorizontalSpatialDomain.Orbit.StartLatitude',
  StartDirection: 'SpatialExtent.HorizontalSpatialDomain.Orbit.StartDirection',
  EndLat: 'SpatialExtent.HorizontalSpatialDomain.Orbit.EndLatitude',
  EndDirection: 'SpatialExtent.HorizontalSpatialDomain.Orbit.EndDirection'
}

// Check if this granule's parent collection is a user-shared collection.
const isUserShared = (collection) => {
  if (!collection.AdditionalAttributes) return false;
  const collectionDatasetStatus = collection.AdditionalAttributes.find((c) => c.Name === 'Dataset Status').Value;
  return collectionDatasetStatus === 'MAAP User-Shared Data Product';
}

class GranuleMetadata {
  constructor({ collection, granule }) {
    this.collection = collection;
    this.granule = granule;
  }

  async build() {
    // fetch collection metadata
    this.opsCollectionMetadata = await CMR.findCollection(this.collection, "ops");
    this.maapCollectionMetadata = await CMR.findCollection(this.collection);
    const templateName = isUserShared(this.maapCollectionMetadata) ? 'USER_SHARED_TEMPLATE' : this.collection.name;
    this.template = yaml.safeLoad(
      fs.readFileSync(`${__dirname}/templates/${templateName}.yml`)
    );
    // fetch granule metadata
    this.opsGranuleMetadata = await CMR.findGranule({
      short_name: this.collection.name,
      granule_ur: this.granule.granuleId
    });
    if (this.opsGranuleMetadata) {
      this.opsGranuleMetadata.DataGranule.DayNightFlag = this.opsGranuleMetadata.DataGranule.DayNightFlag.toUpperCase();
    }
    const InsertTime = this.from_template('InsertTime');
    const LastUpdate = this.from_template('LastUpdate');
    // assign values
    this.metadata = {
      Granule: {
        GranuleUR: `${this.collection.name}.${this.granule.granuleId}`,
        InsertTime,
        LastUpdate,
        Collection: {
          ShortName: this.collection.name,
          VersionId: this.collection.version
        },
        DataGranule: {
          SizeMBDataGranule: this.from_template('DataGranule.SizeMBDataGranule'),
          ProducerGranuleId: this.from_template('DataGranule.ProducerGranuleId'),
          DayNightFlag: this.from_template('DataGranule.DayNightFlag'),
          ProductionDateTime: this.from_template('DataGranule.ProductionDateTime'),
        },
        Temporal: this.traverse(this.template.Temporal, "Temporal"),
        Spatial: this.traverse(this.template.Spatial, "Spatial"),
        AdditionalAttributes: formatAddlAttrsForXML(
          this.traverse(
            this.template.AdditionalAttributes,
            "AdditionalAttributes"
          )
        ),
        OnlineAccessURLs: {
          OnlineAccessURL: {
            URL: fileToDownload(this.granule),
            URLDescription: "File to download"
          }
        },
        OnlineResources: [],
        Orderable: true,
        DataFormat: this.from_template("DataFormat"),
        Visible: true
      }
    };
  }

  // helper functions for traversal
  traverse(x, path = "") {
    if (Array.isArray(x)) {
      this.traverseArray(x, path);
    } else if (typeof x === "object" && x !== null) {
      this.traverseObject(x, path);
    } else {
      // assign value or value from granule metadata or value from collection metadata
      return this.from_template(path);
    }
    return x;
  }

  traverseArray(arr, path) {
    arr.forEach(function(x, idx) {
      this.traverse(x, `${path}[${idx}]`);
    });
  }

  traverseObject(obj, path) {
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        obj[key] = this.traverse(obj[key], `${path}.${key}`);
      }
    }
  }

  from_template(template_path) {
    // TODO: This is potentally problematic if the static value that should be assigned includes a ','
    const [operation, custom_path] = _.get(this.template, template_path).split(
      ","
    );
    const childPath = _.last(template_path.split('.'));

    // Select a value from the granule in NASA Operational CMR
    if (operation === "_fromOpsGranule") {
      const defaultGranulePath = _.get(opsDefaultGranulePaths, childPath);
      return _.get(this.opsGranuleMetadata, custom_path || defaultGranulePath || template_path);
    }

    // Select a value from the collection metadata in MAAP CMR
    if (operation === "_fromMAAPCollection") {
      const defaultCollectionPath = _.get(maapDefaultCollectionPaths, childPath);
      return _.get(this.maapCollectionMetadata, custom_path || defaultCollectionPath || template_path);
    }

    // Select a value from the granule file
    if (operation === "_fromGranuleFile") {
      return getValueFromGranuleFile(childPath, this);
    }

    // Select a value from the granule file
    if (operation === "_Now") {
      return nowISOString();
    }

    if (operation === "_producerGranuleId") {
      return `${this.collection.name}.${this.granule.granuleId}`;
    };

    // Static value is the default
    return operation;
  }
}

module.exports = GranuleMetadata;
