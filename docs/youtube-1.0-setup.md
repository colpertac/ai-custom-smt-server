# YouTube — SMT all-in-one 1.0 setup (~10–15 min)

Recording guide for a short install video. The install script does the heavy
lifting; most of the runtime is the web UI.

**Install scripts:** [deploy/install.sh](../deploy/install.sh) (Linux/mac),
[deploy/install.ps1](../deploy/install.ps1) (Windows + Docker Desktop).

---

## Cold open (≈30s)

> “Today we stand up a private SMT server with one script, then finish in the
> browser — Client prep, download link, play.”

Show end state flash: `/download` button + character in-game (optional B-roll).

---

## 1. Prereqs (1–2 min)

On screen checklist:

| Need | Notes |
| --- | --- |
| Docker | [Get Docker](https://docs.docker.com/get-docker/) / Docker Desktop on Windows |
| Ports | TCP **10666** lobby, **14666** channel, **8765** updater, **3000** website |
| Cloud | If Oracle/AWS/etc.: open the same ports in the **panel** security list (script cannot do this) |

Spoken:

> “Install Docker yourself on any OS. We do not auto-install it — the script
> just checks and aborts if it is missing.”

Skip a long SSH tour. One shot of the VPS console firewall table is enough.

---

## 2. Run install (≈2 min)

From the repo (or release that includes `deploy/` + `ops/`):

```bash
cd deploy
./install.sh --ip YOUR.PUBLIC.IP
# optional: --domain play.example.com
```

Windows (PowerShell):

```powershell
cd deploy
.\install.ps1 -Ip YOUR.PUBLIC.IP
```

Timelapse `docker compose pull` / build. Cut back when containers are up.

Show the script’s printed URLs (website / updater / lobby / channel).

---

## 3. Admin in the browser (1–2 min)

1. Open `http://YOUR.IP:3000`
2. Sign in with default **`admin` / `admin123`** — optional password-change
   modal (you can skip and keep `admin123` for lab / guide setups)
3. **Admin → Overview** — ops healthy, servers as expected

Spoken:

> “Factory login is admin / admin123. First sign-in offers a password change —
> skip if you're following a guide, or set your own.”

---

## 4. First boot content (≈2 min, skip if pre-seeded)

Only if runtime is empty:

1. **Admin → Game files** — upload content / BinaryData / maps as needed
2. Start servers when prompted

If you ship a pre-filled `data/` + `updater/` in the release, say so and skip.

---

## 5. Client prep (≈2 min)

1. **Admin → Download → Client prep** — enter IP (and domain if any)
2. Download `client-config.zip`
3. Drop files into a stock client folder
4. Zip the **full** client → upload MediaFire / Drive
5. Paste URL under **Player download link** → Save

Spoken:

> “Players never edit config files. That zip is cook-prep only.”

---

## 6. Player path (≈1 min)

Incognito / second browser:

1. `/download` → **Download client**
2. Unzip → run updater / client
3. Optional: quick login success shot

---

## 7. Outro (≈30s)

- Link description: repo / Discord / `docs/oracle-vps.md` for VPS firewall detail
- “Day-two ops stay in Admin — shops, news, game files, Client prep.”

---

## Edit tips

- Prefer **flags** (`--ip`) over interactive prompts for clean takes.
- Cut dead waits; keep UI clicks at normal speed.
- Total target **10–15 minutes**; longer only if you demo first-boot zips in full.
