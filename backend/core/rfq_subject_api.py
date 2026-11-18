from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .auth_api import require_permission
from .models import EmployeeRFQSubjectSetting


ALLOWED_TOPIC_CODES = {"RFQ", "PRICE_UPDATE", "DELIVERY_DATE"}


@csrf_exempt
@api_view(["GET", "PATCH"])
@permission_classes([AllowAny])
def rfq_subject_settings(request):
    employee, error = require_permission(request, "can_create_rfq")
    if error:
        return error

    if request.method == "GET":
        rows = EmployeeRFQSubjectSetting.objects.filter(
            employee=employee,
        ).values("topic_code", "phrase")
        return Response({"results": list(rows)})

    topic_code = request.data.get("topic_code", "RFQ")
    phrase = request.data.get("phrase", "")
    if not isinstance(topic_code, str) or not isinstance(phrase, str):
        return Response({"detail": "หัวข้อและข้อความ Subject ต้องเป็นข้อความ"}, status=400)
    topic_code = topic_code.strip().upper()
    phrase = phrase.strip()
    if topic_code not in ALLOWED_TOPIC_CODES:
        return Response({"detail": "รหัสหัวข้อไม่ถูกต้อง"}, status=400)
    if len(phrase) > 250:
        return Response({"detail": "ข้อความ Subject ต้องไม่เกิน 250 ตัวอักษร"}, status=400)

    saved, _ = EmployeeRFQSubjectSetting.objects.update_or_create(
        employee=employee,
        topic_code=topic_code,
        defaults={"phrase": phrase},
    )
    return Response({"topic_code": saved.topic_code, "phrase": saved.phrase})
