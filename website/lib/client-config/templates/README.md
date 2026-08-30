# Client connection templates

Seeded from a local Reimagine client tree for reference / smoke tests.

Generation for admin **Client prep** builds files programmatically (see
`lib/client-config-pack.ts`) and encrypts `webaccess` via the ops sidecar
(`comp_encrypt`).

| File | Role |
| --- | --- |
| `ImagineClient.dat` | `-ip` / `-port` (CRLF) |
| `ImagineUpdate*.dat` | Updater BaseURL |
| `VersionData.txt` | Lobby `server =` |
| `webaccess.dat` | Plaintext login URL (encrypt → `.sdat`) |
| `webaccess.sdat` | Sample ciphertext from seed client |
