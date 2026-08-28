"""
PartsFlow Django configuration package.
Automatically load backend/.env before config.settings is evaluated.
"""
from .env_loader import load_backend_env

load_backend_env()
