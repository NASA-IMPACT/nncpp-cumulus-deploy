const test = require("ava");

const createContext = require(
  "../src/templates/GEDI_CalVal_Field_Data/createContext"
);

test("should create context for gedicalval_plotdata_australia_ausplotsforests_20200924_r03.csv",
  (t) => {
    const collection = { name: "foo", version: "001" };
    const granule = {
      granuleId: "gedicalval_plotdata_australia_ausplotsforests_20200924_r03.csv"
    };
    const actualContext = createContext({ collection, granule });
    const expectedContext = {
      collection,
      granule: {
        ...granule,
        meta: {
          AcquisitionType: "In Situ Field",
          BeginningDateTime: "2012-01-23T00:00:00Z",
          BreastHeight: "NA",
          BreastHeightMeasurementStatus: "FALSE",
          BreastHeightModeledStatus: "NA",
          DataFormat: "CSV",
          DatasetStatus: "MAAP Standard Data Product",
          DayNightFlag: "Unspecified",
          EastBoundingCoordinate: "155.7179351",
          EndingDateTime: "2015-02-04T23:59:59Z",
          Geolocated: "TRUE",
          GranuleUR: "gedicalval_plotdata_australia_ausplotsforests_20200924_r03.csv",
          MinimumDiameterMeasured: "0.1",
          NorthBoundingCoordinate: "-30.0833467",
          NumberOfPlots: "43",
          PFTMODIS: "Evergreen Broadleaf trees;Evergreen Needleleaf trees",
          PlotArea: "10",
          ProductionDateTime: "2020-09-24T12:00:00Z",
          SizeMBDataGranule: "0.501126289",
          SouthBoundingCoordinate: "-43.10310248",
          SpatialResolution: "10",
          StemMappedStatus: "TRUE",
          SubplotSize: "0.625",
          TreeHeightMeasurementStatus: "NA",
          WWFEcoregion: [
            "Eastern Australian temperate forests",
            "Southeast Australia temperate forests",
            "Tasmanian temperate forests",
            "Tasmanian temperate rain forests",
            "Tasmanian Central Highland forests",
            "Jarrah-Karri forest and shrublands"
          ].join(";"),
          WestBoundingCoordinate: "111.2892479",
        }
      }
    }

    t.deepEqual(actualContext, expectedContext);
  }
);
