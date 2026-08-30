# Ops sidecar — Docker backend control plane (Phase 16I).
# Talks to the host Docker daemon via /var/run/docker.sock.
# Do NOT publish port 14710 to the host; website reaches it on the compose network.

FROM docker:27-cli AS dockercli

FROM python:3.12-slim-bookworm

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
  && rm -rf /var/lib/apt/lists/*

# docker CLI + compose plugin (talks to mounted docker.sock)
COPY --from=dockercli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=dockercli /usr/local/libexec/docker/cli-plugins/docker-compose \
  /usr/local/lib/docker/cli-plugins/docker-compose

WORKDIR /ops
COPY encrypt_tools.py first_boot.py freshness.py ingest_jobs.py metrics.py \
  rehash.py sidecar.py zip_ingest.py ceventmessage.py service_logs.py ./

ENV OPS_BIND=0.0.0.0 \
    OPS_PORT=14710 \
    OPS_BACKEND=docker \
    PYTHONUNBUFFERED=1 \
    DOCKER_CONFIG=/tmp/.docker

EXPOSE 14710
CMD ["python3", "sidecar.py"]
