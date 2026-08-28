from django.core.management.base import BaseCommand

from core.auth_api import PERMISSION_FIELDS
from core.models import RoleAccess


class Command(BaseCommand):
    help = "Ensure ADMIN role can access all PartsFlow features after the new permission fields are added."

    def handle(self, *args, **options):
        role = RoleAccess.objects.filter(role_name__iexact="ADMIN").first()
        if not role:
            role = RoleAccess.objects.create(role_name="ADMIN", display_name="ADMIN", active=True)
        for field in PERMISSION_FIELDS:
            setattr(role, field, True)
        role.active = True
        role.save()
        self.stdout.write(self.style.SUCCESS("ADMIN permissions: all enabled"))
