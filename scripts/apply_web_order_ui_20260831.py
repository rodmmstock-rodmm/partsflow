from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, text):
    (ROOT / path).write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {count}")
    return text.replace(old, new, 1)


def regex_once(text, pattern, repl, label, flags=0):
    new, count = re.subn(pattern, repl, text, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 regex match, found {count}")
    return new


# 1) Dashboard: hide MIN and VENDOR from the list table only.
p = "frontend/src/pages/Dashboard.jsx"
s = read(p)
s = replace_once(s, "                    <th>Min</th>\n                    <th>Vendor</th>\n", "", "dashboard headers")
s = replace_once(s, "                        <td>{fmt(part.min_stock)}</td>\n                        <td>{part.supplier_name || \"-\"}</td>\n", "", "dashboard cells")
write(p, s)


# 2/3/5) Role permission model + auth permission payload.
p = "backend/core/models.py"
s = read(p)
s = replace_once(
    s,
    "    can_view_orders = models.BooleanField(default=False)\n    can_add_order = models.BooleanField(default=False)\n    can_edit_order_info = models.BooleanField(default=False)\n",
    "    can_view_orders = models.BooleanField(default=False)\n    can_view_order_updates = models.BooleanField(default=False)\n    can_add_order = models.BooleanField(default=False)\n    can_edit_order_info = models.BooleanField(default=False)\n    can_edit_order_date = models.BooleanField(default=False)\n",
    "role model permissions",
)
write(p, s)

p = "backend/core/auth_api.py"
s = read(p)
s = replace_once(
    s,
    '    "can_view_orders",\n    "can_add_order",\n    "can_edit_order_info",\n',
    '    "can_view_orders",\n    "can_view_order_updates",\n    "can_add_order",\n    "can_edit_order_info",\n    "can_edit_order_date",\n',
    "auth permission fields",
)
write(p, s)

p = "frontend/src/pages/RoleSettings.jsx"
s = read(p)
s = replace_once(
    s,
    '  ["can_view_orders", "View Order", "Order"],\n  ["can_add_order", "Add Order", "Order"],\n  ["can_edit_order_info", "Edit Order Information", "Order"],\n',
    '  ["can_view_orders", "View Order", "Order"],\n  ["can_view_order_updates", "View Order Update List", "Order"],\n  ["can_add_order", "Add Order", "Order"],\n  ["can_edit_order_info", "Edit Order Information", "Order"],\n  ["can_edit_order_date", "Edit Order Date", "Order"],\n',
    "role settings permissions",
)
write(p, s)


# 3) Protect the update-list endpoint as well as hiding its tab in the UI.
p = "backend/core/order_audit_api.py"
s = read(p)
s = replace_once(s, 'TRACKED_FIELDS = (\n    "factory",\n', 'TRACKED_FIELDS = (\n    "date",\n    "factory",\n', "audit tracked date")
s = replace_once(
    s,
    '    return {\n        "factory": data.get("factory") or "",\n',
    '    return {\n        "date": data.get("date") or "",\n        "factory": data.get("factory") or "",\n',
    "audit snapshot date",
)
s = replace_once(
    s,
    '    if request.method == "GET":\n        view = str(request.GET.get("view", "normal")).strip().lower()\n        if view != "normal":\n',
    '    if request.method == "GET":\n        view = str(request.GET.get("view", "normal")).strip().lower()\n        if view == "updates":\n            _, permission_error = require_permission(request, "can_view_order_updates")\n            if permission_error:\n                return permission_error\n        if view != "normal":\n',
    "update list permission",
)
write(p, s)


# 5) Allow Order DATE edits only when the role has can_edit_order_date.
p = "backend/core/order_api.py"
s = read(p)
s = replace_once(s, "from .auth_api import require_permission\n", "from .auth_api import permissions_for, require_permission\n", "order api auth import")
s = replace_once(
    s,
    'def apply_order_info(order, data, *, creating=False):\n    if creating:\n        order.order_date = timezone.localdate()\n    # DATE cannot be edited after creation.\n    if "factory" in data or creating:\n',
    'def apply_order_info(order, data, *, creating=False, allow_order_date=False):\n    if creating:\n        order.order_date = timezone.localdate()\n    if allow_order_date and "date" in data:\n        order.order_date = as_date(data.get("date"), "DATE", required=True)\n    if "factory" in data or creating:\n',
    "apply order date permission",
)
s = replace_once(
    s,
    '                apply_order_info(order, request.data, creating=True)\n                order.save()\n                audit(actor, "CREATE", "OrderRecord", order.id, order_json(order_queryset().get(pk=order.pk)))\n',
    '                apply_order_info(\n                    order,\n                    request.data,\n                    creating=True,\n                    allow_order_date=bool(permissions_for(actor).get("can_edit_order_date")),\n                )\n                order.save()\n                audit(actor, "CREATE", "OrderRecord", order.id, order_json(order_queryset().get(pk=order.pk)))\n',
    "normal create order date",
)
s = replace_once(
    s,
    '    before = order_json(order)\n    try:\n        with transaction.atomic():\n            apply_order_info(order, request.data)\n            order.save()\n',
    '    before = order_json(order)\n    can_edit_order_date = bool(permissions_for(actor).get("can_edit_order_date"))\n    if "date" in request.data:\n        try:\n            incoming_date = as_date(request.data.get("date"), "DATE", required=True)\n        except ValueError as exc:\n            return Response({"detail": str(exc)}, status=400)\n        if incoming_date != order.order_date and not can_edit_order_date:\n            return Response({"detail": "คุณไม่มีสิทธิ์แก้ไข DATE ของ Order"}, status=403)\n    try:\n        with transaction.atomic():\n            apply_order_info(\n                order,\n                request.data,\n                allow_order_date=can_edit_order_date,\n            )\n            order.save()\n',
    "update order date permission",
)
s = replace_once(
    s,
    '            apply_order_info(order, request.data, creating=True)\n            order.save()\n\n            audit(\n                actor,\n                "CREATE_PROJECT_ORDER",\n',
    '            apply_order_info(\n                order,\n                request.data,\n                creating=True,\n                allow_order_date=bool(permissions_for(actor).get("can_edit_order_date")),\n            )\n            order.save()\n\n            audit(\n                actor,\n                "CREATE_PROJECT_ORDER",\n',
    "project create order date",
)
s = replace_once(
    s,
    '        "created_by": (\n            project.created_by_employee.name\n            if project.created_by_employee else ""\n        ),\n        "active": project.active,\n',
    '        "created_by": (\n            project.created_by_employee.name\n            if project.created_by_employee else ""\n        ),\n        "created_at": timezone.localtime(project.created_at).isoformat(),\n        "active": project.active,\n',
    "project created_at",
)
write(p, s)


# 2/3/4/5) Orders UI.
p = "frontend/src/pages/Orders.jsx"
s = read(p)
s = replace_once(
    s,
    '  employee,\n  onClose,\n  onSaved,\n}) {\n',
    '  employee,\n  canEditOrderDate = false,\n  onClose,\n  onSaved,\n}) {\n',
    "OrderInfoModal date permission prop",
)
s = replace_once(
    s,
    '            <input type="date" readOnly value={form.date} />\n',
    '            <input\n              type="date"\n              readOnly={!canEditOrderDate}\n              value={form.date}\n              onChange={(e) => set("date", e.target.value)}\n            />\n',
    "OrderInfoModal date input",
)
s = replace_once(
    s,
    'function MonthlyOrderTables({ rows, auth, selected, onToggle, onToggleAll, onEdit, onPurchase }) {\n',
    'function MonthlyOrderTables({ rows, auth, selected, onToggle, onToggleAll, onEdit, onPurchase, dateBasis = "lifecycle" }) {\n',
    "monthly order table signature",
)
s = replace_once(
    s,
    '      const raw = row.cancelled_at || row.received_at || row.updated_at || row.date || row.order_date;\n',
    '      const raw = dateBasis === "order"\n        ? (row.date || row.order_date || row.created_at)\n        : (row.cancelled_at || row.completed_at || row.received_at || row.date || row.order_date || row.updated_at);\n',
    "monthly order date basis",
)
s = replace_once(s, '  }, [rows]);\n\n  useEffect(() => {\n', '  }, [rows, dateBasis]);\n\n  useEffect(() => {\n', "monthly order memo deps")

monthly_project_component = r'''

function MonthlyProjectList({ projects, onSelect }) {
  const [openYears, setOpenYears] = useState({});
  const [openMonths, setOpenMonths] = useState({});
  const groups = useMemo(() => {
    const years = new Map();
    for (const project of projects) {
      const raw = project.created_at || project.pending_data_date;
      const d = raw ? new Date(raw) : null;
      const valid = d && !Number.isNaN(d.getTime());
      const year = valid ? String(d.getFullYear()) : "ไม่ระบุปี";
      const mi = valid ? d.getMonth() : 0;
      const key = valid
        ? `${year}-${String(mi + 1).padStart(2, "0")}`
        : `${year}-00`;
      if (!years.has(year)) years.set(year, new Map());
      const months = years.get(year);
      if (!months.has(key)) {
        months.set(key, {
          key,
          label: valid ? (MONTHS_TH[mi] || key) : "ไม่ระบุเดือน",
          projects: [],
        });
      }
      months.get(key).projects.push(project);
    }
    return Array.from(years.entries())
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([year, months]) => ({
        year,
        months: Array.from(months.values()).sort((a, b) => b.key.localeCompare(a.key)),
      }));
  }, [projects]);

  useEffect(() => {
    if (!groups.length) return;
    const y = groups[0];
    const m = y.months[0];
    setOpenYears((prev) => Object.keys(prev).length ? prev : { [y.year]: true });
    if (m) setOpenMonths((prev) => Object.keys(prev).length ? prev : { [m.key]: true });
  }, [groups]);

  if (!groups.length) return <div className="empty">ไม่พบ Project</div>;

  return (
    <div className="history-groups">
      {groups.map((y) => (
        <section className="history-year" key={y.year}>
          <button
            className="history-collapse year"
            onClick={() => setOpenYears((x) => ({ ...x, [y.year]: !x[y.year] }))}
          >
            <span>{openYears[y.year] ? "▾" : "▸"} ปี {y.year}</span>
            <b>{y.months.reduce((n, m) => n + m.projects.length, 0)} Project</b>
          </button>
          {openYears[y.year] && (
            <div className="history-months">
              {y.months.map((m) => (
                <section className="history-month" key={m.key}>
                  <button
                    className="history-collapse month"
                    onClick={() => setOpenMonths((x) => ({ ...x, [m.key]: !x[m.key] }))}
                  >
                    <span>{openMonths[m.key] ? "▾" : "▸"} {m.label}</span>
                    <b>{m.projects.length} Project</b>
                  </button>
                  {openMonths[m.key] && (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>PROJECT</th>
                            <th>OWNER</th>
                            <th>CREATED</th>
                            <th>STEP</th>
                            <th>ORDER</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.projects.map((project) => (
                            <tr
                              key={project.id}
                              role="button"
                              tabIndex={0}
                              title="กดเพื่อเปิด Project"
                              style={{ cursor: "pointer" }}
                              onClick={() => onSelect(project)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  onSelect(project);
                                }
                              }}
                            >
                              <td><b>{project.name}</b></td>
                              <td>{project.owner_name || "-"}</td>
                              <td>{project.created_at ? new Date(project.created_at).toLocaleDateString("th-TH") : "-"}</td>
                              <td>{fmt(project.step_count)}</td>
                              <td>{fmt(project.total_items)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
'''
s = replace_once(
    s,
    '\nfunction BulkActions({ rows, auth, busy, onRun, onClear }) {\n',
    monthly_project_component + '\nfunction BulkActions({ rows, auth, busy, onRun, onClear }) {\n',
    "monthly project list component",
)

s = replace_once(
    s,
    '        {ORDER_TABS.map(([key, label]) => (\n',
    '        {ORDER_TABS.filter(([key]) => key !== "updates" || auth.can("can_view_order_updates")).map(([key, label]) => (\n',
    "updates tab visibility",
)
s = replace_once(
    s,
    '            ["completed", "cancelled"].includes(tab) ? (\n              <MonthlyOrderTables\n',
    '            ["normal", "completed", "cancelled"].includes(tab) ? (\n              <MonthlyOrderTables\n',
    "normal monthly rendering",
)
s = replace_once(
    s,
    '                onPurchase={setPurchase}\n              />\n            ) : (\n',
    '                onPurchase={setPurchase}\n                dateBasis={tab === "normal" ? "order" : "lifecycle"}\n              />\n            ) : (\n',
    "normal monthly date basis prop",
)

old_project_picker = '''          <section className="panel">
            <div className="section-head">
              <div>
                <h2>
                  {projectDepartment === "MODIFY"
                    ? "Modify Projects"
                    : "Automation Projects"}
                </h2>
                <p>ค้นหาจากชื่อ Project หรือชื่อเจ้าของ แล้วเลือกจาก Dropdown</p>
              </div>

              {auth.can("can_manage_order_projects") && (
                <button
                  className="btn primary"
                  onClick={() => setProjectModal(true)}
                >
                  + Project
                </button>
              )}
            </div>

            <div className="toolbar wrap">
              <input
                className="search-input"
                value={projectSearch}
                onChange={(e) => setProjectSearch(e.target.value)}
                placeholder="ค้นหา Project / เจ้าของ Project..."
              />

              <select
                value={selectedProject?.id || ""}
                onChange={(e) => {
                  const project = shownProjects.find(
                    (x) => x.id === e.target.value
                  );
                  if (project) selectProject(project);
                  else {
                    setSelectedProject(null);
                    setProjectDetail(null);
                  }
                }}
                style={{ minWidth: 320 }}
              >
                <option value="">เลือก Project...</option>
                {shownProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                    {" · "}
                    {project.owner_name || "ไม่ระบุเจ้าของ"}
                    {" · "}
                    {project.step_count} Step
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section className="project-content">
              {!selectedProject ? (
                <div className="empty">
                  เลือก Project หรือสร้าง Project ใหม่ใน {projectDepartment === "MODIFY" ? "Modify" : "Automation"}
                </div>
              ) : projectDetail ? (
'''
new_project_picker = '''          {!selectedProject && (
            <section className="panel">
              <div className="section-head">
                <div>
                  <h2>
                    {projectDepartment === "MODIFY"
                      ? "Modify Projects"
                      : "Automation Projects"}
                  </h2>
                  <p>เลือก Project จากรายการที่แยกตามเดือน / ปี</p>
                </div>

                {auth.can("can_manage_order_projects") && (
                  <button
                    className="btn primary"
                    onClick={() => setProjectModal(true)}
                  >
                    + Project
                  </button>
                )}
              </div>

              <div className="toolbar wrap">
                <input
                  className="search-input"
                  value={projectSearch}
                  onChange={(e) => setProjectSearch(e.target.value)}
                  placeholder="ค้นหา Project / เจ้าของ Project..."
                />
              </div>

              <MonthlyProjectList
                projects={shownProjects}
                onSelect={selectProject}
              />
            </section>
          )}

          {selectedProject && (
          <section className="project-content">
              {projectDetail ? (
'''
s = replace_once(s, old_project_picker, new_project_picker, "project picker list")

s = replace_once(
    s,
    '                    <div className="page-actions" style={{ flexWrap: "wrap" }}>\n                      {auth.can("can_manage_order_projects") && (\n',
    '                    <div className="page-actions" style={{ flexWrap: "wrap" }}>\n                      <button\n                        className="btn ghost"\n                        onClick={() => {\n                          setSelectedProject(null);\n                          setProjectDetail(null);\n                          setSelected(new Set());\n                        }}\n                      >\n                        ← กลับรายการ Project\n                      </button>\n                      {auth.can("can_manage_order_projects") && (\n',
    "project back button",
)

s = replace_once(
    s,
    '              ) : (\n                <div className="empty">กำลังโหลด Project...</div>\n              )}\n            </section>\n        </>\n',
    '              ) : (\n                <div className="empty">กำลังโหลด Project...</div>\n              )}\n            </section>\n          )}\n        </>\n',
    "project selected wrapper close",
)

s = replace_once(
    s,
    '          employee={auth.employee}\n          onClose={() => setEditor(null)}\n',
    '          employee={auth.employee}\n          canEditOrderDate={auth.can("can_edit_order_date")}\n          onClose={() => setEditor(null)}\n',
    "OrderInfoModal caller date permission",
)
write(p, s)


# Migration: new permissions default off, enabled immediately for ADMIN/ADMINISTRATOR.
migration = '''from django.db import migrations, models\nfrom django.db.models import Q\n\n\ndef enable_admin_permissions(apps, schema_editor):\n    RoleAccess = apps.get_model("core", "RoleAccess")\n    RoleAccess.objects.filter(\n        Q(role_name__iexact="ADMIN") | Q(role_name__iexact="ADMINISTRATOR")\n    ).update(\n        can_view_order_updates=True,\n        can_edit_order_date=True,\n    )\n\n\nclass Migration(migrations.Migration):\n    dependencies = [\n        ("core", "0014_import_excel_orders_2026"),\n    ]\n\n    operations = [\n        migrations.AddField(\n            model_name="roleaccess",\n            name="can_view_order_updates",\n            field=models.BooleanField(default=False),\n        ),\n        migrations.AddField(\n            model_name="roleaccess",\n            name="can_edit_order_date",\n            field=models.BooleanField(default=False),\n        ),\n        migrations.RunPython(enable_admin_permissions, migrations.RunPython.noop),\n    ]\n'''
migration_path = ROOT / "backend/core/migrations/0015_order_visibility_and_date_permissions.py"
if migration_path.exists():
    raise RuntimeError(f"migration already exists: {migration_path}")
migration_path.write_text(migration, encoding="utf-8")

print("Applied PartsFlow web Order/Dashboard/Role patch successfully")
