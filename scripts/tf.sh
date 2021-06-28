#!/usr/bin/env bash
set -e

#
# Runs Terraform commands without having to manually change directory to a
# specific module directory.  Intended for use via a yarn script.  For example,
# within `package.json`, you might include the following:
#
#   "scripts": {
#     "tf": "scripts/tf.sh"
#   }
#
# If the first argument is a module directory, the `terraform` command is run
# from that directory, with all remaining arguments are passed directly to the
# `terraform` command.
#
# For example, if this script is configured in `package.json` as shown above,
# you would run the following command from the the root of the project in order
# to run `terraform apply` in the `cumulus-tf` module directory (without having
# to manually change directory):
#
#   yarn tf cumulus-tf apply
#
# If the first argument is *not* a directory, the `terraform` command (with
# all arguments passed along) is first run from the `data-persistence-tf`
# directory, and then the same command (with the same arguments) is run from
# the `cumulus-tf` directory.
#
# For example, to deploy (apply) *both* modules, you would run the following
# yarn command:
#
#   yarn tf apply
#

# This assumes the project root dir is the parent of the directory containing
# this script.

if [[ -d "../$1" ]]; then
  # The first argument is a directory, so change directory to it and run
  # `terraform` from there, passing all remaining arguments along (i.e., all
  # arguments excluding the leading directory argument).
  cd "../$1"
  shift
  terraform "$@"
else
  # Otherwise, run `terraform` in each module, passing along all arguments.
  cd ../data-persistence-tf
  terraform "$@"
  cd ../cumulus-tf
  terraform "$@"
fi
