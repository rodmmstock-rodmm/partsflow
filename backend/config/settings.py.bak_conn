import os
from pathlib import Path
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-only-change-me")
DEBUG = os.getenv("DEBUG", "1") == "1"
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.admin","django.contrib.auth","django.contrib.contenttypes",
    "django.contrib.sessions","django.contrib.messages","django.contrib.staticfiles",
    "corsheaders","rest_framework","core",
]
MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware","django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware","django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware","django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware","django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF="config.urls"
TEMPLATES=[{"BACKEND":"django.template.backends.django.DjangoTemplates","DIRS":[],"APP_DIRS":True,
"OPTIONS":{"context_processors":["django.template.context_processors.request","django.contrib.auth.context_processors.auth",
"django.contrib.messages.context_processors.messages"]}}]
WSGI_APPLICATION="config.wsgi.application"
DATABASES={"default": dj_database_url.config(default=os.getenv("DATABASE_URL","sqlite:///db.sqlite3"), conn_max_age=600)}
LANGUAGE_CODE="en-us"; TIME_ZONE="Asia/Bangkok"; USE_I18N=True; USE_TZ=True
STATIC_URL="static/"
DEFAULT_AUTO_FIELD="django.db.models.BigAutoField"
CORS_ALLOW_ALL_ORIGINS=True
REST_FRAMEWORK={"DEFAULT_PERMISSION_CLASSES":["rest_framework.permissions.IsAuthenticatedOrReadOnly"]}
