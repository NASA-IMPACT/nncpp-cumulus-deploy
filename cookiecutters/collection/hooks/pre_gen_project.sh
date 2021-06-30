#!/usr/bin/env bash

function err() {
  echo "${1}" 1>&2
}

if [[ -f "../{{ cookiecutter.collectionName }}.json" ]]; then
  err "----------------------------------------------------------------------"
  err " ERROR"
  err "----------------------------------------------------------------------"
  err " This collection file ALREADY EXISTS:"
  err ""
  err "     data/collections/{{ cookiecutter.collectionName }}.json"
  err ""
  err "----------------------------------------------------------------------"
  exit 1
fi
