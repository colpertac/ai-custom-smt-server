# Client + server host/IP checklist

COMP splits “where is the server?” across several files. Changing LAN/public IP
(e.g. `127.0.0.1` → `192.168.0.230` → Oracle) means updating **more than one
place**. This is how COMP’s updater + client are designed, not a quirk of our
Docker stack.

Prefer **user override** files so Settings → Save / stock translations do not
wipe your URLs:

| Prefer | Overwrites / ignored if present |
| --- | --- |
| `ImagineUpdate-user.dat` | `ImagineUpdate.dat` |
| `VersionData-user.txt` | `VersionData.txt` |

---

## What each file controls

| File (client dir unless noted) | Purpose | Example value |
| --- | --- | --- |
| **`VersionData.txt`** or **`VersionData-user.txt`** | Lobby address for **Play / direct launch** (`server = host:10666`) | `server = 192.168.0.230:10666` |
| **`ImagineUpdate-user.dat`** | Updater download base (`BaseURL1`, `Information`) | `http://192.168.0.230:8765/files` |
| **`ImagineUpdate.dat`** | Same, but fragile (Settings can replace it) | same as user file |
| **`webaccess.sdat`** (from `webaccess.sdat.<tag>`) | In-game browser / shop / “login” web URLs | usually `127.0.0.1:10999` / site ports — optional for plain login |
| **Server `.env` → `EXTERNAL_IP`** | Channel address lobby tells the client after auth | `EXTERNAL_IP=192.168.0.230` |
| **Website** | Browser only (`http://HOST:3080`) | not read by `ImagineClient.exe` |

`ImagineClient.dat` is used by COMP’s **logger** tool to redirect the client; for
normal private-server play we use **`VersionData*.txt`**, not `ImagineClient.dat`.

---

## Minimum for “play on another host”

For game + updater on host `HOST` (Proxmox example `192.168.0.230`):

**1. Server (Docker `.env`)**

```bash
EXTERNAL_IP=HOST
```

Recreate channel after change: `docker compose up -d` (so ExternalIP patches).

**2. Client — lobby target**

`VersionData-user.txt` (recommended) or `VersionData.txt`:

```ini
[versions]
title = Local Private SMT
server = HOST:10666
tag = local

[local]
webaccess.sdat
```

**3. Client — updater target**

`ImagineUpdate-user.dat`:

```ini
[Setting]
BaseURL1 = http://HOST:8765/files
Information = http://HOST:8765/
```

**4. Overlay you publish** (so the next updater run does not revert clients)

Keep the same contents in:

- `client-overlay/VersionData.txt` (or ship `VersionData-user.txt`)
- `client-overlay/ImagineUpdate-user.dat`
- then `./scripts/build-updater-overlay.sh` and refresh the server’s `updater/` tree

---

## Optional / later

| Item | When it matters |
| --- | --- |
| `webaccess.sdat*.local` | In-game pages that hit lobby HTTP or a website |
| Website port in bookmarks | `WEBSITE_PORT` (e.g. 3080) — humans only |
| DNS / HTTPS | Phase 15 Oracle |

---

## Related docs

- Updater workflow: [updater.md](updater.md)
- Proxmox smoke: [../docs/proxmox-smoke.md](../docs/proxmox-smoke.md)
- Channel ExternalIP: [../docs/docker-hub.md](../docs/docker-hub.md)
