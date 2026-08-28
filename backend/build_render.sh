#!/usr/bin/env bash
set -o errexit
python -m pip install --upgrade pip
pip install -r requirements.render.txt
python manage.py collectstatic --no-input
python manage.py migrate
