"""
    Downloads a MODIS13Q1/MYD13Q1 hdf4 file from s3, extracts specified bands, transforms
    to cloud optimized geotif format, and saves COG to s3. Expects CMA event message input and emits CMA event message.
"""
import os
import traceback
import hashlib
from subprocess import call
from functools import partial

import boto3
from boto3.s3.transfer import TransferConfig
from botocore.exceptions import ClientError
import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.io import MemoryFile
from rio_cogeo.cogeo import cog_translate, cog_validate
from rio_cogeo.profiles import cog_profiles
from rio_cogeo.utils import get_maximum_overview_level

from run_cumulus_task import run_cumulus_task

# Default part size for transfer config and etag computation
# https://boto3.amazonaws.com/v1/documentation/api/1.9.46/reference/customizations/s3.html#boto3.s3.transfer.TransferConfig 
MB = 1024 * 1024
DEFAULT_CHUNKSIZE = 8 * MB

def md5_digest(filename):
    """
    Returns the MD5 digest for the given filename.

    Parameters
    ----------
    filename : str, Full filename including path of local file    
    """
    MB = 1024 * 1024
    md5_hash = hashlib.md5()
    with open(filename, "rb") as f:
        for data in iter(lambda: f.read(MB), b""):
            md5_hash.update(data)

    return md5_hash.hexdigest()

def md5_digest_memfile(memfile):
    """
    Returns the MD5 digest for the given filename.

    Parameters
    ----------
    memfile : MemoryFile(), rasterio.io memory file object      
    """
    MB = 1024 * 1024
    # Rewind
    memfile.seek(0)

    md5_hash = hashlib.md5()
    for block in iter(partial(memfile.read, MB), b""):
        md5_hash.update(block)
    
    memfile.seek(0)
    return md5_hash.hexdigest()

def get_s3_obj_etag(s3_head_obj):
    """
    Returns the S3 object ETag.

    Parameters
    ----------
    s3_head_obj : dict, response from aws client head object request
    """
    return s3_head_obj["ETag"].strip('"')

def get_s3_obj_md5(s3_head_obj):
    """
    Returns the S3 object md5 from uploaded metadata if it exists.

    Parameters
    ----------
    s3_head_obj : dict, response from aws client head object request
    """
    metadata = s3_head_obj["Metadata"]
    return metadata["md5"].strip('"')

def etag_is_multipart(s3_etag):
    """
    Parse S3 ETag to find if a multi-part upload was used. Returns T/F.

    Parameters
    ----------
    s3_etag : str, ETag of S3 object
    """
    return len(s3_etag.split("-")) > 1

def compute_file_etag(filename, part_size):
    """
    Returns the expected ETag for a given filename when it is uploaded to S3; for mulitpart file uploads this is not the MD5 digest.
    See 
    - https://docs.aws.amazon.com/AmazonS3/latest/API/API_Object.html
    - https://forums.aws.amazon.com/thread.jspa?messageID=456442
    - https://stackoverflow.com/a/58239738

    Parameters
    ----------
    filename : str, Full filename including path of local file   

    part_size : int, size of each chunk of an S3 multipart upload. 
    """
    print(f"Computing {filename} etag using part_size={part_size}")
  
    # If file size is smaller than chunksize, mulitpart uploads not triggered and ETags are MD5 digests 
    if os.path.getsize(filename) <= part_size:
        print(f"File size={os.path.getsize(filename)} is smaller than part_size={part_size}, use simple md5 digest")
        return md5_digest(filename)

    # If mulitpart upload, concatenate md5s and append with chunk count
    md5_hashs = []
    with open(filename, "rb") as f:
        for data in iter(lambda: f.read(part_size), b""):
            md5_hashs.append(hashlib.md5(data).digest())
    md5_hash = hashlib.md5(b"".join(md5_hashs))
    return f"{md5_hash.hexdigest()}-{len(md5_hashs)}"

