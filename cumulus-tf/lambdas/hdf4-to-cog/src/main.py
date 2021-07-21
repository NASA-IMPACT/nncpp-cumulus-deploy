"""
    Reads a hdf4 file from s3
    Converts it to cog
    Saves it to s3
"""
import boto3
import io
import os
import re
import time
# from pyhdf.SD import SD, SDC
from affine import Affine
# import rasterio
# from rasterio.crs import CRS
# from rio_cogeo.cogeo import cog_translate
# from rio_cogeo.profiles import cog_profiles
# from rasterio.warp import reproject, Resampling, calculate_default_transform

# import numpy as np

# from rasterio.io import MemoryFile
# from rio_cogeo.cogeo import cog_translate
# from rio_cogeo.profiles import cog_profiles

from run_cumulus_task import run_cumulus_task

def generate_and_upload_cog(granule, file_staging_dir):
    """
    Just try to open a s3 object herre
    """
    client = boto3.client("s3")

    file_meta = granule["files"][0]
    src_filename = file_meta["name"]
    src_path = file_meta["path"]

    bucket = os.environ['BUCKET']

    dst_filename = src_filename.replace(".hdf", ".tif")
    dst_path = "/".join([
        file_staging_dir,
        f"{granule['dataType']}___{granule['version']}",
        dst_filename,
    ])

    print(f'src_path={src_path} src_filename={src_filename}, dst_filename={dst_filename}, bucket={bucket}')

    # Only run COG generation if the object doesn't already exist
    # TODO client.head_object() returns a 404 even when the object exists, check lambda processing role
    try:
        client.head_object(Bucket=bucket, Key=dst_path)
    except:
        print(f"Object Key={dst_path} not found in Bucket={bucket}, attempting to download Key={src_path}/{src_filename} to Filename=tmp/{src_filename}")
        client.download_file(
            Bucket=bucket,
            Key=f"{src_path}/{src_filename}",
            Filename=f"/tmp/{src_filename}",
        )
        filename = f"/tmp/{src_filename}"

        # config = collection_configs["VI"]
        # print(f"config: {config}")
        # print(f"Starting on {filename}")  
        if os.path.exists(filename):
            print(f"Starting on {filename} size={os.path.getsize(filename)}")  

        # Get the size of the `.hdf` file
        # file_metadata = client.head_object(Bucket=bucket, Key=src_path)
        # file_size = file_metadata['ContentLength'] / 1000000
        # file_created_time = f"{file_metadata['LastModified'].isoformat().replace('+00:00', '.000Z')}" 

        print({
            "path": f"/{src_path}",
            "name": src_filename,
            "size": os.path.getsize(filename),
            "created": os.path.getctime(filename),
            "bucket": bucket,
            "filename": f"s3://{bucket}/{dst_path}"
        })

    # TODO don't forget to update return to agree with COG 
    # TODO try/except/finally remove hdf files for this granule from /tmp
    return {
        "path": f"/{dst_path}",
        "name": src_filename,
        "size": os.path.getsize(filename),
        "created": os.path.getctime(filename),
        "bucket": bucket,
        "filename": f"s3://{bucket}/{dst_path}"
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
