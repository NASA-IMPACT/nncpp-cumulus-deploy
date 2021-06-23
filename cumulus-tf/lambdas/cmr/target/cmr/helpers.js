module.exports.formatAddlAttrsForXML = (additionalAttributes) => {
  let updatedAttributes = Object.entries(additionalAttributes).map((entry) => {
    return {
      Name: entry[0],
      Values: [{
        Value: entry[1]
      }]
    }
  });
  return { AdditionalAttribute: updatedAttributes  };
};

module.exports.fileToDownload = (granule) => {
  const dataFile = granule.files.find(x => x.type === 'data');
  if (dataFile !== undefined) {
    return dataFile.filename;
  } else {
    throw new Error('No "data" file type listed for download.');
  }
}

const collectionModules = {
  'ATL08-003': {
    getPassNumber : (granule) => {
      const granuleFileName = granule.opsGranuleMetadata.DataGranule.Identifiers[0].Identifier;
      const pattern = /^ATL08_\d{14}_\d{4}(\d{2})\d{2}_003_\d{2}\.h5$/;
      return granuleFileName.match(pattern)[1];
    },
  }
}

module.exports.getValueFromGranuleFile = (path, granule) => {
  if (path === 'Pass Number') {
    const collectionFunctions = collectionModules[`${granule.collection.name}-${granule.collection.version}`];
    try {
      const passNumber = collectionFunctions.getPassNumber(granule);
      return passNumber;
    } catch(err) {
      throw new Error('Cannot find the pass number from the granule file.');
    }
  }
}
