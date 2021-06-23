#!/usr/bin/env bash

set -eou pipefail

function list_tasks() {
  aws ecs list-tasks \
    --cluster "${_cluster_name}" \
    --output text \
    --query "taskArns"
}

function task_service_name() {
  local _task_arn=${1}

  aws ecs describe-tasks \
    --cluster "${_cluster_name}" \
    --query "tasks[].containers[].name" \
    --output text \
    --tasks "${_task_arn}"
}

function stop_task() {
  local _cluster_name=${1}
  local _task_arn=${2}
  local _service_name

  _service_name=$(task_service_name "${_task_arn}")
  echo "Stopping task for '${_service_name}' in cluster '${_cluster_name}'"

  aws ecs stop-task --cluster "${_cluster_name}" --task "${_task_arn}" >/dev/null
}

function stop_tasks() {
  local _cluster_name=${1}
  local -a _task_arns=${2}

  for _task_arn in ${_task_arns[*]}; do
    stop_task "${_cluster_name}" "${_task_arn}"
  done
}

function spinning_sleep() {
  local _seconds=${1:-5}
  echo -en " "

  for ((i = 0; i < _seconds; ++i)); do
    echo -en "\b-"
    sleep 0.25
    echo -en "\b\\"
    sleep 0.25
    echo -en "\b|"
    sleep 0.25
    echo -en "\b/"
    sleep 0.25
  done

  echo -en "\b"
}

function wait_for_new_tasks() {
  local _cluster_name=${1}
  local _n_tasks=${2}
  local -a _task_arns=()

  echo -n "Waiting for new tasks to start..."

  while [[ "${#_task_arns[@]}" != "${_n_tasks}" ]]; do
    spinning_sleep 5
    mapfile -t _task_arns < <(list_tasks "${_cluster_name}")
  done

  echo "done"
}

function main() {
  local _prefix=${1:-${CUMULUS_STACK}}
  local _cluster_name=${_prefix}-CumulusECSCluster
  local -a _task_arns

  mapfile -t _task_arns < <(list_tasks "${_cluster_name}")
  stop_tasks "${_cluster_name}" "${_task_arns[@]}"
  wait_for_new_tasks "${_cluster_name}" ${#_task_arns[@]}
}

main "$@"
