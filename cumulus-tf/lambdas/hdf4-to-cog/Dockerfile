FROM lambgeo/lambda:gdal2.4-py3.7

ENV PACKAGE_PREFIX=/var/task

RUN pip install numpy rasterio rio-cogeo cumulus-message-adapter-python --no-binary :all: -t ${PACKAGE_PREFIX}/
COPY src/main.py ${PACKAGE_PREFIX}/main.py