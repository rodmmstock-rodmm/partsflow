# PartsFlow V7.4 — RFQ & PO Balance Email Workflow

V7.4 adds a Google Workspace Gmail workflow for sending RFQs from selected
Orders, keeping every vendor email/thread, and following price and delivery
dates from PO Balance. Migration `0016` is additive: the legacy Order
`quotation` field and existing Order rows are preserved.

Production Gmail setup uses:

- `GOOGLE_GMAIL_OAUTH_CLIENT_JSON` or `GOOGLE_GMAIL_OAUTH_CLIENT_FILE`
- `GOOGLE_GMAIL_OAUTH_REDIRECT_URI`

The redirect URI must end at `/api/gmail/oauth/callback/` and be registered in
the Google Cloud OAuth client. An authorized administrator can then connect the
corporate sender account from the PO Balance page.

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