def compute_memfile_etag(memfile, part_size):
    """
    Returns the expected ETag for a given rasterio.io MemoryFile() when it is uploaded to S3; for mulitpart file uploads this is not the MD5 digest.
    See 
    - https://docs.aws.amazon.com/AmazonS3/latest/API/API_Object.html
    - https://forums.aws.amazon.com/thread.jspa?messageID=456442
    - https://stackoverflow.com/a/58239738

    Parameters
    ----------
    memfile : MemoryFile(), rasterio.io memory file object   

    part_size : int, size of each chunk of an S3 multipart upload. 
    """
    print(f"Computing {memfile.name} etag using part_size={part_size}")

    # Rewind
    memfile.seek(0)

    # Concatenate multipart md5s and append with chunk count
    md5_hashs = []
    for block in iter(partial(memfile.read, part_size), b""):
        md5_hashs.append(hashlib.md5(block).digest())
    md5_hash = hashlib.md5(b"".join(md5_hashs))

    memfile.seek(0)
    return f"{md5_hash.hexdigest()}-{len(md5_hashs)}"

def get_modis_config(data_type):
    """
    Returns a dict with variable names to extract and a template dataset for a given collection.

    Parameters
    ----------
    data_type : str, Data type is the name of the granule's destination collection
    """
    if data_type in ["MOD13Q1_COG", "MYC13Q1_COG"]:
        return dict(
            variable_names=[
                "250m 16 days NDVI",
                "250m 16 days pixel reliability",
                "250m 16 days EVI",
                "250m 16 days red reflectance",
                "250m 16 days NIR reflectance",
                "250m 16 days blue reflectance",
                "250m 16 days MIR reflectance"
            ],
            tpl_dst="250m 16 days NDVI",
            group_name="MODIS_Grid_16DAY_250m_500m_VI"
        )
    elif data_type in ["MOD14A1_COG", "MYD14A_COG"]:
        # TODO
        raise Exception(f"Granule dataType={data_type} not yet supported")

    elif data_type in ["MCD64A_COG"]:
        # TODO
        raise Exception(f"Granule dataType={data_type} not yet supported")
    else: 
        raise Exception(f"Granule dataType={data_type} not supported")

def get_subdataset_name(hdf_filename, group_name, variable_name):
    """
    Returns the full name of a specified subdataset given the local filename, subdataset group name, and a variable name.
    Subdataset name formed using the HDF4 gdal driver naming pattern. See: https://gdal.org/drivers/raster/hdf4.html
    
    For example: the subdataset name 'HDF4_EOS:EOS_GRID:/opt/data/forlocal/MOD13Q1.A2018353.h08v04.006.2019032133525.hdf:MODIS_Grid_16DAY_250m_500m_VI:250m 16 days NDVI' 
    uses this pattern HDF4_EOS:EOS_GRID:{hdf_filename}:{grid_name}:{variable_name}

    Parameters
    ----------
    hdf_filename : str, Full hdf filename including path

    group_name : str, The name of MODIS group of the subdataset in hdf 

    variable_name : str, The variable name for the subdataset 
    """
    return f"HDF4_EOS:EOS_GRID:{hdf_filename}:{group_name}:{variable_name}" 

