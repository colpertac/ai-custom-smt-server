# Oracle Cloud VPS — fresh instance setup (Phase 15)

Goal: run the same Hub-only stack as Proxmox on a public Ubuntu VM.
No COMP toolchain on the VPS. Images pull from Docker Hub; `data/` + `updater/`
come from your build PC.

| Image   | Hub                            |
| ------- | ------------------------------ |
| Game    | `colpertac/smt-comp:latest`    |
| Website | `colpertac/smt-website:latest` |
| Updater | `nginx:1.27-alpine`            |

**Shape (recommended):** Ubuntu 24.04 **amd64**, ~1 OCPU, **4 GB RAM**, ≥50 GB
boot. Do **not** use Ampere ARM — published images are x86_64.

**Firewall:** Oracle needs **two** layers:

1. **VCN** security list / NSG (ingress)
2. **firewalld** on the VM (prefer this over `ufw` on Oracle — `ufw` often
   fights Oracle’s iptables/nft path)

Do **not** open lobby HTTP `10999` or world `18666` to the internet.

Related: [client-host-config.md](../guides/client-host-config.md),
[proxmox-smoke.md](proxmox-smoke.md), [backup-restore.md](backup-restore.md).

---

## 0. Oracle console (before first SSH)

### Ingress (VCN security list or NSG) — TCP

| Port    | Purpose                                            |
| ------- | -------------------------------------------------- |
| `22`    | SSH (restrict source CIDR to your IP if possible)  |
| `10666` | Lobby                                              |
| `14666` | Channel                                            |
| `8765`  | Updater                                            |
| `3000`  | Website (or `80`/`443` later with a reverse proxy) |

Egress: leave default (allow all) unless you have a locked-down egress policy.

Note the instance **public IP** (or assign a reserved public IP). That value is
`EXTERNAL_IP` and the host clients will use.

### SSH key

Use the key you attached at create time:

```bash
ssh -i ~/.ssh/your-oracle-key ubuntu@PUBLIC_IP
```

---

## 1. Base packages (on the VPS)

Install both, but bring **firewalld up before Docker** (no reboot required
between them):

```bash
sudo apt update
sudo apt install -y firewalld curl docker.io docker-compose-v2

# 1) firewalld first
sudo systemctl enable --now firewalld

# 2) open ports + masquerade (before first compose)
# Do NOT bind docker0 to "trusted" — Docker manages its own "docker" zone.
# Binding docker0 to trusted causes: ZONE_CONFLICT: already bound to 'trusted'
sudo firewall-cmd --permanent --add-service=ssh
sudo firewall-cmd --permanent --add-port=10666/tcp
sudo firewall-cmd --permanent --add-port=14666/tcp
sudo firewall-cmd --permanent --add-port=8765/tcp
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --permanent --zone=public --add-masquerade
sudo firewall-cmd --reload

# 3) then Docker
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
# log out and SSH back in so docker group applies
```

Confirm:

```bash
docker version
docker compose version
sudo firewall-cmd --state
systemctl is-active firewalld docker
# After first docker start, docker0 should be in the docker zone:
sudo firewall-cmd --get-active-zones
```

Optional (survives reboot cleaner): make Docker wait for firewalld:

```bash
sudo mkdir -p /etc/systemd/system/docker.service.d
printf '%s\n' '[Unit]' 'After=firewalld.service' 'Wants=firewalld.service' \
  | sudo tee /etc/systemd/system/docker.service.d/after-firewalld.conf
sudo systemctl daemon-reload
sudo systemctl restart docker
```

---

## 2. firewalld notes

Ports and masquerade are already set in §1. Re-check:

```bash
sudo firewall-cmd --list-ports
sudo firewall-cmd --list-services
```

**Boot / reload order:** firewalld first, then Docker.

```bash
sudo systemctl restart firewalld
sudo systemctl restart docker
```

Keep **closed** on the public internet: `10999` (lobby API), `18666` (world).

### If `docker compose` fails: `python-nftables` / `No such file or directory`

Stale bridge rules after reboot (error mentions `br-……` and
`filter_FWD_public_allow`). Clean and restart in order:

```bash
cd /opt/smt
docker compose down 2>/dev/null || true
# remove leftover compose networks (name may vary)
docker network ls
docker network rm smt_smt 2>/dev/null || true
docker network prune -f

sudo systemctl restart firewalld
sudo systemctl restart docker

# re-apply ports + masquerade if needed (do NOT add docker0 to trusted)
sudo firewall-cmd --permanent --zone=public --add-masquerade
sudo firewall-cmd --reload
sudo systemctl restart docker

cd /opt/smt
docker compose up -d
```

If it still fails, check that firewalld is running before Docker:

```bash
systemctl is-active firewalld docker
journalctl -u docker -n 40 --no-pager
```

---

## 3. Build zip on the build PC, copy to VPS

