# Client connection templates

Seeded from a local Reimagine client tree for reference / smoke tests.

Generation for admin **Client prep** builds files programmatically (see
`lib/client-config-pack.ts`) and encrypts `webaccess` via the ops sidecar
(`comp_encrypt`).

| File | Role |
| --- | --- |
| `ImagineClient.dat` | `-ip` / `-port` (CRLF) |
| `ImagineUpdate*.dat` | Updater BaseURL |
| `VersionData.txt` | Lobby `server =` entries (one per dropdown option) |
| `webaccess.sdat.<tag>` | Encrypted login URL per VersionData tag |
| `webaccess.sdat` | Copy of the primary tag’s webaccess file |
