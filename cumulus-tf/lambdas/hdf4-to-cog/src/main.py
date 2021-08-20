"""
    Downloads a MODIS13Q1/MYD13Q1 hdf4 file from s3, extracts specified bands, transforms
    to cloud optimized geotif format, and saves COG to s3. Expects CMA event message input and emits CMA event message.
"""
import os
import traceback
from subprocess import call

import boto3
import numpy as np
import rasterio
from rio_cogeo.cogeo import cog_translate, cog_validate
from rio_cogeo.profiles import cog_profiles

from run_cumulus_task import run_cumulus_task

# input schema
modis_vi_config = dict(
    variable_names=[
        "250m 16 days NDVI",
        # "250m 16 days relative azimuth angle",
        # "250m 16 days composite day of the year",
        # "250m 16 days pixel reliability",
        "250m 16 days EVI",
        # "250m 16 days VI Quality",
        "250m 16 days red reflectance",
        "250m 16 days NIR reflectance",
        "250m 16 days blue reflectance",
        "250m 16 days MIR reflectance"
        # "250m 16 days view zenith angle",
        # "250m 16 days sun zenith angle"
        ],
    tpl_dst="250m 16 days NDVI",
    twod_band_dims = [0,1],
    dtype = np.int16
)

# config
gdal_config = dict(GDAL_NUM_THREADS="ALL_CPUS", GDAL_TIFF_OVR_BLOCKSIZE="128")
output_profile = cog_profiles.get("deflate")
output_profile["blockxsize"] = 256
output_profile["blockysize"] = 256

rw_profile = dict(
    count=len(modis_vi_config["variable_names"]),
    dtype=modis_vi_config["dtype"],
    driver="GTiff"
)

def generate_and_upload_cog(granule):
    """
    Downloads granule hdf from S3, transforms specified variables/sub datasets to COG, 
    publishes back to same S3 staging area.

    @param granule: granule JSON object parsed from Cumulus Message Adapter event input

    @param file_staging_dir: string S3 object key pattern for staged hdf inputs and tif outputs. 
    """
    client = boto3.client("s3")

    file_meta = granule["files"][0]
    src_filename = file_meta["name"]
    temp_filename = f"/tmp/{src_filename}"
    file_staging_dir = file_meta["fileStagingDir"]
    src_key = f"{file_staging_dir}/{src_filename}"
    bucket = os.environ["BUCKET"]

    print(f"bucket={bucket} src_key={src_key} temp_filename={temp_filename} file_meta={file_meta}")

    output_s3_filename = src_filename.replace(".hdf", ".tif")
    output_s3_path = "/".join([
        file_staging_dir,
        output_s3_filename,
    ])

    client.download_file(
        Bucket=bucket,
        Key=src_key,
        Filename=temp_filename,
    )
    assert(os.path.exists(temp_filename))
    assert(".hdf" in temp_filename)

    output_filename = temp_filename.replace(".hdf", ".tif")

    print(f"Starting on filename={temp_filename} as {output_filename} size={os.path.getsize(temp_filename)}")

    # Just get the list of subdatasets to start, then open individual datasets 
    with rasterio.open(temp_filename) as src_dst:
        subdatasets = src_dst.subdatasets
        
    # Parse some default metadata for geotif generation
    # The same MODIS_Grid_16DAY_250m_500m_VI grid is shared for all subdatasets, use same grid props for all
    tpl_dst_name = next(src_dst_name for src_dst_name in subdatasets if src_dst_name.split(":")[-1]==modis_vi_config["tpl_dst"])
    with rasterio.open(tpl_dst_name) as tpl_dst:

        # Add metadata to rw_profile that will be used to read all datasets
        rw_profile["transform"] = tpl_dst.transform
        rw_profile["height"] = tpl_dst.height
        rw_profile["width"] = tpl_dst.width
        rw_profile["crs"] = tpl_dst.crs
        rw_profile["nodata"] = tpl_dst.nodata

    # Iterate over subdatasets and extract bands in modis_vi_config variable_names
    bands = []
    for idx, src_dst_name in enumerate(subdatasets):
        sub_dst_name = src_dst_name.split(":")[-1]

        if sub_dst_name in modis_vi_config.get("variable_names"):

            with rasterio.open(src_dst_name) as sub_dst:
                print(f"Reading subdataset={src_dst_name.split(':')[-1]}")
                # Read band array and scale if needed
                band_data = sub_dst.read(1)
                
                # Add band to output
                bands.append({
                    "name": sub_dst_name,
                    "data": band_data.astype(modis_vi_config["dtype"])
                })
               
        # End subdatasets

    if os.path.exists(temp_filename):
        os.remove(temp_filename)

    # Write to local
    with rasterio.open(output_filename, "w", **rw_profile) as outfile:

        print(f"rw_profile={rw_profile}")
        print(f"output_profile={output_profile}")

        for idx, band in enumerate(bands, 1):
            outfile.write(band["data"], idx)
            outfile.set_band_description(idx, band["name"])

        print(f"outfile.meta={outfile.meta}")

        cog_translate(
            outfile,
            output_filename,
            output_profile,
            config=gdal_config,
            overview_resampling="nearest",
            use_cog_driver=True
        ) 
        assert cog_validate(output_filename)[0]

        # Upload to S3
        client.upload_file(output_filename, bucket, output_s3_path)

    # Get the size of the COG `.tif`
    file_size = os.path.getsize(output_filename)
    file_created_time = os.path.getctime(output_filename)

    # TODO: is the created time format correct? 
    return {
        "path": f"/{output_s3_path}",
        "name": output_s3_filename,
        "size": file_size,
        "created": file_created_time,
        "bucket": bucket,
        "filename": f"s3://{bucket}/{output_s3_path}"
    }

def task(event, context):
    
    # cleanup /tmp
    call("rm -rf /tmp/*", shell=True)
    
    try:
        granule = event["input"]["granules"][0]
        granule["files"][0] = {
            **granule["files"][0],
            **generate_and_upload_cog(granule)
        }
        call("rm -rf /tmp/*", shell=True)
        return {
                "granules": [granule]
            }
    except Exception as e:
        traceback.print_exc()
        call("rm -rf /tmp/*", shell=True)
        raise Exception(f"Failed with exception={e}, see traceback")

def handler(event, context):
    return run_cumulus_task(task, event, context)
