# Exit script on first error (no sense in continuing afterwards)
set -e

# Use a default prefix unless user specifies a prefix on the command-line as the
# first (only) argument to this script.
_s3_prefix=${1:-file-staging/nasa-map/ABLVIS1B___001/LVIS1B_ABoVE2017_0629_R1803_056233.cmr.xml}

# Use `aws2` if found, else `aws`
function do_aws() {
  local _aws

  _aws=$([[ $(command -v aws2) ]] && echo "aws2" || echo "aws")
  echo ${_aws} $@ > /dev/stderr
  ${_aws} "$@"
}

mkdir -p build

do_aws s3api list-objects-v2 \
  --profile maap \
  --bucket cumulus-map-internal \
  --prefix ${_s3_prefix} > build/cumulus-map-internal-files.json

do_aws s3api list-objects-v2 \
  --profile gcc-tenantDeveloper \
  --bucket nasa-maap-data-store \
  --prefix ${_s3_prefix} > build/nasa-maap-data-store-files.json

node test-replicated-files.js
