from . import order_api
from .models import Machine


_INSTALLED = False


def _extract_machine_ids(data):
    if "machine_ids" in data:
        raw = data.get("machine_ids")
        if raw is None:
            raw = []
        if isinstance(raw, str):
            raw = [item.strip() for item in raw.split(",") if item.strip()]
        if not isinstance(raw, (list, tuple)):
            raise ValueError("MACHINE NAME หลายรายการไม่ถูกต้อง")
        values = raw
    elif "machine_id" in data:
        value = data.get("machine_id")
        values = [value] if value else []
    else:
        return None

    seen = set()
    result = []
    for value in values:
        key = str(value or "").strip()
        if key and key not in seen:
            seen.add(key)
            result.append(key)
    return result


def _resolve_machines(machine_ids):
    if not machine_ids:
        raise ValueError("กรุณาเลือก MACHINE NAME อย่างน้อย 1 รายการ")
    try:
        rows = Machine.objects.filter(pk__in=machine_ids, active=True)
        by_id = {str(row.id): row for row in rows}
    except (TypeError, ValueError):
        raise ValueError("มี MACHINE NAME บางรายการไม่ถูกต้อง")

    ordered = [by_id.get(value) for value in machine_ids]
    if any(row is None for row in ordered):
        raise ValueError("มี MACHINE NAME บางรายการไม่ถูกต้อง")
    return ordered


def install():
    global _INSTALLED
    if _INSTALLED:
        return
    _INSTALLED = True

    original_apply = order_api.apply_order_info
    original_json = order_api.order_json
    original_queryset = order_api.order_queryset

    def multi_apply_order_info(order, data, *args, **kwargs):
        machine_ids = _extract_machine_ids(data)
        normalized = data
        machines = None

        if machine_ids is not None:
            machines = _resolve_machines(machine_ids)
            try:
                normalized = data.copy()
            except AttributeError:
                normalized = dict(data)
            # Keep the first selected machine in the legacy FK so existing
            # stock/project/RFQ code continues to work without behavioral
            # changes. The complete list is saved after OrderRecord.save().
            normalized["machine_id"] = str(machines[0].id)

        result = original_apply(order, normalized, *args, **kwargs)
        if machines is not None:
            order._pending_machine_ids = [str(row.id) for row in machines]
        return result

    def multi_order_json(order):
        payload = original_json(order)
        selections = list(order.machine_selections.all())
        machine_rows = [item.machine for item in selections if item.machine_id]
        if not machine_rows and order.machine:
            machine_rows = [order.machine]

        payload["machine_ids"] = [str(row.id) for row in machine_rows]
        payload["machines"] = [
            {
                "id": str(row.id),
                "code": row.code,
                "name": row.name,
                "location": row.location,
            }
            for row in machine_rows
        ]
        payload["machine_count"] = len(machine_rows)
        payload["machine_codes"] = ", ".join(row.code for row in machine_rows)
        payload["machine_names"] = ", ".join(row.name for row in machine_rows)
        return payload

    def multi_order_queryset():
        return original_queryset().prefetch_related("machine_selections__machine")

    order_api.apply_order_info = multi_apply_order_info
    order_api.order_json = multi_order_json
    order_api.order_queryset = multi_order_queryset
