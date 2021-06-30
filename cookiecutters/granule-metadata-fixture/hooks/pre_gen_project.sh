#!/usr/bin/env bash

function err() {
  echo "${1}" 1>&2
}

fixture_filename="{{ cookiecutter.producerGranuleId }}.yml"

if [[ -f "../${fixture_filename}" ]]; then
  err "--------------------------------------------------------------------------"
  err " ERROR"
  err "--------------------------------------------------------------------------"
  err " This test fixture file ALREADY EXISTS:"
  err ""
  err "     cumulus-tf/lambdas/cmr/test/fixtures/metadata/${fixture_filename}"
  err ""
  err "--------------------------------------------------------------------------"
  exit 1
fi
