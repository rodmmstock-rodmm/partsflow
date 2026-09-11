#!/usr/bin/env python
import os
import shutil
import subprocess
import sys
from pathlib import Path

from django.core.management import execute_from_command_line

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")


def build_frontend_for_django():
    """Build the Vite app for same-origin production serving via Django/WhiteNoise."""
    backend_dir = Path(__file__).resolve().parent
    repo_root = backend_dir.parent
    frontend_dir = repo_root / "frontend"
    dist_dir = frontend_dir / "dist"
    template_dir = backend_dir / "templates" / "spa"
    static_dir = backend_dir / "static" / "partsflow"

    if not (frontend_dir / "package.json").exists():
        return

    env = os.environ.copy()
    env["VITE_API_BASE_URL"] = "/api"

    subprocess.run(["npm", "ci"], cwd=frontend_dir, env=env, check=True)
    subprocess.run(
        ["npm", "run", "build", "--", "--base=/static/partsflow/"],
        cwd=frontend_dir,
        env=env,
        check=True,
    )

    template_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(dist_dir / "index.html", template_dir / "index.html")

    if static_dir.exists():
        shutil.rmtree(static_dir)
    static_dir.mkdir(parents=True, exist_ok=True)

    for item in dist_dir.iterdir():
        if item.name == "index.html":
            continue
        destination = static_dir / item.name
        if item.is_dir():
            shutil.copytree(item, destination)
        else:
            shutil.copy2(item, destination)


if len(sys.argv) > 1 and sys.argv[1] == "collectstatic" and os.getenv("PARTSFLOW_BUILD_FRONTEND", "1") != "0":
    build_frontend_for_django()

execute_from_command_line(sys.argv)
