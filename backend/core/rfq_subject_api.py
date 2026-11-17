from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .auth_api import require_permission
from .models import Supplier, SupplierRFQMessage


@csrf_exempt
@api_view(["GET", "PATCH"])
@permission_classes([AllowAny])
def supplier_rfq_message(request, pk):
    permission = "can_view_suppliers" if request.method == "GET" else "can_edit_supplier"
    employee, error = require_permission(request, permission)
    if error:
        return error

    supplier = Supplier.objects.filter(pk=pk).first()
    if not supplier:
        return Response({"detail": "ไม่พบ Vendor"}, status=404)

    if request.method == "GET":
        saved, _ = SupplierRFQMessage.objects.get_or_create(
            supplier=supplier,
            employee=employee,
            defaults={"message": supplier.rfq_message or ""},
        )
        return Response({"rfq_message": saved.message})

    message = request.data.get("rfq_message", "")
    if not isinstance(message, str):
        return Response({"detail": "RFQ Message ต้องเป็นข้อความ"}, status=400)

    saved, _ = SupplierRFQMessage.objects.update_or_create(
        supplier=supplier,
        employee=employee,
        defaults={"message": message},
    )
    return Response({"rfq_message": saved.message})


@csrf_exempt
@api_view(["GET", "PATCH"])
@permission_classes([AllowAny])
def supplier_rfq_subject(request, pk):
    employee, error = require_permission(request, "can_create_rfq")
    if error:
        return error

    supplier = Supplier.objects.filter(pk=pk, active=True).first()
    if not supplier:
        return Response({"detail": "ไม่พบ Vendor หรือ Vendor ถูกปิดใช้งาน"}, status=404)

    if request.method == "GET":
        saved = SupplierRFQMessage.objects.filter(
            supplier=supplier,
            employee=employee,
        ).values_list("subject_phrase", flat=True).first()
        return Response({"subject_phrase": saved or ""})

    phrase = request.data.get("subject_phrase", "")
    if not isinstance(phrase, str):
        return Response({"detail": "RFQ Subject ต้องเป็นข้อความ"}, status=400)
    phrase = phrase.strip()
    if len(phrase) > 250:
        return Response({"detail": "RFQ Subject ต้องไม่เกิน 250 ตัวอักษร"}, status=400)

    saved, _ = SupplierRFQMessage.objects.get_or_create(
        supplier=supplier,
        employee=employee,
        defaults={"message": supplier.rfq_message or ""},
    )
    saved.subject_phrase = phrase
    saved.save(update_fields=["subject_phrase", "updated_at"])
    return Response({"subject_phrase": saved.subject_phrase})
