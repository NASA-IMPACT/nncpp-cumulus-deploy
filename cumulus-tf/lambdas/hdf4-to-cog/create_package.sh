#!/usr/bin/env bash

# Creates the lambda package for hdf4-to--cog

# Since this is an expensive operation, this script makes sure that a new archive is
# created if and only if any changes have been detected in the dependent files

dockerfile_md5=`md5 Dockerfile | awk '{ print $4 }'`
main_md5=`md5 src/main.py | awk '{ print $4 }'`
package_md5=`md5 package.sh | awk '{ print $4 }'`

combined_md5="${dockerfile_md5}${main_md5}${package_md5}"

old_md5_file=build/md5.txt
old_zip_file=build/hdf4-to-cog.zip

if test -f "$old_md5_file" && test -f "$old_zip_file"; then
    if [ `cat $old_md5_file` = $combined_md5 ]; then
        echo "No changes detected. Build exiting."
        exit 0
    fi
fi

echo "Starting new build."
mkdir -p build

(docker stop lambda || true) && (docker rm lambda || true)
set -e
docker build --tag package:latest .
docker run --name lambda -w /var/task --volume $(pwd)/:/local -td package:latest bash
docker exec -t lambda bash '/local/package.sh'
docker stop lambda
docker rm lambda

echo $combined_md5 > $old_md5_file
