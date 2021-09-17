FROM lambgeo/lambda-gdal:3.2-python3.8

ENV PACKAGE_PREFIX=/var/task

RUN pip install rio-cogeo==2.0.1 cumulus-message-adapter-python --no-binary :all: -t ${PACKAGE_PREFIX}/

# Reduce size of the C libs
RUN cd $PREFIX && find lib -name \*.so\* -exec strip {} \;

# Include optimizations from: https://blog.mapbox.com/aws-lambda-python-magic-e0f6a407ffc6
# We can remove all tests/ script and other unused files
RUN find $PACKAGE_PREFIX -name "*-info" -type d -exec rm -rdf {} +
RUN find $PACKAGE_PREFIX -name "tests" -type d -exec rm -rdf {} +
RUN find $PACKAGE_PREFIX -name "testing" -type d -exec rm -rdf {} +

# Here we remove package that will be present in AWS Lambda env
RUN rm -rdf $PACKAGE_PREFIX/boto3/
RUN rm -rdf $PACKAGE_PREFIX/botocore/
RUN rm -rdf $PACKAGE_PREFIX/docutils/
RUN rm -rdf $PACKAGE_PREFIX/dateutil/
RUN rm -rdf $PACKAGE_PREFIX/jmespath/
RUN rm -rdf $PACKAGE_PREFIX/s3transfer/
RUN rm -rdf $PACKAGE_PREFIX/numpy/doc/

# Remove packages that are in the CMA layer
RUN rm -rdf $PACKAGE_PREFIX/urllib3/
RUN rm -rdf $PACKAGE_PREFIX/jsonschema/
RUN rm -rdf $PACKAGE_PREFIX/jsonpath_ng/
RUN rm -rdf $PACKAGE_PREFIX/ply/
RUN rm -rdf $PACKAGE_PREFIX/typed_ast/

# Remove build tools 
RUN rm -rdf $PACKAGE_PREFIX/setuptools/
RUN rm -rdf $PACKAGE_PREFIX/pkg_resources/

# Remove some docs and examples
RUN rm -rdf /opt/share/man/
RUN rm -rdf /opt/share/doc/
RUN rm -rdf /opt/share/hdf5_examples/
RUN rm -rdf /opt/share/hdf4_examples/

# Keep byte-code compiled files for faster Lambda startup
RUN find $PACKAGE_PREFIX -type f -name '*.pyc' | while read f; do n=$(echo $f | sed 's/__pycache__\///' | sed 's/.cpython-38//'); cp $f $n; done;
RUN find $PACKAGE_PREFIX -type d -a -name '__pycache__' -print0 | xargs -0 rm -rf
RUN find $PACKAGE_PREFIX -type f -a -name '*.py' -print0 | xargs -0 rm -f

COPY src/main.py ${PACKAGE_PREFIX}/main.py

RUN cd $PACKAGE_PREFIX && zip -r9q /tmp/package.zip *
RUN cd $PREFIX && zip -r9q --symlinks /tmp/package.zip lib/*.so* share
RUN cd $PREFIX && zip -r9q --symlinks /tmp/package.zip bin/gdal* bin/ogr* bin/geos* bin/nearblack
