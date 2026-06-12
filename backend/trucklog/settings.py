"""
Django settings for the trucklog HOS route-planner project.

Configuration is intentionally minimal: the app is a stateless JSON API and
keeps no domain data in the database. Geocoding results are cached on the
filesystem so we stay friendly to the free Nominatim service.
"""
from pathlib import Path
import os

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from backend/.env if present (ORS_API_KEY, etc.)
load_dotenv(BASE_DIR / ".env")

SECRET_KEY = os.environ.get(
    "DJANGO_SECRET_KEY", "dev-insecure-key-change-me-in-production"
)

DEBUG = os.environ.get("DJANGO_DEBUG", "1") == "1"

ALLOWED_HOSTS = os.environ.get(
    "DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,0.0.0.0"
).split(",")

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "trips",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.security.SecurityMiddleware",
]

ROOT_URLCONF = "trucklog.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {"context_processors": []},
    },
]

WSGI_APPLICATION = "trucklog.wsgi.application"

# A database is required by Django machinery even though no domain data is
# persisted. SQLite keeps local setup zero-config.
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# Filesystem cache for geocoding lookups (persists between requests/runs).
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.filebased.FileBasedCache",
        "LOCATION": str(BASE_DIR / ".geocode_cache"),
        "TIMEOUT": 60 * 60 * 24 * 30,  # 30 days
    }
}

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
TIME_ZONE = "UTC"

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": ["rest_framework.parsers.JSONParser"],
}

# --- CORS (allow the Vite dev server to call the API in local development) ---
CORS_ALLOWED_ORIGINS = os.environ.get(
    "CORS_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")
CORS_ALLOW_ALL_ORIGINS = os.environ.get("CORS_ALLOW_ALL_ORIGINS", "0") == "1"

# --- Routing provider configuration ---
# If ORS_API_KEY is set we use OpenRouteService; otherwise a haversine/55mph
# mock route keeps the app fully functional offline.
ORS_API_KEY = os.environ.get("ORS_API_KEY", "").strip()
NOMINATIM_USER_AGENT = os.environ.get(
    "NOMINATIM_USER_AGENT", "trucklog-hos-planner/1.0 (demo)"
)
