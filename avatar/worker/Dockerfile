# Portrait render worker (avatar/worker, avatar/docs/WORKER.md): node + playwright-core +
# chrome-headless-shell (SwiftShader) + three, and python3 for the asset converter.
#
# Build from the repository root (the context needs avatar/ and ops/comp-tools/):
#   docker build -f avatar/worker/Dockerfile -t smt-avatar-worker:local .
# avatar/worker/Dockerfile.dockerignore keeps the context to avatar/{tools,viewer,shaders,worker}
# and the two comp-tools binaries.
#
# Runtime: game client read-only at IMAGINE_CLIENT_DIR (/client), nif.xml at NIF_XML
# (/opt/nif/nif.xml, needed only when assets must be (re)converted), converted assets on the
# /data volume. See deploy/docker-compose.yml (service avatar-worker, profile "renderer").
FROM node:24.12.0-trixie-slim

# Versions the golden hashes (avatar/worker/golden.json) were made with. The browser is
# Playwright's chromium_headless_shell-1223 = Chrome for Testing 148.0.7778.96 headless shell;
# CHROME_SHA256 is the sha256 of its chrome-headless-shell executable on the reference box.
ARG PLAYWRIGHT_VERSION=1.58.2
ARG THREE_VERSION=0.170.0
ARG CHROME_BUILD=chromium_headless_shell-1223
ARG CHROME_VERSION=148.0.7778.96
ARG CHROME_SHA256=7b8e92dca0acf9c24b5974507b3031d6bd18cc009cd431c2595e521430ea747a

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_CORE=/opt/node/node_modules/playwright-core \
    THREE_DIR=/opt/node/node_modules/three \
    CHROME=/ms-playwright/${CHROME_BUILD}/chrome-headless-shell-linux64/chrome-headless-shell \
    COMP_TOOLS_DIR=/opt/comp-tools \
    AVATAR_BUILD_DIR=/data \
    AVATAR_ASSETS_DIR=/data/assets \
    IMAGINE_CLIENT_DIR=/client \
    NIF_XML=/opt/nif/nif.xml \
    NODE_ENV=production

# python3 runs avatar/tools (stdlib only); libmariadb3 + libphysfs1 are what comp_decrypt /
# comp_bdpatch link against (same as the ops image); install-deps adds Chromium's shared libraries.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip python3 libmariadb3 libphysfs1 \
  && mkdir -p /opt/node \
  && cd /opt/node \
  && npm init -y >/dev/null \
  && npm install --no-audit --no-fund --save-exact "playwright-core@${PLAYWRIGHT_VERSION}" "three@${THREE_VERSION}" \
  && node /opt/node/node_modules/playwright-core/cli.js install-deps chromium \
  && mkdir -p "/ms-playwright/${CHROME_BUILD}" \
  && ( curl -fsSL "https://cdn.playwright.dev/builds/cft/${CHROME_VERSION}/linux64/chrome-headless-shell-linux64.zip" -o /tmp/chs.zip \
       || curl -fsSL "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-headless-shell-linux64.zip" -o /tmp/chs.zip ) \
  && unzip -q /tmp/chs.zip -d "/ms-playwright/${CHROME_BUILD}" \
  && rm /tmp/chs.zip \
  && echo "${CHROME_SHA256}  ${CHROME}" | sha256sum -c - \
  && touch "/ms-playwright/${CHROME_BUILD}/INSTALLATION_COMPLETE" \
  && "${CHROME}" --version \
  && apt-get purge -y unzip \
  && rm -rf /var/lib/apt/lists/* /root/.npm

COPY ops/comp-tools/comp_decrypt ops/comp-tools/comp_bdpatch /opt/comp-tools/
COPY avatar/tools/ /app/avatar/tools/
COPY avatar/viewer/ /app/avatar/viewer/
COPY avatar/shaders/ /app/avatar/shaders/
COPY avatar/worker/ /app/avatar/worker/

RUN chmod 0755 /opt/comp-tools/* /app/avatar/worker/entrypoint.sh \
  && for b in /opt/comp-tools/*; do if ldd "$b" | grep "not found"; then echo "missing libraries for $b" >&2; exit 1; fi; done \
  && mkdir -p /data /client /opt/nif \
  && chown node:node /data

USER node
WORKDIR /app
VOLUME ["/data"]
ENTRYPOINT ["/app/avatar/worker/entrypoint.sh"]
CMD []
