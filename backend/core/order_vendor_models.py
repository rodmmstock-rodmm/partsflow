from django.db import models

from .models import Employee, OrderRecord, Supplier, UUIDMixin


class OrderVendor(UUIDMixin):
    """Vendor candidate attached to a normal Order.

    RFQ and follow-up workflows belong to Order Step. Normal Orders keep only
    a simple vendor shortlist with the server-side time each vendor was added.
    """

    order = models.ForeignKey(
        OrderRecord,
        on_delete=models.CASCADE,
        related_name="vendor_candidates",
    )
    vendor = models.ForeignKey(
        Supplier,
        on_delete=models.PROTECT,
        related_name="order_candidates",
    )
    added_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="added_order_vendors",
    )

    class Meta:
        ordering = ["created_at", "vendor__code"]
        constraints = [
            models.UniqueConstraint(
                fields=["order", "vendor"],
                name="uniq_order_vendor_candidate",
            )
        ]

    def __str__(self):
        return f"{self.order.order_number} / {self.vendor.code}"
