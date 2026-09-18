from django.conf import settings
from django.core.cache import cache


OPTIONS_CACHE_KEY = "partsflow:api:options:v2"


def get_cached_options():
    try:
        return cache.get(OPTIONS_CACHE_KEY)
    except Exception:
        # A cache outage must never make the operational API unavailable.
        return None


def set_cached_options(payload):
    try:
        cache.set(
            OPTIONS_CACHE_KEY,
            payload,
            timeout=getattr(settings, "OPTIONS_CACHE_TTL", 600),
        )
    except Exception:
        pass


def invalidate_options_cache():
    try:
        cache.delete(OPTIONS_CACHE_KEY)
    except Exception:
        pass
