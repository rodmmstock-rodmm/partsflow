# Generated for PartsFlow Fast Order + AppSheet bridge v5

import django.db.models.deletion
import uuid
from django.db import migrations, models


PARTS_VIEW_SQL = r"""
CREATE OR REPLACE VIEW appsheet_parts_view AS
SELECT
    p.id,
    p.sku AS item_id,
    p.name AS part_name,
    COALESCE(p.description, '') AS part_detail,
    COALESCE(m.name, '') AS maker,
    COALESCE(u.code, '') AS unit,
    COALESCE(l.code, '') AS location,
    COALESCE(l.warehouse, '') AS warehouse,
    COALESCE(SUM(i.quantity), 0)::numeric(14,2) AS stock_qty,
    COALESCE(p.min_stock, 0)::numeric(14,2) AS min_stock,
    COALESCE(p.image_path, '') AS image_path,
    p.active
FROM core_part p
LEFT JOIN core_maker m ON m.id = p.maker_id
LEFT JOIN core_unit u ON u.id = p.unit_id
LEFT JOIN core_location l ON l.id = p.location_id
LEFT JOIN core_inventory i ON i.part_id = p.id
GROUP BY
    p.id, p.sku, p.name, p.description, m.name, u.code,
    l.code, l.warehouse, p.min_stock, p.image_path, p.active;
"""

EMPLOYEES_VIEW_SQL = r"""
CREATE OR REPLACE VIEW appsheet_employees_view AS
SELECT
    id,
    employee_code,
    name,
    department,
    role,
    active
FROM core_employee;
"""

MACHINES_VIEW_SQL = r"""
CREATE OR REPLACE VIEW appsheet_machines_view AS
SELECT
    id,
    code AS machine_code,
    name AS machine_name,
    dept_code,
    work_code,
    location,
    active
FROM core_machine;
"""

DROP_VIEWS_SQL = r"""
DROP VIEW IF EXISTS appsheet_machines_view;
DROP VIEW IF EXISTS appsheet_employees_view;
DROP VIEW IF EXISTS appsheet_parts_view;
"""


class Migration(migrations.Migration):

    dependencies = [
        ("core", "0008_orderproject_owner_pending_date"),
    ]

    operations = [
        migrations.CreateModel(
            name="FastOrderPreset",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("name", models.CharField(blank=True, max_length=160)),
                ("factory", models.CharField(default="MM-4", max_length=30)),
                ("remark", models.TextField(blank=True)),
                ("active", models.BooleanField(db_index=True, default=True)),
                (
                    "created_by_employee",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="created_fast_order_presets",
                        to="core.employee",
                    ),
                ),
                (
                    "machine",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="fast_order_presets",
                        to="core.machine",
                    ),
                ),
                (
                    "part",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="fast_order_presets",
                        to="core.part",
                    ),
                ),
            ],
            options={
                "ordering": ["part__sku", "machine__code", "created_at"],
            },
        ),
        migrations.AddConstraint(
            model_name="fastorderpreset",
            constraint=models.UniqueConstraint(
                fields=("factory", "machine", "part"),
                name="uniq_fastorder_factory_machine_part",
            ),
        ),
        migrations.RunSQL(
            sql=PARTS_VIEW_SQL,
            reverse_sql="DROP VIEW IF EXISTS appsheet_parts_view;",
        ),
        migrations.RunSQL(
            sql=EMPLOYEES_VIEW_SQL,
            reverse_sql="DROP VIEW IF EXISTS appsheet_employees_view;",
        ),
        migrations.RunSQL(
            sql=MACHINES_VIEW_SQL,
            reverse_sql="DROP VIEW IF EXISTS appsheet_machines_view;",
        ),
    ]
