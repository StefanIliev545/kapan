FROM starknetfoundation/starknet-dev:2.12.0

ENV DEVNET_VERSION=0.4.0
USER root
RUN apt-get update && apt-get install -y \
    python3 \
    python3-distutils \
    build-essential
USER node