def generate_and_upload_cog(granule):
    """
    Downloads granule hdf from S3, transforms specified variables/sub datasets to COG, 
    publishes back to same S3 staging area.

    Parameters
    ----------
    granule : dict, Granule object parsed from Cumulus Message Adapter event input.

    file_staging_dir : str, S3 object key pattern for staged hdf inputs and tif outputs. 
    """
    
    client = boto3.client("s3")

    # Extract info about this granule
    file_meta = granule["files"][0]
    src_filename = file_meta["name"]
    temp_filename = f"/tmp/{src_filename}"
    file_staging_dir = file_meta["fileStagingDir"]
    src_key = f"{file_staging_dir}/{src_filename}"
    bucket = os.environ["BUCKET"]

    # Get the collection specific configuration for this granule
    modis_config = get_modis_config(granule["dataType"])

    # Generate output name and path
    file_prefix = granule["dataType"]
    output_filename = f"{file_prefix}.{src_filename}".replace(".hdf", ".tif")
    output_s3_path = "/".join([
        file_staging_dir,
        output_filename,
    ])

    # Download
    client.download_file(
        Bucket=bucket,
        Key=src_key,
        Filename=temp_filename,
    )

    assert(os.path.exists(temp_filename))
    assert(".hdf" in temp_filename)

    # Describe S3 download
    download_head_obj = client.head_object(Bucket=bucket, Key=src_key)
    download_etag = get_s3_obj_etag(download_head_obj)

    # Get upload part size from first (or only) upload part
    if etag_is_multipart(download_etag):
        download_part_1 = client.head_object(Bucket=bucket, Key=src_key, PartNumber=1)
        download_part_size = download_part_1["ContentLength"]
        temp_file_etag = compute_file_etag(temp_filename, download_part_size)
    else:
        download_part_size = DEFAULT_CHUNKSIZE
        temp_file_etag = md5_digest(temp_filename)
    
    successful_download = download_etag == temp_file_etag
    print(f"Verify download {temp_filename} temp_file_etag={temp_file_etag} download_etag={download_etag} successful_download={successful_download}")

    if not successful_download:
        raise Exception(f"S3 download to {temp_filename} could not be verified with ETag")

    print(f"Starting on filename={temp_filename} size={os.path.getsize(temp_filename)}")
    
    # Extract some dimensional properties from the template dataset to apply to all bands in output COG
    tpl_dst_name = get_subdataset_name(temp_filename, modis_config["group_name"], modis_config["tpl_dst"])
    
    with rasterio.open(tpl_dst_name) as tpl_dst:

        # Add metadata to output profile that will be used to set type for all datasets and create tif
        output_profile = dict(
            driver="GTiff",
            compress="deflate",
            interleave="pixel",
            tiled=True,
            count=len(modis_config["variable_names"]),
            transform=tpl_dst.transform,
            height=tpl_dst.height,
            width=tpl_dst.width,
            crs=tpl_dst.crs,
            nodata=tpl_dst.nodata,
            dtype=tpl_dst.dtypes[0])

    del tpl_dst

    # Iterate over modis_config variable_names to create bands from subdatasets
    bands = []
    for variable_name in modis_config["variable_names"]:
        
        sub_dst_name = get_subdataset_name(temp_filename, modis_config["group_name"], variable_name)

        with rasterio.open(sub_dst_name) as sub_dst:
            
            # Read band array 
            band_data = sub_dst.read(1)

            # Recast data type and nodata if different from output profile
            if any([sub_dst.nodata != output_profile["nodata"], sub_dst.dtypes[0] != output_profile["dtype"]]):
                band_data = np.where(band_data != sub_dst.nodata, band_data.astype(output_profile["dtype"]), output_profile["nodata"])
            
            # Add band to output
            bands.append(band_data.astype(output_profile["dtype"]))
               
        # End subdatasets
    del sub_dst

    # We will sometimes exceed the allowed space in /tmp and we no longer need hdf
    if os.path.exists(temp_filename):
        os.remove(temp_filename)

    # Config and COG profile settings
    gdal_config = dict(GDAL_NUM_THREADS="ALL_CPUS", GDAL_TIFF_OVR_BLOCKSIZE="128")
    cogeo_profile = cog_profiles.get("deflate")
    cogeo_profile.update(dict(blockxsize=256, blockysize=256, BIGTIFF="IF_SAFER"))

    with rasterio.Env(**gdal_config):
        with MemoryFile() as memfile:
            with memfile.open(**output_profile) as mem:
                
                # Add bands arrays to dataset writer
                mem.write(np.stack(bands))
        
                for idx, variable_name in enumerate(modis_config["variable_names"], 1):
                    mem.set_band_description(idx, variable_name)
                
                del bands

                # Build overviews 
                tilesize = min(int(cogeo_profile["blockxsize"]), int(cogeo_profile["blockysize"]))
                max_overview_level = get_maximum_overview_level(mem.width, mem.height, tilesize)
                overviews = [2 ** j for j in range(1, max_overview_level + 1)]
                print(f"Buliding overview levels={overviews} max_overview_levels={max_overview_level} tilesize={tilesize}")
                mem.build_overviews(overviews, Resampling.nearest)

                # Generate COG while dataset writer open
                cog_translate(
                    mem,
                    memfile.name,
                    cogeo_profile,
                    in_memory=True,
                    allow_intermediate_compression=True,
                    overview_resampling="nearest",
                    quiet=True
                )
                assert cog_validate(memfile.name)[0]
            
            # Describe the memory file in order to verify the upload
            memfile_md5 = md5_digest_memfile(memfile)
            memfile_etag = compute_memfile_etag(memfile, DEFAULT_CHUNKSIZE)
            print(f"Computed memfile md5={memfile_md5} etag={memfile_etag} chunk_size={DEFAULT_CHUNKSIZE}")

            # Force transfer to use the same chunksize used for memfile etag calculation
            multipart_config = TransferConfig(multipart_chunksize = DEFAULT_CHUNKSIZE)
            # Add the md5 to object metadata for future consumers
            upload_metadata = dict(md5=memfile_md5) 
            try:
                client.upload_fileobj(
                    memfile, 
                    bucket, 
                    output_s3_path,
                    Config=multipart_config,
                    ExtraArgs=dict(Metadata=upload_metadata))
                print(f"Uploaded {memfile.name} to {output_s3_path}")
            except ClientError as ce:
                raise Exception(f"Unable to upload to {output_s3_path} with exception={ce}")
            
            # TODO because we are describing the memfile before upload we can outdent/close memfile at this point
            # for now just leaving in place to observe which memfiles persist after upload
            if not memfile:
                print(f"Warning memfile no longer exists after S3 upload")
            else:
                print(f"Memfile exists after upload memfile_size={memfile.__len__()}")
            del mem, memfile

            # Describe the S3 upload
            upload_head_obj = client.head_object(Bucket=bucket, Key=output_s3_path)
            upload_etag = get_s3_obj_etag(upload_head_obj)
            upload_md5 = get_s3_obj_md5(upload_head_obj)
            print(f"Upload head obj={upload_head_obj}")
            
            # Verify upload

            # Compare the md5/etag computed for the memory file uploaded to the etag in the s3 head object
            cog_etag = memfile_etag if etag_is_multipart(upload_etag) else memfile_md5
            successful_upload = cog_etag==upload_etag
            print(f"Verify memfile_etag={memfile_etag} upload_etag={upload_etag}, successful_upload={successful_upload}")
            print(f"Verify memfile_md5={memfile_md5} upload_md5={upload_md5}")

            print(f"cog_etag={cog_etag} s3_upload_etag={upload_etag} success={successful_upload}")

            if not successful_upload:
                print(f"ERROR S3 upload to {output_s3_path} could not be verified with ETag")
                raise Exception(f"S3 upload to {output_s3_path} could not be verified with ETag")

    # Parse some file metadata from the head object for granule metadata
    file_size = upload_head_obj["ContentLength"] 
    file_created_time = f"{upload_head_obj['LastModified'].isoformat().replace('+00:00', '.000Z')}"
    print(f"Finished processing and uploading s3://{bucket}/{output_s3_path} size={file_size}")

    return {
        "path": f"/{output_s3_path}",
        "name": output_filename,
        "size": file_size, # TODO we are returning size in bytes here, how to we make sure units convey to Cumulus and CMR
        "created": file_created_time,
        "bucket": bucket,
        "filename": f"s3://{bucket}/{output_s3_path}",
        "md5": memfile_md5 # TODO where do we want this property in Cumulus and in CMR?
    }

def task(event, context):
    
    # cleanup /tmp
    call("rm -rf /tmp/*", shell=True)
    
    granule = event["input"]["granules"][0]
    try:
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
        print(f"Unable to process HDF to COG for granule={granule}")
        raise Exception(f"Failed with exception={e}, see traceback")

def handler(event, context):
    return run_cumulus_task(task, event, context)
