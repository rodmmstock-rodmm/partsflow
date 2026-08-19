from django.db import transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from django.db.models import Q
import json, uuid
from .models import Part, Inventory, StockTransaction

def body(request):
    return json.loads(request.body.decode("utf-8") or "{}")

@require_GET
def app_parts(request):
    q=request.GET.get("q","").strip()
    qs=Part.objects.filter(active=True).select_related("unit","maker","location")
    if q: qs=qs.filter(Q(sku__icontains=q)|Q(name__icontains=q)|Q(description__icontains=q))
    return JsonResponse([{"id":str(p.id),"sku":p.sku,"name":p.name,
      "maker":p.maker.name if p.maker else "","unit":p.unit.code if p.unit else "",
      "location":p.location.code if p.location else "","min_stock":str(p.min_stock)}
      for p in qs[:500]],safe=False)

@require_GET
def app_inventory(request):
    q=request.GET.get("q","").strip()
    qs=Inventory.objects.select_related("part","location")
    if q: qs=qs.filter(Q(part__sku__icontains=q)|Q(part__name__icontains=q))
    return JsonResponse([{"id":str(i.id),"part_id":str(i.part.id),"sku":i.part.sku,
      "part_name":i.part.name,"location":i.location.code if i.location else "",
      "quantity":str(i.quantity),"min_stock":str(i.part.min_stock),
      "status":"LOW" if i.quantity<=i.part.min_stock else "OK"} for i in qs[:1000]],safe=False)

def change(request, kind):
    b=body(request)
    try: qty=float(b["quantity"])
    except: return JsonResponse({"error":"invalid quantity"},status=400)
    if qty<=0: return JsonResponse({"error":"quantity must be > 0"},status=400)
    part=Part.objects.get(id=b["part_id"]); loc_id=b.get("location_id") or part.location_id
    with transaction.atomic():
        inv=Inventory.objects.select_for_update().filter(part=part,location_id=loc_id).first()
        if kind=="ISSUE" and (not inv or float(inv.quantity)<qty):
            return JsonResponse({"error":"INSUFFICIENT_STOCK","available":str(inv.quantity if inv else 0)},status=409)
        if not inv: inv=Inventory.objects.create(part=part,location_id=loc_id,quantity=0)
        inv.quantity = inv.quantity + qty if kind=="RECEIVE" else inv.quantity - qty
        inv.save()
        tx=StockTransaction.objects.create(transaction_no="APP-"+uuid.uuid4().hex[:16].upper(),
          part=part,location=inv.location,transaction_type=kind,quantity=qty,
          transaction_date=parse_datetime(b["transaction_date"]) if b.get("transaction_date") else timezone.now(),
          remark=b.get("remark",""),legacy_source="APPSHEET",legacy_id=b.get("request_id",""))
    return JsonResponse({"ok":True,"transaction_id":str(tx.id),"remaining":str(inv.quantity)})

@csrf_exempt
@require_POST
def app_issue(request): return change(request,"ISSUE")

@csrf_exempt
@require_POST
def app_receive(request): return change(request,"RECEIVE")
