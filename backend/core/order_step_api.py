from django.db import transaction
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from .audit_utils import audit
from .auth_api import permissions_for, require_permission
from .models import OrderProject, OrderStep


def _same_department(actor, project):
    actor_department = str(getattr(actor, "department", "") or "").strip().upper()
    project_department = str(getattr(project, "department", "") or "").strip().upper()
    return bool(
        actor_department
        and project_department
        and actor_department == project_department
    )


@csrf_exempt
@api_view(["POST"])
@permission_classes([AllowAny])
def confirm_step(request, pk, step_pk):
    """Confirm an Order Step using the same authorization rule as the UI.

    A user may confirm when they have the dedicated confirmation permission,
    can manage Order Projects, or belong to the same department as the Project.
    The department fallback is intentionally scoped to this Project only.
    """
    actor, err = require_permission(request)
    if err:
        return err

    project = OrderProject.objects.filter(pk=pk, active=True).first()
    if not project:
        return Response({"detail": "ไม่พบ Project"}, status=404)

    perms = permissions_for(actor)
    allowed = (
        perms.get("can_confirm_order_step")
        or perms.get("can_manage_order_projects")
        or _same_department(actor, project)
    )
    if not allowed:
        return Response({"detail": "คุณไม่มีสิทธิ์ใช้งานส่วนนี้"}, status=403)

    with transaction.atomic():
        step = (
            OrderStep.objects.select_for_update()
            .filter(pk=step_pk, project=project)
            .first()
        )
        if not step:
            return Response({"detail": "ไม่พบ Step"}, status=404)
        if step.status != OrderStep.STATUS_WAIT_CONFIRM:
            return Response(
                {"detail": "Step นี้ไม่ได้อยู่ในสถานะรอ Confirm"},
                status=400,
            )

        step.status = OrderStep.STATUS_ORDERING
        step.confirmed_by_employee = actor
        step.confirmed_at = timezone.now()
        step.save(
            update_fields=[
                "status",
                "confirmed_by_employee",
                "confirmed_at",
                "updated_at",
            ]
        )
        audit(
            actor,
            "CONFIRM_STEP",
            "OrderStep",
            step.id,
            {
                "confirmed_by": actor.name,
                "authorization": (
                    "permission"
                    if perms.get("can_confirm_order_step")
                    else "project_manager"
                    if perms.get("can_manage_order_projects")
                    else "same_department"
                ),
            },
        )

    return Response(
        {
            "id": str(step.id),
            "status": step.status,
            "status_label": dict(OrderStep.STATUS_CHOICES).get(step.status),
            "confirmed_by": actor.name,
            "confirmed_at": timezone.localtime(step.confirmed_at).isoformat(),
        }
    )
