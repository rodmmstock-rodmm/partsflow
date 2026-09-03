# PartsFlow V7.4 — Project Quotation & Order Conversion Workflow

V7.4 records RFQs from selected Orders after Purchasing sends email in Gmail
manually. The employee records the Vendor, recipient, sent date, CC list, and
the email URL. Price and delivery follow-ups are also recorded with their email
URLs from PO Balance. PartsFlow does not connect to, send through, or sync Gmail.
Migration `0016` remains additive: the legacy Order `quotation` field and
existing Order rows are preserved.

Migration `0017` adds a quotation-only stage inside each Project/Step. An
authorized employee can select a received Vendor quotation and create a linked
real Order without overwriting the quotation source or RFQ/PO Balance history.
Quotation-only rows are excluded from real Order, Safety Stock, Dashboard and
Stock calculations until conversion. The conversion records the employee,
timestamp, RFQ, Vendor, price, currency, lead time and approved quantity.

The UI uses `Part ID` as the visible label. The API continues to use `item_id`
where required for backward compatibility, and Excel imports accept both
`Part ID` and the legacy `Item ID` header.

No Gmail OAuth credentials or Gmail API configuration are required.

## Original ROD MM STOCK migration

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
