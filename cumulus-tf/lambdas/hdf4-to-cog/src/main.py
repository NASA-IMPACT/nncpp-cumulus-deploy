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
config=dict(GDAL_NUM_THREADS="ALL_CPUS", GDAL_TIFF_OVR_BLOCKSIZE="128")
output_profile = cog_profiles.get("deflate")
output_profile["blockxsize"] = 256
output_profile["blockysize"] = 256
output_profile["count"] = len(modis_vi_config["variable_names"])
output_profile["dtype"] = modis_vi_config["dtype"]

def generate_and_upload_cog(granule, file_staging_dir):
    """
    Downloads granule hdf from #3, transforms specified variables/sub datasets to COG, 
    publishes back to same S3 staging area.

    @param granule: granule JSON object parsed from Cumulus Message Adapter event input

    @param file_staging_dir: string S3 object key pattern for staged hdf inputs and tif outputs. 
    """
    client = boto3.client("s3")

    file_meta = granule["files"][0]
    src_filename = file_meta["name"]
    src_path = file_meta["path"]

    bucket = os.environ['BUCKET']

    output_s3_filename = src_filename.replace(".hdf", ".tif")
    output_s3_path = "/".join([
        file_staging_dir,
        f"{granule['dataType']}___{granule['version']}",
        output_s3_filename,
    ])
    print(f"src_path={src_path} src_filename={src_filename}, output_filename={output_s3_filename}, bucket={bucket}")

    client.download_file(
        Bucket=bucket,
        Key=f"{src_path}/{src_filename}",
        Filename=f"/tmp/{src_filename}",
    )
    filename = f"/tmp/{src_filename}"
    assert(os.path.exists(filename))
    assert('.hdf' in filename)
    # TODO is the shared device tmp/ going to be a problem when processing many workflows?
    output_filename = filename.replace(".hdf", ".tif")

    print(f"Starting on filename={filename} size={os.path.getsize(filename)}")

    # Iterate over subdatasets and extract bands in modis_vi_config variable_names
    bands = []
    with rasterio.open(filename) as src_dst:
        for idx, src_dst_name in enumerate(src_dst.subdatasets):
            sub_dst_name = src_dst_name.split(":")[-1]
            if sub_dst_name in modis_vi_config.get("variable_names"):

                print(f"Extracting dataset={sub_dst_name} from hdf") 
                with rasterio.open(src_dst_name) as sub_dst:

                    # Extract some metadata for output profile 
                    sub_dst_meta = dict(
                        transform=sub_dst.transform,
                        height=sub_dst.height,
                        width=sub_dst.width,
                        crs=sub_dst.crs,
                        nodata=sub_dst.nodata
                    )

                    # Confirm that these metadata are consistent in output profile and add if this is the first dataset/band
                    for key in sub_dst_meta.keys():
                        if key in output_profile.keys():
                            assert(sub_dst_meta[key] == output_profile[key])
                        else:
                            output_profile[key] = sub_dst_meta[key]

                    # Read band array and scale if needed
                    band_data = sub_dst.read(1)
                    if len(sub_dst.scales):
                        scale_factor = sub_dst.scales[0]
                        band_data = np.where(band_data != output_profile["nodata"], band_data / scale_factor, sub_dst_meta["nodata"])
                    
                    # Add band to output
                    bands.append({
                        "name": sub_dst_name,
                        "data": band_data
                    })
        # End subdatasets

        # Write to local
        with rasterio.open(output_filename, 'w', **output_profile) as outfile:
            print(f"Writing {len(bands)} bands")
            for idx, band in enumerate(bands):
                outfile.write(band["data"], idx+1)
                outfile.set_band_description(idx + 1, band["name"])

            print(f"cog_translate config={config}")
            for k in output_profile.keys():
                print(f"cog_translate output_profile[{k}]={output_profile[k]}")
            cog_translate(
                outfile,
                output_filename,
                output_profile,
                config=config,
                overview_resampling="nearest",
                quiet=True
            ) 
            assert cog_validate(output_filename)

            # Upload to S3
            print(f"Uploading {output_s3_path}")
            client.upload_file(output_filename, bucket, output_s3_path)


    # TODO this needs to be the output file size and file created in 3 dec second isoformat with timezone (UTC)
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
    print(f"event: {event}")
    config = event["config"]
    config["stack"] = "nncpp-dev"
    
    file_staging_dir = "/".join([
        config.get("fileStagingDir", "file-staging"),
        config["stack"],
    ])
    granule = event["input"]["granules"][0]
    granule["files"][0] = {
        **granule["files"][0],
        **generate_and_upload_cog(granule, file_staging_dir)
    }

    return {
        "granules": [granule]
    }


def handler(event, context):
    return run_cumulus_task(task, event, context)
