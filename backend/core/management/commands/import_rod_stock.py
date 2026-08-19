import re
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from openpyxl import load_workbook
from core.models import *

def s(v): return '' if v is None else str(v).strip()
def d(v):
    try: return Decimal(str(v).replace(',','').strip())
    except: return Decimal('0')
def rows(wb,name):
    ws=wb[name]; vals=list(ws.values)
    if not vals:return []
    h=[s(x) for x in vals[0]]
    return [dict(zip(h,r)) for r in vals[1:] if any(x is not None for x in r)]
class Command(BaseCommand):
    help='Import ROD MM STOCK master data.'
    def add_arguments(self,p): p.add_argument('xlsx'); p.add_argument('--dry-run',action='store_true')
    @transaction.atomic
    def handle(self,*a,**o):
        wb=load_workbook(o['xlsx'],data_only=True)
        for r in rows(wb,'NAME'):
            code=s(r.get('EMPLOYEE ID')) or s(r.get('NAME'))
            if code: Employee.objects.update_or_create(employee_code=code,defaults={'name':s(r.get('NAME')),'role':s(r.get('ROLE')),'legacy_source':'NAME','legacy_id':code})
        for r in rows(wb,'MC NAME'):
            code=s(r.get('MC')) or s(r.get('MACHINE')) or s(r.get('MC NAME'))
            name=s(r.get('NAME')) or code
            if code: Machine.objects.update_or_create(code=code,defaults={'name':name,'legacy_source':'MC NAME','legacy_id':code})
        for r in rows(wb,'STOCK'):
            sku=s(r.get('ITEM ID'))
            if not sku: continue
            un=s(r.get('UNIT')) or 'EA'; unit,_=Unit.objects.get_or_create(code=un,defaults={'name':un})
            mk=s(r.get('MAKER')); maker=None
            if mk: maker,_=Maker.objects.get_or_create(name=mk)
            vn=s(r.get('Vendor')); sup=None
            if vn: sup,_=Supplier.objects.get_or_create(code='V-'+re.sub(r'[^A-Za-z0-9]+','-',vn)[:60],defaults={'name':vn})
            loc=s(r.get('ADDRESS')); location=None
            if loc: location,_=Location.objects.get_or_create(code=loc,defaults={'name':loc,'legacy_source':'STOCK','legacy_id':loc})
            p,_=Part.objects.update_or_create(sku=sku,defaults={'name':s(r.get('PART NAME')) or sku,'description':s(r.get('PART DETAIL')),'maker':maker,'unit':unit,'default_supplier':sup,'location':location,'min_stock':d(r.get('MIN STOCK')),'reorder_qty':d(r.get('TO Order')),'vendor_lead_time_days':int(d(r.get('Lead Time V/D'))),'purchasing_lead_time_days':int(d(r.get('Lead Time Purchasing'))),'total_lead_time_days':int(d(r.get('Lead Time Total'))),'last_purchase_price':d(r.get('Price')),'remark':s(r.get('Remark')),'image_path':s(r.get('PIC')),'legacy_source':'STOCK','legacy_id':sku})
            inv,_=Inventory.objects.get_or_create(part=p,location=location,defaults={'quantity':d(r.get('REMAINING STOCK'))}); inv.quantity=d(r.get('REMAINING STOCK')); inv.save()
        if o['dry_run']: transaction.set_rollback(True); self.stdout.write(self.style.WARNING('DRY RUN: rolled back.'))
        else: self.stdout.write(self.style.SUCCESS(f'Imported Parts={Part.objects.count()}, Employees={Employee.objects.count()}, Machines={Machine.objects.count()}, Suppliers={Supplier.objects.count()}, Locations={Location.objects.count()}'))
