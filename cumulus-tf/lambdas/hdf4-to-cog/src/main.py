"""
    Reads a hdf4 file from s3
    Converts it to cog
    Saves it to s3
"""
from re import sub
import boto3
import os
import time
import numpy as np
# from pyhdf.SD import SD, SDC
from affine import Affine
import rasterio
# from rasterio.crs import CRS
from rio_cogeo.cogeo import cog_translate, cog_validate
from rio_cogeo.profiles import cog_profiles
# from rasterio.warp import reproject, Resampling, calculate_default_transform

# import numpy as np

# from rasterio.io import MemoryFile
# from rio_cogeo.cogeo import cog_translate
# from rio_cogeo.profiles import cog_profiles

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
    Just try to open a s3 object here
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

    # Only run COG generation if the object doesn't already exist
    # TODO client.head_object() returns a 404 even when the object exists, check lambda processing role
    # try:
    #     client.head_object(Bucket=bucket, Key=dst_path)
    # except:
    # print(f"Object Key={dst_path} not found in Bucket={bucket}, attempting to download Key={src_path}/{src_filename} to Filename=tmp/{src_filename}")
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

    print(f"Starting on {filename} size={os.path.getsize(filename)}")

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

            print(f"Translating to COG")
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


    # TODO this needs to be the output file and file created in 3 dec second isoformat with timezone (UTC)
    # Get the size of the `.hdf` file
    file_size = os.path.getsize(output_filename)
    file_created_time = os.path.getctime(output_filename)

    # TODO don't forget to update return to agree with COG 
    # TODO try/except/finally remove hdf files for this granule from /tmp
    return {
        "path": f"/{output_s3_path}",
        "name": output_s3_filename,
        "size": file_size,
        "created": file_created_time,
        "bucket": bucket,
        "filename": f"s3://{bucket}/{output_s3_path}"
    }

def task(event, context):
    print(event)
    config = event["config"]
    # TODO fix this config input from upstream workflow
    print(config)
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
