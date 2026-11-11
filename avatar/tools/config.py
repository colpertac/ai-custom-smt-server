"""Paths for the avatar renderer tools.

Everything derived from the game client (decoded tables, palette, converted
models) is written under BUILD_DIR, which is gitignored. Override any path
with the environment variable of the same name.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
AVATAR_ROOT = os.path.dirname(HERE)
REPO_ROOT = os.path.dirname(AVATAR_ROOT)

# Imagine client install (read only).
IMAGINE_CLIENT_DIR = os.environ.get(
    "IMAGINE_CLIENT_DIR", "/home/cat/software/smt/game/reimagine"
)
AVATAR_DIR = os.path.join(IMAGINE_CLIENT_DIR, "Avatar")
BINARYDATA_DIR = os.path.join(IMAGINE_CLIENT_DIR, "BinaryData")
CLIENT_EXE = os.path.join(IMAGINE_CLIENT_DIR, "ImagineClient.exe")

# NifTools schema (GPL-3.0; not vendored). NifSkope ships a copy.
NIF_XML = os.environ.get("NIF_XML", "/home/cat/software/nifskope-linux/nif.xml")

# comp_hack tools: comp_decrypt / comp_bdpatch.
COMP_TOOLS_DIR = os.environ.get(
    "COMP_TOOLS_DIR", os.path.join(REPO_ROOT, "ops", "comp-tools")
)

# World DB to read characters from (opened read only).
WORLD_DB = os.environ.get(
    "WORLD_DB",
    os.path.join(os.path.dirname(REPO_ROOT), "comp_hack", "runtime", "database", "world.sqlite3"),
)

BUILD_DIR = os.environ.get("AVATAR_BUILD_DIR", os.path.join(AVATAR_ROOT, "build"))
TABLES_DIR = os.path.join(BUILD_DIR, "tables")
