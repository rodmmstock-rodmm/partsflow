# PartsFlow V3 — ROD MM STOCK Edition

This version uses the uploaded `ROD MM STOCK.xlsx` workbook as the migration source and normalizes its data into Supabase/PostgreSQL-friendly tables.

## Source sheets
- STOCK → Parts, makers, units, locations, suppliers, inventory
- NAME → Employees
- MC NAME → Machines
- RECEIVE → Receiving / stock transaction history (migration mapping prepared next)
- WITHDRAW → Issue stock transaction history (migration mapping prepared next)
- ORDER → Purchase Orders / PO Items (migration mapping prepared next)

Every migrated master record can preserve `legacy_source` and `legacy_id` for traceability.

## Codespaces
```bash
cd backend
pip install -r requirements.txt
python manage.py makemigrations
python manage.py migrate
python manage.py import_rod_stock "../ROD MM STOCK.xlsx" --dry-run
python manage.py import_rod_stock "../ROD MM STOCK.xlsx"
python manage.py runserver
```

The next migration pass should import the full historical RECEIVE/WITHDRAW/ORDER rows into normalized transaction/PO tables after column validation.
