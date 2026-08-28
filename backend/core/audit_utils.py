from .models import AuditLog


def audit(employee, action, entity, entity_id="", detail=None):
    return AuditLog.objects.create(
        employee=employee,
        action=action,
        entity=entity,
        entity_id=str(entity_id or ""),
        detail=detail or {},
    )


def changed_fields(before, after, fields):
    result = {}
    for field in fields:
        old = before.get(field)
        new = after.get(field)
        if str(old if old is not None else "") != str(new if new is not None else ""):
            result[field] = {"old": old, "new": new}
    return result
