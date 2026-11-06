from django.core.management.base import BaseCommand

from core.models import ToolingVehicleKey


class Command(BaseCommand):
    help = "Create missing starter keys for Tooling vehicles 1-13."

    def handle(self, *args, **options):
        created = 0
        for vehicle_number in range(1, 14):
            _, was_created = ToolingVehicleKey.objects.get_or_create(
                vehicle_number=vehicle_number,
                defaults={
                    "label": f"กุญแจรถเครื่องมือหมายเลข {vehicle_number}",
                    "remark": "",
                    "active": True,
                },
            )
            created += int(was_created)

        self.stdout.write(
            self.style.SUCCESS(
                f"ตรวจสอบกุญแจรถเครื่องมือ 1-13 แล้ว (สร้างใหม่ {created} รายการ)"
            )
        )
