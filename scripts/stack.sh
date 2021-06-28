#!/usr/bin/env bash

set -euo pipefail

declare _stack_files=(
  ".env"
  "cumulus-tf/terraform.tf"
  "cumulus-tf/terraform.tfvars"
  "data-persistence-tf/terraform.tf"
  "data-persistence-tf/terraform.tfvars"
)

function usage() {
  echo
  echo "Usage:"
  echo "  stack COMMAND [ARGS]"
  echo
  echo "Commands:"
  echo "  help, -h, --help  Show this help message and exit"
  echo "  show              Show the name of the current stack"
  echo "  list              List all known stacks"
  echo "  save              Save the current stack"
  echo "  select STACK      Select the specified stack as the current stack."
  echo "                    Use the 'list' command to see known stacks."
  echo
}

function err() {
  local _message=${1:-}

  echo -e "${_message}" >&2
}

function die() {
  local _message=${1:-"Unknown error"}

  err ""
  err "ERROR: ${_message}"
  err ""

  exit 1
}

function die_with_help() {
  local _message=${1:-"Unknown error"}

  err ""
  err "${_message}"
  usage >&2

  exit 1
}

function current_stack() {
  grep -E 'prefix\s*=\s*".+"' <cumulus-tf/terraform.tfvars | sed -E 's/.*"(.+)".*/\1/'
}

function show_stack() {
  declare _stack

  _stack="$(current_stack)"

  echo ""
  echo "The current stack is '${_stack}'"
  echo ""

  if ! stack_completely_saved "${_stack}"; then
    echo "WARNING: You have unsaved stack secrets.  Run the 'save' command to save them."
    echo ""
  fi
}

function saved_stack_secret_names() {
  declare _stack_name=${1:-}

  aws secretsmanager list-secrets \
    --query "SecretList[?Name.contains(@, '${_stack_name}/')].Name" \
    --output text
}

function saved_stack_filenames() {
  declare _stack_name=${1:-$(current_stack)}

  saved_stack_secret_names "${_stack_name}" |
    tr '\t' '\n' |
    sed -E 's#.*/([^/]+)$#\1#' |
    sort -fu |
    tr '\n' ' '
}

function saved_stacks() {
  saved_stack_secret_names |
    tr '\t' '\n' |
    sed -E 's#^([^/]+)/.*#\1#' |
    sort -fu |
    tr '\n' ' '
}

function list_stacks() {
  declare _saved_stacks
  declare _current_stack
  declare _marker
  declare _status

  _current_stack=$(current_stack)
  _saved_stacks=$(saved_stacks)

  if [[ -n ${_saved_stacks} ]]; then
    echo "Stacks with saved secrets:"
    echo ""
  else
    echo "No stacks with saved secrets"
  fi

  for _stack in ${_saved_stacks}; do
    if [[ "${_stack}" == "${_current_stack}" ]]; then
      _marker="*"
    else
      _marker=" "
    fi

    if stack_completely_saved "${_stack}"; then
      _status=""
    else
      _status="(unsaved secrets)"
    fi

    echo " ${_marker} ${_stack} ${_status}"
  done

  echo ""
}

function lowercase() {
  echo "${1}" | tr '[:upper:]' '[:lower:]'
}

function secret_exists() {
  declare _stack=${1}
  declare _file=${2}

  aws secretsmanager describe-secret --secret-id "${_stack}/${_file}" >/dev/null 2>&1
}

function save_secret() {
  declare _stack=${1}
  declare _file=${2}
  declare _secret_id="${_stack}/${_file}"

  echo "Saving file '${_file}' to secret named '${_secret_id}'"

  if secret_exists "${_stack}" "${_file}"; then
    aws secretsmanager put-secret-value \
      --secret-id "${_secret_id}" \
      --secret-string "file://${_file}" >/dev/null
  else
    aws secretsmanager create-secret \
      --name "${_secret_id}" \
      --secret-string "file://${_file}" >/dev/null
  fi
}

function save_stack() {
  declare _stack=${1:-$(current_stack)}
  declare _file

  echo "Saving secrets for stack '${_stack}'..."

  for _file in ${_stack_files[*]}; do
    if [[ -f ${_file} ]]; then
      save_secret "${_stack}" "${_file}"
    fi
  done
}

function stack_exists() {
  declare _stack=${1:-$(current_stack)}

  for _file in ${_stack_files[*]}; do
    if secret_exists "${_stack}" "${_file}"; then
      return 0
    fi
  done

  return 1
}

function stack_completely_saved() {
  declare _stack=${1:-$(current_stack)}

  for _file in ${_stack_files[*]}; do
    if ! secret_exists "${_stack}" "${_file}"; then
      return 1
    fi
  done

  return 0
}

function select_stack() {
  declare _stack=${1}
  declare _current_stack

  if ! stack_exists "${_stack}"; then
    die "Unknown stack: '${_stack}'.  Use the 'list' command to see available stacks."
  fi

  _current_stack=$(current_stack)

  if ! stack_completely_saved "${_current_stack}"; then
    die "Your current stack '${_current_stack}' has unsaved secrets.  Use the 'save' command to save them before selecting another stack."
  fi

  echo "Selecting stack '${_stack}'"

  for _file in ${_stack_files[*]}; do
    echo -n "Downloading secret '${_stack}/${_file}' to file '${_file}'"

    if aws secretsmanager get-secret-value \
      --secret-id "${_stack}/${_file}" \
      --query "SecretString" \
      --output text >"${_file}" 2>/dev/null; then
      echo ""
    else
      echo " (missing secret)"
    fi
  done
}

function main() {
  case ${1:-} in
  help | -h | --help)
    usage
    ;;
  list)
    shift
    list_stacks
    ;;
  save)
    shift
    save_stack "$(current_stack)"
    ;;
  select)
    shift
    declare _stack=${1:-}
    [[ -n ${_stack} ]] || die "No stack specified"
    select_stack "${_stack}"
    ;;
  show)
    shift
    show_stack
    ;;
  "")
    die_with_help "No command specified"
    ;;
  *)
    die_with_help "Unknown command: ${1}"
    ;;
  esac
}

main "$@"
