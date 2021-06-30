#!/usr/bin/env bash

# Move the collection json file up to the parent data/collections directory and
# remove this cookiecutter-generated directory.

filename="{{ cookiecutter.collectionName }}___{{ cookiecutter.collectionVersion }}.json"
mv -n "./${filename}" ..
rm -rf "$(pwd -P)"

echo "--------------------------------------------------------------------------"
echo " NOTE"
echo "--------------------------------------------------------------------------"
echo " Created new collection file:"
echo ""
echo "     data/collections/${filename}"
echo ""
echo " You must set the 'granuleIdExtraction' and 'sampleFileName' values,"
echo " along with any relevant 'meta' values within the file.  For reference,"
echo " see https://nasa.github.io/cumulus/docs/data-cookbooks/setup#collections."
echo ""
echo " Once all configuration values are properly set, run the following"
echo " command to insert (or update) the collection into the Cumulus DB for"
echo " your stack:"
echo ""
echo "     yarn data:upsert"
echo ""
echo "--------------------------------------------------------------------------"
