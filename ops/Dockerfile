# Ops sidecar — Docker backend control plane (Phase 16I).
# Base trixie to match colpertac/smt-comp (comp_encrypt / comp_rehash need same glibc).
# Talks to the host Docker daemon via /var/run/docker.sock.
# Do NOT publish port 14710 to the host; website reaches it on the compose network.

FROM docker:27-cli AS dockercli

FROM debian:trixie-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    python3 \
    libmariadb3 \
    libphysfs1 \
  && rm -rf /var/lib/apt/lists/*

# docker CLI + compose plugin (talks to mounted docker.sock)
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose \
  /usr/local/lib/docker/cli-plugins/docker-compose

WORKDIR /ops
COPY encrypt_tools.py first_boot.py freshness.py ingest_jobs.py metrics.py \
  rehash.py sidecar.py zip_ingest.py ceventmessage.py service_logs.py updater_site.py ./
# comp_encrypt / comp_rehash / … — staged by deploy/scripts/stage-ops-tools.sh
COPY comp-tools/ /opt/comp-tools/
RUN chmod 0755 /opt/comp-tools/* 2>/dev/null || true
# AGPL server zone/event defs — staged by deploy/scripts/stage-server-datastore.sh
COPY server-datastore/ /opt/server-datastore/

ENV OPS_BIND=0.0.0.0 \
    OPS_PORT=14710 \
    OPS_BACKEND=docker \
    PYTHONUNBUFFERED=1 \
    DOCKER_CONFIG=/tmp/.docker \
    BIN_DIR=/opt/comp-tools \
    OPS_SERVER_DATASTORE=/opt/server-datastore

EXPOSE 14710
CMD ["python3", "sidecar.py"]
