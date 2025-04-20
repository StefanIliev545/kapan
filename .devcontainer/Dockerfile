FROM starknetfoundation/starknet-dev:2.11.4

ENV DEVNET_VERSION=0.4.0
RUN ARCH=$(uname -m) && \
    echo "Architecture detected: ${ARCH}" && \
    if [ "${ARCH}" = "x86_64" ]; then \
        echo "Installing binary for x86_64"; \
        curl -sSfL https://github.com/0xSpaceShard/starknet-devnet-rs/releases/download/v${DEVNET_VERSION}/starknet-devnet-x86_64-unknown-linux-gnu.tar.gz | tar -xvz -C ${HOME}/.local/bin; \
    elif [ "${ARCH}" = "aarch64" ]; then \
        echo "Installing binary for ARM64"; \
        curl -sSfL https://github.com/0xSpaceShard/starknet-devnet-rs/releases/download/v${DEVNET_VERSION}/starknet-devnet-aarch64-unknown-linux-gnu.tar.gz | tar -xvz -C ${HOME}/.local/bin; \
    else \
        echo "Unknown architecture: ${ARCH}"; \
        exit 1; \
    fi
USER root
RUN apt-get update && apt-get install -y \
    python3 \
    python3-distutils \
    build-essential
USER node    