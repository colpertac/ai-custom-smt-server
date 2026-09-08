# SMT Imagine localization (community repo)

Public, forkable localization workspace:

**https://github.com/colpertac/smt-imagine-l10n**

## Split

| Repo | Role |
| --- | --- |
| [`smt-imagine-l10n`](https://github.com/colpertac/smt-imagine-l10n) | Catalog, locales, glossaries, EN `strings/*.tsv`, batch notes, release metadata. Community PRs. |
| **This repo** (`ai-custom-smt-server`) | Rebuild `.sbin` / deploy to game client, `client-source/`, private `translation/extract` + `build` mirrors. |

Local operator workspace remains gitignored under `translation/` (full XML/bins).
Treat `smt-imagine-l10n` as the **source of truth for community string edits**.

## Operator sync (typical)

```bash
# sibling clone
cd /home/cat/repos/smt
git clone https://github.com/colpertac/smt-imagine-l10n.git

# after merging PRs there: apply TSV → XML in translation/ or client-source/,
# then comp_bdpatch + encrypt + copy to reimagine; refresh matrix:
cd ai_custom_smt_server
python3 translation/scripts/deploy-matrix.py
python3 translation/scripts/release-snapshot.py --lang en
# optionally copy release/ + matrix back into smt-imagine-l10n and push
```

## Start another language

Fork or branch in **smt-imagine-l10n** (`locales/<lang>/` + `strings/<lang>/`).
Do not put full client binaries in either public tree.