```bash
cd /path/to/ai-custom-smt-server

# Refresh Hub images if binaries/website changed
./deploy/scripts/docker-push-hub.sh
./deploy/scripts/docker-push-website-hub.sh

# Overlay-only updater (after client-overlay / VersionData / ImagineUpdate changes)
./scripts/seed-updater-base.sh --overlay-only   # once / after wipe
./scripts/build-updater-overlay.sh

# Zip compose + data (datastore/BinaryData/…) + updater
./deploy/scripts/make-deploy-bundle.sh -o /tmp/smt-oracle.zip
```

Copy and unpack on the VPS:

```bash
PUBLIC_IP=YOUR.ORACLE.PUBLIC.IP
scp -i ~/.ssh/your-oracle-key /tmp/smt-oracle.zip ubuntu@$PUBLIC_IP:/tmp/

ssh -i ~/.ssh/your-oracle-key ubuntu@$PUBLIC_IP
sudo mkdir -p /opt/smt && sudo chown ubuntu:ubuntu /opt/smt
cd /opt/smt
unzip -o /tmp/smt-oracle.zip
mv smt/* . && rmdir smt
```

---

## 4. Configure `.env` (on the VPS)

```bash
cd /opt/smt
cp .env.example .env
chmod +x entrypoint.sh
```

Edit `.env` (use the **public** IP or DNS name clients will dial):

```bash
EXTERNAL_IP=YOUR.ORACLE.PUBLIC.IP
SESSION_SECRET=paste-output-of-openssl-rand-base64-48

UPDATER_ROOT=/opt/smt/updater
COMP_RUNTIME=/opt/smt/data
COMP_ENTRYPOINT=/opt/smt/entrypoint.sh
UPDATER_NGINX_CONF=/opt/smt/nginx/updater.conf

COMP_IMAGE=colpertac/smt-comp:latest
WEBSITE_IMAGE=colpertac/smt-website:latest
WEBSITE_PORT=3000
UPDATER_PORT=8765
```

Generate the session secret:

```bash
openssl rand -base64 48
```

SQLite configs (default):

```bash
cp config/sqlite/{lobby,world,channel}.xml data/config/
```

Wrong `EXTERNAL_IP` → login may work, then channel connect fails.

---

## 5. Pull and start

```bash
cd /opt/smt
docker compose pull
docker compose up -d
docker compose ps
docker compose logs --tail=50 lobby world channel
```

Expect `healthy` on `lobby`, `world`, `channel`, and running `website` /
`updater`. Look for `Server ready!` in logs.

---

## 6. Smoke from your PC

```bash
PUBLIC_IP=YOUR.ORACLE.PUBLIC.IP
curl -sI http://$PUBLIC_IP:3000/ | head -5
curl -sI http://$PUBLIC_IP:8765/ | head -5
curl -sI http://$PUBLIC_IP:8765/files/hashlist.dat | head -5
```

Client files (full checklist:
[guides/client-host-config.md](../guides/client-host-config.md)):

`ImagineUpdate-user.dat`:

```ini
[Setting]
BaseURL1 = http://YOUR.ORACLE.PUBLIC.IP:8765/files
Information = http://YOUR.ORACLE.PUBLIC.IP:8765/
```

`VersionData-user.txt` (or `VersionData.txt`):

```ini
[versions]
title = Oracle Private SMT
server = YOUR.ORACLE.PUBLIC.IP:10666
tag = local

[local]
webaccess.sdat
```

Also update `client-overlay/` the same way, then re-run
`build-updater-overlay.sh` and rsync `updater/` so the next client update does
not revert hosts.

---

## 7. Play checklist

1. Updater reaches hashlist (no connection refused).
2. Overlay downloads finish.
3. Play / direct launch hits lobby `10666`.
4. After character select, channel `14666` connects (`EXTERNAL_IP` correct).
5. Website account flows at `http://PUBLIC_IP:3000/` (HTTPS later).

---

## Updating later

| Change         | Build PC                     | VPS                                                  |
| -------------- | ---------------------------- | ---------------------------------------------------- |
| Game binaries  | `docker-push-hub.sh`         | `docker compose pull && docker compose up -d`        |
| Website        | `docker-push-website-hub.sh` | same                                                 |
| Client overlay | `build-updater-overlay.sh`   | rsync `updater/`                                     |
| Runtime DB     | backup / seed                | rsync `data/` or [backup-restore](backup-restore.md) |

After changing `EXTERNAL_IP`, recreate so the channel patch refreshes:

```bash
cd /opt/smt
docker compose up -d
```

---

## Security notes (MVP → harden next)

- Restrict SSH (`22`) and, if possible, admin-only ports to your home IP in the
  **VCN**.
- Keep `10999` on loopback (compose default). Website talks to `lobby:10999` on
  the Docker bridge.
- Prefer a tested backup before you invite players
  ([backup-restore.md](backup-restore.md)).
- DNS + HTTPS (Caddy/nginx + Let’s Encrypt) is the next hardening step; until
  then clients use raw `http://IP:3000` / `:8765`. After TLS, set website
  `SITE_URL=https://…` and `COOKIE_SECURE=true` ([phase16.md](phase16.md)).

