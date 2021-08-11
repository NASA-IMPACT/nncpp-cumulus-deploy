"""
    Downloads a MODIS13Q1/MYD13Q1 hdf4 file from s3, extracts specified bands, transforms
    to cloud optimized geotif format, and saves COG to s3. Expects CMA event message input and emits CMA event message.
"""
import os

import boto3
import numpy as np
import rasterio
from rio_cogeo.cogeo import cog_translate, cog_validate
from rio_cogeo.profiles import cog_profiles

from run_cumulus_task import run_cumulus_task

# input schema
modis_vi_config = dict(
    variable_names=["250m 16 days NDVI", "250m 16 days EVI"],
    twod_band_dims = [0,1],
    dtype=np.float32
)

# config
config = dict(GDAL_NUM_THREADS="ALL_CPUS", GDAL_TIFF_OVR_BLOCKSIZE="128")
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
    # sync granules adds a prefix to the key which is later interpreted as a directory, so remove it to name the temp file
    src_basename = src_filename.split("/")[1]
    temp_filename = f"/tmp/{src_basename}"
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

    print(f"Starting on filename={temp_filename} size={os.path.getsize(temp_filename)}")

    # Iterate over subdatasets and extract bands in modis_vi_config variable_names
    bands = []
    with rasterio.open(temp_filename) as src_dst:
        for idx, src_dst_name in enumerate(src_dst.subdatasets):
            sub_dst_name = src_dst_name.split(":")[-1]
            if sub_dst_name in modis_vi_config.get("variable_names"):

                with rasterio.open(src_dst_name) as sub_dst:

                    # Extract some metadata for r/w profile 
                    sub_dst_meta = dict(
                        transform=sub_dst.transform,
                        height=sub_dst.height,
                        width=sub_dst.width,
                        crs=sub_dst.crs,
                        nodata=sub_dst.nodata
                    )

                    # Confirm that these metadata are consistent in r/w profile and add if this is the first dataset/band
                    for key in sub_dst_meta.keys():
                        if key in rw_profile.keys():
                            assert(sub_dst_meta[key] == rw_profile[key])
                        else:
                            rw_profile[key] = sub_dst_meta[key]

                    # Read band array and scale if needed
                    band_data = sub_dst.read(1)
                    if len(sub_dst.scales):
                        scale_factor = sub_dst.scales[0]
                        band_data = np.where(band_data != sub_dst_meta["nodata"], band_data / scale_factor, sub_dst_meta["nodata"])
                    
                    # Add band to output
                    bands.append({
                        "name": sub_dst_name,
                        "data": band_data.astype(modis_vi_config["dtype"])
                    })
        # End subdatasets

        # Write to local
        with rasterio.open(output_filename, "w+", **rw_profile) as outfile:

            print(f"rw_profile={rw_profile}")
            print(f"output_profile={output_profile}")
 
            for idx, band in enumerate(bands):
                outfile.write(band["data"], idx+1)
                outfile.set_band_description(idx + 1, band["name"])

            print(f"outfile.meta={outfile.meta}")

            cog_translate(
                outfile,
                output_filename,
                output_profile,
                config=config,
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
    
    # TODO fix this config input from upstream workflow
    config = event["config"]
    config["stack"] = "nncpp-dev"
    
    granule = event["input"]["granules"][0]
    granule["files"][0] = {
        **granule["files"][0],
        **generate_and_upload_cog(granule)
    }

    return {
        "granules": [granule]
    }


def handler(event, context):
    return run_cumulus_task(task, event, context)
