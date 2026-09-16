from django.db import transaction
from django.db.models.deletion import ProtectedError
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .audit_utils import audit
from .auth_api import require_permission
from .models import OrderRecord
from .order_api import order_json


@csrf_exempt
@api_view(["DELETE"])
@permission_classes([AllowAny])
def permanent_delete_order(request, pk):
    actor, err = require_permission(request, "can_delete_order")
    if err:
        return err

    _, err = require_permission(request, "can_view_deleted_orders")
    if err:
        return err

    order = (
        OrderRecord.objects.select_related(
            "machine",
            "part",
            "part__maker",
            "part__unit",
            "vendor",
            "ordered_by",
            "person_in_charge",
            "recorded_by",
            "project",
            "step",
            "source_quotation_order",
            "source_rfq",
            "deleted_by_employee",
            "cancelled_by_employee",
            "completed_by_employee",
            "created_from_quotation_by_employee",
        )
        .filter(pk=pk, is_deleted=True)
        .first()
    )
    if not order:
        return Response(
            {"detail": "ไม่พบ Order ใน Deleted หรือรายการนี้ถูกลบถาวรไปแล้ว"},
            status=404,
        )

    snapshot = order_json(order)
    order_number = order.order_number
    order_id = order.id

    try:
        with transaction.atomic():
            audit(
                actor,
                "HARD_DELETE",
                "OrderRecord",
                order_id,
                {
                    "order_number": order_number,
                    "snapshot": snapshot,
                },
            )
            deleted_count, _ = order.delete()
    except ProtectedError:
        return Response(
            {
                "detail": (
                    "ลบถาวรไม่ได้ เนื่องจาก Order นี้ยังมีข้อมูลอื่นที่ระบบต้องเก็บอ้างอิงอยู่"
                )
            },
            status=409,
        )

    return Response(
        {
            "success": True,
            "order_number": order_number,
            "deleted_objects": deleted_count,
        }
    )