---

## Current deploy (2026-09-04)

Host: `ubuntu@150.136.212.72` (`smtdeploy`), Ubuntu 24 amd64, Docker +
firewalld. Stack root: **`/opt/smt`**.

| Piece | Notes |
| --- | --- |
| Compose | `docker compose` in `/opt/smt` (Hub images) |
| Data | `/opt/smt/data` (SQLite + datastore + BinaryData) |
| Website data | `/opt/smt/website-data` (uid **1001** / nextjs) |
| Updater | `/opt/smt/updater` → `:8765` |
| Website | `:3000` (`SITE_URL=https://starcatpik.com`, `COOKIE_SECURE=true`) |
| HTTPS | Caddy profile in compose (`starcatpik.com` on `80`/`443`) |
| Backups | `/opt/smt/backups/`; cron **04:17 UTC** daily cold backup |
| Health | `/opt/smt/scripts-local/healthcheck.sh` every **5 min** → `logs/healthcheck.log` |

firewalld open: `22`, `10666`, `14666`, `8765`, `3000`, `80`, `443` (+
masquerade). Do **not** publish `10999` / `18666`.

Public smoke (from outside OCI): `https://starcatpik.com` → 200, updater
`https://starcatpik.com/files/hashlist.dat` → 200, TCP `10666` / `14666` connect.

Automatic HTTPS is handled by Caddy in Docker (`compose --profile https up -d`)
with Let's Encrypt certificates saved in named volume `caddy-data`.

---

## Backups and restore (on this VPS)

Cold backup (brief COMP downtime):

```bash
cd /opt/smt
./scripts/backup.sh --data ./data --compose . --out ./backups
```

Cron already runs that daily. Archives: `backups/smt-runtime-*.tar.gz` +
`.sha256`. First backup verified 2026-09-04 (sha256 OK; MANIFEST + SQLite
extract drill).

Full data restore (keeps current images; **overwrites** `data/` after renaming
it to `data.bak-*`):

```bash
cd /opt/smt
./scripts/restore.sh \
  --archive ./backups/smt-runtime-YYYYMMDD-HHMMSS.tar.gz \
  --data ./data --compose . --yes
docker compose ps
docker compose logs --tail=30 lobby world channel
```

Optional: `--restore-env` to also restore `.env` from the archive.

Off-box copy (recommended before inviting players):

```bash
rsync -a /opt/smt/backups/ you@backup-host:smt-oracle-backups/
```

Details: [backup-restore.md](backup-restore.md).

---

## Monitoring

```bash
tail -f /opt/smt/logs/healthcheck.log
# OK lines: disk%, website/updater HTTP, latest backup name
# FAIL lines: down services, unhealthy, HTTP errors, stale/missing backup
```

Manual check:

```bash
/opt/smt/scripts-local/healthcheck.sh; echo $?
df -h /
cd /opt/smt && docker compose ps
```

---

## Rollback and incident recovery

| Situation | Action |
| --- | --- |
| Bad image pull / broken binary | Pin previous Hub tag in `.env` (`COMP_IMAGE=…`, `WEBSITE_IMAGE=…`) then `docker compose pull && docker compose up -d` |
| Bad data / datastore edit | `./scripts/restore.sh --archive … --yes` then confirm healthy + login |
| Compose / firewalld bridge mess after reboot | See §2 (`compose down`, prune network, restart firewalld → docker → `up -d`) |
| Whole VM ruined | Restore the **OCI boot volume snapshot** taken before Phase 15 work, then re-copy a fresh deploy zip if needed |
| Website SQLite permission errors | `chown -R 1001:1001 /opt/smt/website-data` and recreate `website` |
| Channel unreachable after IP change | Set `EXTERNAL_IP` in `.env` to the public IP/DNS clients use, then `docker compose up -d` |

Reboot recovery (expected path):

```bash
ssh ubuntu@PUBLIC_IP
sudo systemctl is-active firewalld docker
cd /opt/smt && docker compose ps
# if containers did not return: docker compose up -d
```

Incident checklist:

1. Note time + symptom (login fail, updater 404, website 500, channel drop).
2. `docker compose ps` + `logs --tail=80 lobby world channel website`.
3. `tail -50 /opt/smt/logs/healthcheck.log`.
4. Prefer **restore archive** or **image pin** over improvising on live `data/`.
5. After fix: one cold backup, confirm website + hashlist + lobby TCP from outside.

---

## Done when

- [x] VCN + firewalld allow 22 / 10666 / 14666 / 8765 / 3000
- [x] `docker compose ps` all healthy
- [x] Website + updater reachable on the public IP
- [ ] Clean client updates and logs in from outside your LAN *(operator play smoke)*
- [x] Cold backup taken and restore path known
- [x] DNS + HTTPS for website and updater (`starcatpik.com` via Caddy profile)
