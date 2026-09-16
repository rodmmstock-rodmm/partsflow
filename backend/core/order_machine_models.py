from django.db import models
from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver
from django.utils import timezone

from .models import Machine, OrderRecord, UUIDMixin


class OrderMachine(UUIDMixin):
    """Machine selections attached to one Order.

    ``OrderRecord.machine`` remains the primary/legacy machine so existing
    stock, project, RFQ and reporting code keeps working unchanged. This
    model stores the complete ordered list when one Order applies to multiple
    machines.
    """

    order = models.ForeignKey(
        OrderRecord,
        on_delete=models.CASCADE,
        related_name="machine_selections",
    )
    machine = models.ForeignKey(
        Machine,
        on_delete=models.PROTECT,
        related_name="order_selections",
    )
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["order", "machine"],
                name="uniq_order_machine_selection",
            )
        ]

    def __str__(self):
        return f"{self.order.order_number} / {self.machine.code}"


def job_order_prefix(job):
    value = str(job or "").strip().upper()
    return {
        "REPAIR": "R",
        "MODIFY": "MO",
        "AUTOMATION": "A",
        "PM": "P",
    }.get(value, "G")


def new_order_number(instance):
    """Create JOB-YYMMDD-HHMMSS, adding a suffix only on a collision."""

    now = timezone.localtime(timezone.now())
    base = f"{job_order_prefix(instance.job)}-{now.strftime('%y%m%d')}-{now.strftime('%H%M%S')}"
    candidate = base
    sequence = 2
    existing = OrderRecord.objects.all()
    if instance.pk:
        existing = existing.exclude(pk=instance.pk)
    while existing.filter(order_number=candidate).exists():
        candidate = f"{base}-{sequence:02d}"
        sequence += 1
    return candidate


def _uses_legacy_generated_number(instance):
    """Return True only for numbers created by the old PartsFlow generator.

    Excel import can intentionally supply/re-use its own ORDER NUMBER. Those
    explicit numbers must be preserved. Old automatic PURCHASE rows used ORD-
    and PRJ- prefixes, so only those (or a blank value) are replaced with the
    new JOB/date/time format.
    """

    number = str(instance.order_number or "").strip().upper()
    return (
        not number
        or number.startswith("ORD-")
        or number.startswith("PRJ-")
    )


@receiver(pre_save, sender=OrderRecord)
def assign_generated_order_number(sender, instance, **kwargs):
    # Quotation-only QTN rows and explicit Excel/import numbers remain intact.
    # Existing Orders are never renumbered during an edit.
    if (
        instance._state.adding
        and instance.procurement_phase == OrderRecord.PROCUREMENT_PURCHASE
        and _uses_legacy_generated_number(instance)
    ):
        instance.order_number = new_order_number(instance)


def _normalize_pending_machine_ids(values):
    seen = set()
    result = []
    for value in values or []:
        key = str(value or "").strip()
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(key)
    return result


@receiver(post_save, sender=OrderRecord)
def sync_order_machine_selections(sender, instance, created, **kwargs):
    pending = getattr(instance, "_pending_machine_ids", None)

    # Old creation paths still set only OrderRecord.machine. Keep them fully
    # compatible by automatically creating a one-machine selection.
    if pending is None:
        if created and instance.machine_id:
            OrderMachine.objects.get_or_create(
                order=instance,
                machine_id=instance.machine_id,
                defaults={"position": 0},
            )
        return

    machine_ids = _normalize_pending_machine_ids(pending)
    OrderMachine.objects.filter(order=instance).exclude(machine_id__in=machine_ids).delete()

    for position, machine_id in enumerate(machine_ids):
        OrderMachine.objects.update_or_create(
            order=instance,
            machine_id=machine_id,
            defaults={"position": position},
        )

    try:
        delattr(instance, "_pending_machine_ids")
    except AttributeError:
        pass
