#!/usr/bin/env bash

# Move Lambda Function's tf file into place

tf_filename="lambda_{{ cookiecutter.snake_case_function_name }}.tf"
tf_filename_lower="lambda_{{ cookiecutter.snake_case_function_name | lower }}.tf"

mv "${tf_filename}" "../../${tf_filename_lower}"

# Install dependencies listed in newly created package.json file

yarn install

echo "--------------------------------------------------------------------------"
echo " NOTE"
echo "--------------------------------------------------------------------------"
echo " Created new Lambda Function in the following directory:"
echo ""
echo "     cumulus-tf/lambdas/{{ cookiecutter.camelCaseFunctionName }}/"
echo ""
echo " Also created the following Terraform file for it:"
echo ""
echo "     cumulus-tf/${tf_filename_lower}"
echo ""
echo "--------------------------------------------------------------------------"
