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

# GDAL and COG output config
gdal_config = dict(GDAL_NUM_THREADS="ALL_CPUS", GDAL_TIFF_OVR_BLOCKSIZE="128")
output_profile = cog_profiles.get("deflate")
output_profile.update(dict(blockxsize=256, blockysize=256))

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

    file_meta = granule["files"][0]
    src_filename = file_meta["name"]
    temp_filename = f"/tmp/{src_filename}"
    file_staging_dir = file_meta["fileStagingDir"]
    src_key = f"{file_staging_dir}/{src_filename}"
    bucket = os.environ["BUCKET"]

    print(f"bucket={bucket} src_key={src_key} temp_filename={temp_filename} file_meta={file_meta}")

    # Get the collection specific configuration for this granule
    print(f"Getting config for granule dataType={granule['dataType']}")
    modis_config = get_modis_config(granule["dataType"])

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

    # Extract some dimensional properties from the template dataset to apply to all bands in output COG
    tpl_dst_name = get_subdataset_name(temp_filename, modis_config["group_name"], modis_config["tpl_dst"])
    
    with rasterio.open(tpl_dst_name) as tpl_dst:

        # Add metadata to rw_profile that will be used to read and set datatype for all datasets
        rw_profile = dict(
            count=len(modis_config["variable_names"]),
            driver="GTiff",
            transform=tpl_dst.transform,
            height=tpl_dst.height,
            width=tpl_dst.width,
            crs=tpl_dst.crs,
            nodata=tpl_dst.nodata,
            dtype=tpl_dst.dtypes[0])

    # Iterate over subdatasets and extract bands in modis_vi_config variable_names
    bands = []
    for variable_name in modis_config["variable_names"]:
        
        sub_dst_name = get_subdataset_name(temp_filename, modis_config["group_name"], variable_name)

        with rasterio.open(sub_dst_name) as sub_dst:
            print(f"Reading subdataset={variable_name}")
            # Read band array and scale if needed
            band_data = sub_dst.read(1)

            # Recast data type and nodata if different from template dataset
            if any([sub_dst.nodata != rw_profile["nodata"], sub_dst.dtypes[0] != rw_profile["dtype"]]):
                band_data = np.where(band_data != sub_dst.nodata, band_data.astype(rw_profile["dtype"]), rw_profile["nodata"])
            
            # Add band to output
            bands.append({
                "name": sub_dst_name,
                "data": band_data.astype(rw_profile["dtype"])
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

    # TODO Should generate checksum before upload and verify Etag after, this belongs in file payload

    # Upload to S3
    client.upload_file(output_filename, bucket, output_s3_path)
    # Get the size of the `.tif` file
    file_metadata = client.head_object(Bucket=bucket, Key=output_s3_path)
    file_size = file_metadata['ContentLength'] / 1000000
    file_created_time = f"{file_metadata['LastModified'].isoformat().replace('+00:00', '.000Z')}"
    print(f"file_metadata={file_metadata}")

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
        "filename": f"s3://{bucket}/{output_s3_path}",
        "additional_attributes": {"some_property":"some_value"}
    }

def task(event, context):
    
    # cleanup /tmp
    call("rm -rf /tmp/*", shell=True)
    
    try:
        granule = event["input"]["granules"][0]

        # TODO should be updating files list to include a link to the parent file as well as the new COG file
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
