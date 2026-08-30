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

## Done when

- [ ] VCN + firewalld allow 22 / 10666 / 14666 / 8765 / 3000
- [ ] `docker compose ps` all healthy
- [ ] Website + updater reachable on the public IP
- [ ] Clean client updates and logs in from outside your LAN
- [ ] Cold backup taken and restore path known
