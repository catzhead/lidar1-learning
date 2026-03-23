# worker/Dockerfile
FROM python:3.12-slim AS potree-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    git cmake make g++ libtbb-dev \
    && rm -rf /var/lib/apt/lists/*

# Build LASzip
WORKDIR /build
RUN git clone https://github.com/LASzip/LASzip.git && \
    cd LASzip && \
    mkdir build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX=/opt/laszip && \
    make -j$(nproc) && make install

# Build PotreeConverter
RUN git clone https://github.com/potree/PotreeConverter.git && \
    cd PotreeConverter && \
    mkdir build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release \
             -DLASZIP_INCLUDE_DIRS=/opt/laszip/include \
             -DLASZIP_LIBRARY=/opt/laszip/lib/liblaszip.so && \
    make -j$(nproc)

FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libtbb12 \
    && rm -rf /var/lib/apt/lists/*

# Copy PotreeConverter binary and resources
COPY --from=potree-builder /build/PotreeConverter/build/PotreeConverter /usr/local/bin/
COPY --from=potree-builder /opt/laszip/lib/ /usr/local/lib/
COPY --from=potree-builder /build/PotreeConverter/resources/ /usr/local/share/PotreeConverter/resources/
RUN ldconfig

WORKDIR /app
COPY worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY worker/app/ ./app/

CMD ["python", "-m", "app.main"]
