#!/usr/bin/env python3
"""Deploy the NetDaemon Toolkit custom component to the HA server and restart HA.

Usage:
  ND_HA_REMOTE=user@host ND_HA_CONFIG_DIR=/path/to/homeassistant/config \
    python panel/deploy.py

Environment variables (all optional, defaults assume a local HA on the same
host reachable via SSH as "homeassistant"):
  ND_HA_REMOTE      SSH target, e.g. "user@homeassistant.local"
  ND_HA_CONFIG_DIR  HA config directory on that host, e.g. "/config"
  ND_HA_CONTAINER   Docker container name to restart, default "homeassistant"
"""
import os
import subprocess
import sys
from pathlib import Path

DIR = Path(__file__).parent
COMPONENT_DIR = DIR / "custom_components" / "netdaemon_toolkit"

HA_SERVER = os.environ.get("ND_HA_REMOTE", "user@homeassistant.local")
HA_CONFIG_DIR = os.environ.get("ND_HA_CONFIG_DIR", "/config")
HA_CONTAINER = os.environ.get("ND_HA_CONTAINER", "homeassistant")
HA_COMPONENT_PATH = f"{HA_CONFIG_DIR}/custom_components/netdaemon_toolkit"


def run(cmd, **kwargs):
    return subprocess.run(cmd, **kwargs)


def main() -> None:
    print("=== NetDaemon Toolkit — Component Deploy ===\n")
    if not COMPONENT_DIR.exists():
        print(f"ERROR: {COMPONENT_DIR} not found.")
        sys.exit(1)

    # Recreate the target dir tree.
    subdirs = {
        f.parent.relative_to(COMPONENT_DIR).as_posix()
        for f in COMPONENT_DIR.rglob("*")
        if f.is_file()
    }
    mkdir_args = " ".join(f"{HA_COMPONENT_PATH}/{d}" for d in subdirs if d != ".")
    mkdir_cmd = f"mkdir -p {HA_COMPONENT_PATH} {mkdir_args}".strip()
    print(f"  Creating {HA_COMPONENT_PATH} ...", end=" ", flush=True)
    res = run(["ssh", HA_SERVER, mkdir_cmd], capture_output=True, text=True)
    if res.returncode != 0:
        print(f"ERROR: {res.stderr}")
        sys.exit(1)
    print("OK")

    for f in COMPONENT_DIR.rglob("*"):
        if f.is_dir():
            continue
        rel = f.relative_to(COMPONENT_DIR).as_posix()
        print(f"  Copy {rel} ...", end=" ", flush=True)
        res = run(f'scp "{f}" {HA_SERVER}:{HA_COMPONENT_PATH}/{rel}',
                  shell=True, capture_output=True, text=True)
        if res.returncode != 0:
            print(f"ERROR: {res.stderr}")
            sys.exit(1)
        print("OK")

    print("\n  Restarting Home Assistant ...", end=" ", flush=True)
    res = run(["ssh", HA_SERVER, f"docker restart {HA_CONTAINER}"],
              capture_output=True, text=True)
    if res.returncode != 0:
        print(f"ERROR: {res.stderr}")
        sys.exit(1)
    print("OK")
    print("\nDone. After restart: Settings -> Devices & Services -> Add "
          '"NetDaemon Toolkit".')


if __name__ == "__main__":
    main()
