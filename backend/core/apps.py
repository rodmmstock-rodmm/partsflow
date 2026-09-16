from django.apps import AppConfig


class CoreConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "core"

    def import_models(self):
        super().import_models()
        # OrderMachine lives in a small extension module so the legacy
        # models.py file and all existing OrderRecord integrations can remain
        # backward-compatible.
        from . import order_machine_models  # noqa: F401

    def ready(self):
        # Install the compatibility wrapper after all models have been loaded.
        from . import order_multi_api
        order_multi_api.install()
