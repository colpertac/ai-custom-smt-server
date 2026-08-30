# Runtime image for COMP lobby / world / channel (amd64).
# Binaries are prebuilt on a fat host and copied in — VMs never compile.
# All config/data/logs come from a mounted portable runtime tree at /comp.

FROM debian:trixie-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    libmariadb3 \
    libssl3t64 \
    libphysfs1 \
    zlib1g \
    libsystemd0 \
  && rm -rf /var/lib/apt/lists/*

RUN useradd --system --home /comp --shell /usr/sbin/nologin comp \
  && mkdir -p /comp

COPY bin/comp_lobby bin/comp_world bin/comp_channel /usr/local/bin/
COPY entrypoint.sh /usr/local/bin/comp-entrypoint.sh
RUN chmod 0755 /usr/local/bin/comp_* /usr/local/bin/comp-entrypoint.sh

WORKDIR /comp
ENTRYPOINT ["/usr/local/bin/comp-entrypoint.sh"]
CMD ["comp_lobby", "/comp/config/lobby.xml"]
