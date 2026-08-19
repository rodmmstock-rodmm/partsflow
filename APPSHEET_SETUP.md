# AppSheet + Supabase

Supabase PostgreSQL is the single source of truth.

AppSheet is for mobile/field workflows:
- barcode/QR scan
- stock lookup
- issue/receive
- photos and notes

PartsFlow is for:
- purchasing / PR / RFQ / quotations / PO
- supplier and machine management
- dashboards / reports / audit

Prepared API:
GET /api/app/parts?q=...
GET /api/app/inventory?q=...
POST /api/app/issue
POST /api/app/receive

IMPORTANT: AppSheet should not overwrite inventory.quantity directly. Stock-changing workflows call the API so the transaction and balance are updated atomically. Never expose DATABASE_URL, Supabase service-role keys, or Django secrets in AppSheet.
