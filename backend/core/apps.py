from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def import_models(self):
        super().import_models()
        # Order extensions live in small modules so the legacy models.py file
        # and existing integrations remain backward-compatible.
        from . import order_machine_models  # noqa: F401
        from . import order_vendor_models  # noqa: F401

    def ready(self):
        # Install compatibility wrappers after all models have been loaded.
        from . import order_multi_api, order_vendor_api
        from . import signals  # noqa: F401

        order_multi_api.install()
        order_vendor_api.install()
