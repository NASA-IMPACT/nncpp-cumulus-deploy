'use strict';

const test = require("ava");
const nock = require('nock');
const createContext = require("../src/templates/NASA_MAAP/createContext");

const xml = `
  <?xml version="1.0" encoding="UTF-8"?>
  <results>
    <result>
      <Granule>
        <GranuleUR>N22W090.SRTMGL1.tif</GranuleUR>
        <Collection>
          <ShortName>SRTMGL1_COD</ShortName>
          <VersionId>001</VersionId>
        </Collection>
        <OnlineAccessURLs>
          <OnlineAccessURL>
            <URL>s3://nasa-maap-data-store/file-staging/nasa-map/SRTMGL1_COD___001/N22W090.SRTMGL1.tif</URL>
            <URLDescription>This file may be downloaded directly from this link</URLDescription>
            <MimeType>image/tiff</MimeType>
          </OnlineAccessURL>
        </OnlineAccessURLs>
        <OnlineResources>
          <OnlineResource>
            <URL>s3://cumulus-map-internal/file-staging/nasa-map/SRTMGL1_COD___001/N22W090.SRTMGL1.tif</URL>
            <Description>This Browse file may be downloaded directly from this link</Description>
            <Type>BROWSE</Type>
            <MimeType>image/tiff</MimeType>
          </OnlineResource>
          <OnlineResource>
            <URL>https://api.maap.xyz/api/wmts/GetCapabilities?granule_ur=N22W090.SRTMGL1.tif</URL>
            <Description>WMTS GetCapabilities Resource (VisualizationURL)</Description>
            <Type>EXTENDED METADATA</Type>
            <MimeType>text/plain</MimeType>
          </OnlineResource>
        </OnlineResources>
      </Granule>
    </result>
  </results>
`;

test.before(async (t) => {
  nock.disableNetConnect();

  t.context = {
    basePath: `https://${process.env.CMR_HOST}`,
    replyBody: xml,
    granule: {
      granuleId: "N22W090.SRTMGL1.tif",
      dataType: "SRTMGL1_COD",
      version: "001",
    },
    downloadBucket: "a-bucket",
    meta: {
      granuleDownloadURLTemplate: "s3://${downloadBucket}${url.pathname}",
    },
  };
});

test.after(async (t) => {
  nock.cleanAll();
  nock.enableNetConnect();
});

test("should update bucket name in granule download URLs when ETags match", async (t) => {
  const { granule, downloadBucket, meta, replyBody } = t.context;
  const scope = nock(t.context.basePath)
    .get(new RegExp('/search/granules.*'))
    .reply(200, replyBody, { 'cmr-hits': 1 });

  const params = {
    granule,
    downloadBucket,
    meta,
    headObject: () => ({ ETag: 'foo', LastModified: new Date(0) }),
  };

  const expectedOutputSelector = {
    granule: {
      Collection: {
        ShortName: 'SRTMGL1_COD',
        VersionId: '001',
      },
      GranuleUR: 'N22W090.SRTMGL1.tif',
      OnlineAccessURLs: {
        OnlineAccessURL: {
          URL: `s3://${downloadBucket}/file-staging/nasa-map/SRTMGL1_COD___001/N22W090.SRTMGL1.tif`,
        },
      },
      OnlineResources: {
        OnlineResource: [
          {
            URL: `s3://${downloadBucket}/file-staging/nasa-map/SRTMGL1_COD___001/N22W090.SRTMGL1.tif`,
            Description: 'This Browse file may be downloaded directly from this link',
            Type: 'BROWSE',
            MimeType: 'image/tiff',
          },
          {
            URL: 'https://api.maap.xyz/api/wmts/GetCapabilities?granule_ur=N22W090.SRTMGL1.tif',
            Description: 'WMTS GetCapabilities Resource (VisualizationURL)',
            Type: 'EXTENDED METADATA',
            MimeType: 'text/plain',
          }
        ]
      },
    }
  };

  try {
    const actualOutput = await createContext(params);

    t.like(actualOutput, expectedOutputSelector);
  } finally {
    scope.done();
  }
});

test("should update bucket name in granule download URLs when ETags do not match, but last modified times are close", async (t) => {
  const { granule, downloadBucket, meta, replyBody } = t.context;
  const scope = nock(t.context.basePath)
    .get(new RegExp('/search/granules.*'))
    .reply(200, replyBody, { 'cmr-hits': 1 });

  const params = {
    granule,
    downloadBucket,
    meta,
    headObject: (url) => ({ ETag: url, LastModified: new Date(Date.now()) }),
  };

  const expectedOutputSelector = {
    granule: {
      Collection: {
        ShortName: 'SRTMGL1_COD',
        VersionId: '001',
      },
      GranuleUR: 'N22W090.SRTMGL1.tif',
      OnlineAccessURLs: {
        OnlineAccessURL: {
          URL: `s3://${downloadBucket}/file-staging/nasa-map/SRTMGL1_COD___001/N22W090.SRTMGL1.tif`,
        },
      },
      OnlineResources: {
        OnlineResource: [
          {
            URL: `s3://${downloadBucket}/file-staging/nasa-map/SRTMGL1_COD___001/N22W090.SRTMGL1.tif`,
            Description: 'This Browse file may be downloaded directly from this link',
            Type: 'BROWSE',
            MimeType: 'image/tiff',
          },
          {
            URL: 'https://api.maap.xyz/api/wmts/GetCapabilities?granule_ur=N22W090.SRTMGL1.tif',
            Description: 'WMTS GetCapabilities Resource (VisualizationURL)',
            Type: 'EXTENDED METADATA',
            MimeType: 'text/plain',
          }
        ]
      },
    }
  };

  try {
    const actualOutput = await createContext(params);
    t.like(actualOutput, expectedOutputSelector);
  } finally {
    scope.done();
  }
});

test("should throw when ETags do not match", async (t) => {
  const { granule, downloadBucket, meta, replyBody } = t.context;
  const scope = nock(t.context.basePath)
    .get(new RegExp('/search/granules.*'))
    .reply(200, replyBody, { 'cmr-hits': 1 });

  const params = {
    granule,
    downloadBucket,
    meta,
    headObject: (url) => ({ ETag: url, LastModified: new Date(0) }),
  };

  try {
    await t.throwsAsync(createContext(params), { message: /match/ });
  } finally {
    scope.done();
  }
});
