from uuid import uuid4

from django.contrib.auth.models import User
from django.db import models
from django.db.models.functions import Lower


class UUIDMixin(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class LegacyMixin(UUIDMixin):
    legacy_source = models.CharField(max_length=80, blank=True)
    legacy_id = models.CharField(max_length=120, blank=True)

    class Meta:
        abstract = True


class Unit(LegacyMixin):
    code = models.CharField(max_length=30, unique=True)
    name = models.CharField(max_length=100)
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.code


class Maker(LegacyMixin):
    name = models.CharField(max_length=200, unique=True)
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.name


class Location(LegacyMixin):
    code = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=200, blank=True)
    warehouse = models.CharField(max_length=100, blank=True)
    zone = models.CharField(max_length=100, blank=True)
    rack = models.CharField(max_length=100, blank=True)
    shelf = models.CharField(max_length=100, blank=True)
    bin = models.CharField(max_length=100, blank=True)
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.code


class Employee(LegacyMixin):
    employee_code = models.CharField(max_length=80, unique=True)
    name = models.CharField(max_length=200)
    email = models.EmailField(blank=True, db_index=True)
    role = models.CharField(max_length=120, blank=True)
    department = models.CharField(max_length=120, blank=True)
    active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.employee_code} - {self.name}"


class Machine(LegacyMixin):
    code = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=250)
    location = models.CharField(max_length=200, blank=True)
    machine_type = models.CharField(max_length=120, blank=True)
    dept_code = models.CharField(max_length=100, blank=True)
    work_code = models.CharField(max_length=100, blank=True)
    active = models.BooleanField(default=True)
    remark = models.TextField(blank=True)

    def __str__(self):
        return f"{self.code} - {self.name}"


class MachineCode(LegacyMixin):
    code = models.CharField(max_length=100, unique=True)
    machine = models.ForeignKey(
        Machine,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="codes",
    )
    code_type = models.CharField(max_length=30, blank=True)
    note = models.TextField(blank=True)
    active = models.BooleanField(default=True)

    def __str__(self):
        return self.code


class Supplier(LegacyMixin):
    code = models.CharField(max_length=80, unique=True)
    name = models.CharField(max_length=250)
    contact = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=80, blank=True)
    email = models.EmailField(blank=True)
    lead_time_days = models.PositiveIntegerField(default=0)
    active = models.BooleanField(default=True)
    remark = models.TextField(blank=True)

    def __str__(self):
        return f"{self.code} - {self.name}"


class Part(LegacyMixin):
    sku = models.CharField(max_length=100, unique=True)
    name = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    maker = models.ForeignKey(Maker, null=True, blank=True, on_delete=models.SET_NULL)
    unit = models.ForeignKey(Unit, null=True, blank=True, on_delete=models.SET_NULL)
    default_supplier = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.SET_NULL)
    location = models.ForeignKey(Location, null=True, blank=True, on_delete=models.SET_NULL)
    image_path = models.CharField(max_length=500, blank=True)
    min_stock = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    max_stock = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    reorder_qty = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    vendor_lead_time_days = models.PositiveIntegerField(default=0)
    purchasing_lead_time_days = models.PositiveIntegerField(default=0)
    total_lead_time_days = models.PositiveIntegerField(default=0)
    last_purchase_price = models.DecimalField(max_digits=16, decimal_places=4, default=0)
    critical = models.BooleanField(default=False)
    active = models.BooleanField(default=True)
    remark = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.sku} - {self.name}"


class PartSupplier(LegacyMixin):
    part = models.ForeignKey(Part, on_delete=models.CASCADE, related_name="suppliers")
    supplier = models.ForeignKey(Supplier, on_delete=models.PROTECT, related_name="parts")
    supplier_part_no = models.CharField(max_length=150, blank=True)
    unit_price = models.DecimalField(max_digits=16, decimal_places=4, default=0)
    currency = models.CharField(max_length=10, default="THB")
    lead_time_days = models.PositiveIntegerField(default=0)
    minimum_order_qty = models.DecimalField(max_digits=14, decimal_places=2, default=1)
    is_preferred = models.BooleanField(default=False)
    last_quoted_at = models.DateField(null=True, blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["part", "supplier"], name="uniq_part_supplier")]


class PartMachine(LegacyMixin):
    part = models.ForeignKey(Part, on_delete=models.CASCADE, related_name="machine_links")
    machine = models.ForeignKey(Machine, on_delete=models.PROTECT, related_name="part_links")
    quantity_per_machine = models.DecimalField(max_digits=14, decimal_places=2, default=1)
    is_critical = models.BooleanField(default=False)
    position = models.CharField(max_length=150, blank=True)
    remark = models.TextField(blank=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["part", "machine"], name="uniq_part_machine")]


class MachineSpareSet(UUIDMixin):
    machine = models.ForeignKey(
        Machine,
        on_delete=models.PROTECT,
        related_name="spare_sets",
    )
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    active = models.BooleanField(default=True, db_index=True)
    created_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_machine_spare_sets",
    )

    class Meta:
        ordering = ["machine__code", "name"]
        constraints = [
            models.UniqueConstraint(
                fields=["machine", "name"],
                name="uniq_machine_spare_set",
            )
        ]

    def __str__(self):
        return f"{self.machine.code} - {self.name}"


class MachineSpareSetItem(UUIDMixin):
    spare_set = models.ForeignKey(
        MachineSpareSet,
        on_delete=models.CASCADE,
        related_name="items",
    )
    part = models.ForeignKey(
        Part,
        on_delete=models.PROTECT,
        related_name="spare_set_items",
    )
    quantity = models.DecimalField(max_digits=14, decimal_places=2, default=1)
    remark = models.TextField(blank=True)

    class Meta:
        ordering = ["part__sku"]
        constraints = [
            models.UniqueConstraint(
                fields=["spare_set", "part"],
                name="uniq_machine_spare_set_part",
            )
        ]

    def __str__(self):
        return f"{self.spare_set} / {self.part.sku}"


class Inventory(LegacyMixin):
    part = models.ForeignKey(Part, on_delete=models.PROTECT, related_name="inventory")
    location = models.ForeignKey(Location, null=True, blank=True, on_delete=models.PROTECT)
    quantity = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["part", "location"], name="uniq_part_location")]


class StockTransaction(LegacyMixin):
    TYPES = [
        ("RECEIVE", "Receive"),
        ("ISSUE", "Issue"),
        ("ADJUSTMENT", "Adjustment"),
        ("RETURN", "Return"),
        ("TRANSFER_IN", "Transfer In"),
        ("TRANSFER_OUT", "Transfer Out"),
        ("IN", "Legacy In"),
        ("OUT", "Legacy Out"),
    ]
    transaction_no = models.CharField(max_length=80, unique=True)
    part = models.ForeignKey(Part, on_delete=models.PROTECT, related_name="transactions")
    location = models.ForeignKey(Location, null=True, blank=True, on_delete=models.PROTECT)
    transaction_type = models.CharField(max_length=20, choices=TYPES)
    quantity = models.DecimalField(max_digits=14, decimal_places=2)
    machine = models.ForeignKey(Machine, null=True, blank=True, on_delete=models.SET_NULL)
    employee = models.ForeignKey(Employee, null=True, blank=True, on_delete=models.SET_NULL)
    recorded_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="recorded_stock_transactions",
    )
    reference_type = models.CharField(max_length=50, blank=True)
    reference_id = models.CharField(max_length=100, blank=True)
    transaction_date = models.DateTimeField()
    remark = models.TextField(blank=True)
    created_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    is_void = models.BooleanField(default=False)
    voided_at = models.DateTimeField(null=True, blank=True)
    voided_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="voided_stock_transactions",
    )


class RoleAccess(UUIDMixin):
    role_name = models.CharField(max_length=120, unique=True)
    display_name = models.CharField(max_length=120, blank=True)
    active = models.BooleanField(default=True)

    can_view_dashboard = models.BooleanField(default=True)
    can_view_parts = models.BooleanField(default=True)
    can_edit_parts = models.BooleanField(default=False)
    can_adjust_stock = models.BooleanField(default=False)
    can_receive_stock = models.BooleanField(default=False)
    can_issue_stock = models.BooleanField(default=False)

    can_view_history = models.BooleanField(default=True)
    can_edit_history = models.BooleanField(default=False)
    can_delete_history = models.BooleanField(default=False)
    can_view_safety_stock = models.BooleanField(default=True)

    can_view_orders = models.BooleanField(default=False)
    can_view_order_updates = models.BooleanField(default=False)
    can_add_order = models.BooleanField(default=False)
    can_edit_order_info = models.BooleanField(default=False)
    can_edit_order_date = models.BooleanField(default=False)
    can_edit_purchase_info = models.BooleanField(default=False)
    can_receive_order = models.BooleanField(default=False)
    can_cancel_order = models.BooleanField(default=False)
    can_delete_order = models.BooleanField(default=False)
    can_update_edit_data = models.BooleanField(default=False)
    can_manage_order_projects = models.BooleanField(default=False)
    can_create_order_from_quotation = models.BooleanField(default=False)
    can_view_deleted_orders = models.BooleanField(default=False)

    can_view_suppliers = models.BooleanField(default=False)
    can_manage_suppliers = models.BooleanField(default=False)
    can_view_machines = models.BooleanField(default=False)
    can_manage_machines = models.BooleanField(default=False)

    can_view_employees = models.BooleanField(default=False)
    can_add_employees = models.BooleanField(default=False)
    can_edit_employees = models.BooleanField(default=False)
    can_view_audit_log = models.BooleanField(default=False)
    can_manage_roles = models.BooleanField(default=False)

    class Meta:
        ordering = ["role_name"]
        constraints = [
            models.UniqueConstraint(
                Lower("role_name"),
                name="uniq_roleaccess_role_name_ci",
            )
        ]

    def __str__(self):
        return self.display_name or self.role_name


class JobType(UUIDMixin):
    code = models.CharField(max_length=80, unique=True)
    name = models.CharField(max_length=120, blank=True)
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ["code"]

    def __str__(self):
        return self.code


class FastOrderPreset(UUIDMixin):
    """Reusable SPARE Order template.

    The preset stores everything required to create a Normal Order except the
    order quantity. Quick ordering always creates JOB=SPARE.
    """
    name = models.CharField(max_length=160, blank=True)
    factory = models.CharField(max_length=30, default="MM-4")
    machine = models.ForeignKey(
        Machine,
        on_delete=models.PROTECT,
        related_name="fast_order_presets",
    )
    part = models.ForeignKey(
        Part,
        on_delete=models.PROTECT,
        related_name="fast_order_presets",
    )
    remark = models.TextField(blank=True)
    active = models.BooleanField(default=True, db_index=True)
    created_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_fast_order_presets",
    )

    class Meta:
        ordering = ["part__sku", "machine__code", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["factory", "machine", "part"],
                name="uniq_fastorder_factory_machine_part",
            )
        ]

    def __str__(self):
        return self.name or f"{self.part.sku} / {self.machine.code}"


class OrderProject(UUIDMixin):
    DEPARTMENT_CHOICES = [("MODIFY", "Modify"), ("AUTOMATION", "Automation")]

    name = models.CharField(max_length=250, unique=True)
    department = models.CharField(max_length=20, choices=DEPARTMENT_CHOICES, default="MODIFY", db_index=True)
    description = models.TextField(blank=True)

    # Project-level data shared by every Order in this Project.
    owner_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="owned_order_projects",
    )
    pending_data_date = models.DateField(null=True, blank=True)

    active = models.BooleanField(default=True)
    created_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_order_projects",
    )

    def __str__(self):
        return self.name


class OrderStep(UUIDMixin):
    project = models.ForeignKey(OrderProject, on_delete=models.CASCADE, related_name="steps")
    step_no = models.PositiveIntegerField()
    import_filename = models.CharField(max_length=255, blank=True)
    imported_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="imported_order_steps",
    )

    class Meta:
        ordering = ["project", "step_no"]
        constraints = [models.UniqueConstraint(fields=["project", "step_no"], name="uniq_project_step")]

    def __str__(self):
        return f"{self.project.name} - Step {self.step_no}"


class OrderRecord(LegacyMixin):
    SOURCE_CHOICES = [("NORMAL", "Normal"), ("PROJECT", "Project")]
    USAGE_CHOICES = [("USED", "ใช้"), ("NOT_USED", "ไม่ได้ใช้")]

    PROCUREMENT_PURCHASE = "PURCHASE"
    PROCUREMENT_QUOTATION = "QUOTATION"
    PROCUREMENT_CHOICES = [
        (PROCUREMENT_PURCHASE, "Order จริง"),
        (PROCUREMENT_QUOTATION, "ขอราคา"),
    ]

    STATUS_NEW = "New Order"
    STATUS_QUOTE = "Wait Quotation"
    STATUS_ISSUE_PR = "Wait Issue P/R"
    STATUS_CONFIRM = "Wait Confirm Order"
    STATUS_ITEM = "Wait for Item"
    STATUS_COMPLETE = "Complete Order"

    LIFECYCLE_ACTIVE = "ACTIVE"
    LIFECYCLE_WAIT_CONFIRM = "WAIT_CONFIRM"
    LIFECYCLE_CANCELLED = "CANCELLED"
    LIFECYCLE_COMPLETED = "COMPLETED"
    LIFECYCLE_CHOICES = [
        (LIFECYCLE_ACTIVE, "Active"),
        (LIFECYCLE_WAIT_CONFIRM, "Wait Confirm"),
        (LIFECYCLE_CANCELLED, "Cancelled"),
        (LIFECYCLE_COMPLETED, "Completed"),
    ]

    EDIT_WAIT_QUOTE = "รออัพเดต Wait Quotation"
    EDIT_WAIT_ITEM = "รออัพเดต Wait for Item"
    EDIT_WAIT_COMPLETE = "รออัพเดต Complete Order"
    EDIT_DONE = "อัพเดตครบแล้ว"

    order_number = models.CharField(max_length=100, unique=True)
    order_date = models.DateField()
    factory = models.CharField(max_length=30, blank=True)
    group_order = models.CharField(max_length=250, blank=True, db_index=True)
    machine = models.ForeignKey(Machine, null=True, blank=True, on_delete=models.SET_NULL, related_name="order_records")
    job = models.CharField(max_length=80, blank=True, db_index=True)
    urgent_status = models.CharField(max_length=120, blank=True)
    pending_data_date = models.DateField(null=True, blank=True)
    remark = models.TextField(blank=True)

    quotation = models.TextField(blank=True)
    part = models.ForeignKey(Part, null=True, blank=True, on_delete=models.SET_NULL, related_name="order_records")
    part_name = models.CharField(max_length=300)
    part_detail = models.TextField(blank=True)
    maker_text = models.CharField(max_length=250, blank=True)
    amount = models.PositiveIntegerField(default=1)
    unit_text = models.CharField(max_length=80)

    po_number = models.CharField(max_length=120, blank=True)
    price_per_unit = models.DecimalField(max_digits=16, decimal_places=4, default=0)
    price_total = models.DecimalField(max_digits=18, decimal_places=4, default=0)
    vendor = models.ForeignKey(Supplier, null=True, blank=True, on_delete=models.SET_NULL, related_name="order_records")
    lead_time_days = models.PositiveIntegerField(null=True, blank=True)
    ordered_by = models.ForeignKey(Employee, null=True, blank=True, on_delete=models.SET_NULL, related_name="requested_order_records")
    issue_pr_date = models.DateField(null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    vendor_confirm_date = models.DateField(null=True, blank=True)
    received_at = models.DateTimeField(null=True, blank=True)
    person_in_charge = models.ForeignKey(Employee, null=True, blank=True, on_delete=models.SET_NULL, related_name="managed_order_records")
    recorded_by = models.ForeignKey(Employee, null=True, blank=True, on_delete=models.SET_NULL, related_name="recorded_order_records")

    status = models.CharField(max_length=80, default=STATUS_NEW, db_index=True)

    # Workflow override: Wait Confirm is intentionally manual and independent
    # from the data-derived purchase workflow.
    wait_confirm = models.BooleanField(default=False, db_index=True)

    # Lifecycle is separate from workflow status. This prevents completed /
    # cancelled state from being mixed with purchase workflow progression.
    lifecycle_status = models.CharField(
        max_length=20,
        choices=LIFECYCLE_CHOICES,
        default=LIFECYCLE_ACTIVE,
        db_index=True,
    )

    # Compatibility field kept for existing screens/integrations.
    cancel_status = models.BooleanField(default=False, db_index=True)

    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="cancelled_order_records",
    )
    cancel_reason = models.TextField(blank=True)

    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="completed_order_records",
    )
    completion_note = models.TextField(blank=True)

    edit_data_status = models.CharField(max_length=120, blank=True, db_index=True)
    edit_workflow_enabled = models.BooleanField(default=True)

    source_type = models.CharField(max_length=20, choices=SOURCE_CHOICES, default="NORMAL", db_index=True)
    project = models.ForeignKey(OrderProject, null=True, blank=True, on_delete=models.CASCADE, related_name="orders")
    step = models.ForeignKey(OrderStep, null=True, blank=True, on_delete=models.CASCADE, related_name="orders")
    usage_status = models.CharField(max_length=20, choices=USAGE_CHOICES, default="USED")

    # Project rows begin either as quotation-only items or real purchase
    # Orders. Quotation rows are deliberately excluded from Stock, Safety
    # Stock and Order KPI calculations until an authorized employee converts
    # them into a linked PURCHASE row.
    procurement_phase = models.CharField(
        max_length=20,
        choices=PROCUREMENT_CHOICES,
        default=PROCUREMENT_PURCHASE,
        db_index=True,
    )
    source_quotation_order = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="converted_orders",
    )
    source_rfq = models.ForeignKey(
        "OrderRFQ",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="converted_orders",
    )
    converted_quantity = models.PositiveIntegerField(default=0)
    created_from_quotation_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="orders_created_from_quotation",
    )
    created_from_quotation_at = models.DateTimeField(null=True, blank=True)
    currency = models.CharField(max_length=10, default="THB")

    stock_received = models.BooleanField(default=False)
    stock_transaction = models.ForeignKey(
        StockTransaction,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="source_orders",
    )

    is_deleted = models.BooleanField(default=False, db_index=True)
    deleted_at = models.DateTimeField(null=True, blank=True)
    deleted_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="deleted_order_records",
    )

    class Meta:
        ordering = ["-order_date", "-created_at"]

    def __str__(self):
        return self.order_number


class RFQCCRule(UUIDMixin):
    TYPE_DEFAULT = "DEFAULT"
    TYPE_JOB = "JOB"
    TYPE_CHOICES = [
        (TYPE_DEFAULT, "ทุกการส่ง"),
        (TYPE_JOB, "ตาม JOB"),
    ]

    rule_type = models.CharField(max_length=20, choices=TYPE_CHOICES, db_index=True)
    job = models.CharField(max_length=80, blank=True, db_index=True)
    email = models.EmailField()
    display_name = models.CharField(max_length=200, blank=True)
    active = models.BooleanField(default=True, db_index=True)
    created_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_rfq_cc_rules",
    )

    class Meta:
        ordering = ["rule_type", "job", "email"]
        constraints = [
            models.UniqueConstraint(
                fields=["rule_type", "job", "email"],
                name="uniq_rfq_cc_rule",
            )
        ]


class VendorEmailIdentity(UUIDMixin):
    email = models.EmailField(unique=True)
    vendor = models.ForeignKey(
        Supplier,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="email_identities",
    )
    vendor_name = models.CharField(max_length=250, blank=True)
    confirmed_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="confirmed_vendor_email_identities",
    )
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["email"]


class OrderRFQ(UUIDMixin):
    STATUS_DRAFT = "DRAFT"
    STATUS_SENT = "SENT"
    STATUS_FAILED = "FAILED"
    STATUS_CANCELLED = "CANCELLED"
    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_SENT, "Sent"),
        (STATUS_FAILED, "Failed"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    rfq_number = models.CharField(max_length=80, unique=True)
    group_order = models.CharField(max_length=250, db_index=True)
    job = models.CharField(max_length=80, db_index=True)
    vendor = models.ForeignKey(
        Supplier,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="order_rfqs",
    )
    vendor_name = models.CharField(max_length=250, blank=True)
    recipient_email = models.EmailField(db_index=True)
    sender_email = models.EmailField(blank=True)
    requested_at = models.DateTimeField(null=True, blank=True, db_index=True)
    sent_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="sent_order_rfqs",
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_DRAFT,
        db_index=True,
    )
    subject = models.CharField(max_length=500, blank=True)
    body_text = models.TextField(blank=True)
    to_emails = models.JSONField(default=list, blank=True)
    cc_emails = models.JSONField(default=list, blank=True)
    gmail_message_id = models.CharField(max_length=200, blank=True)
    gmail_thread_id = models.CharField(max_length=200, blank=True, db_index=True)
    rfc_message_id = models.CharField(max_length=500, blank=True, db_index=True)
    gmail_web_link = models.TextField(blank=True)
    send_error = models.TextField(blank=True)

    class Meta:
        ordering = ["-requested_at", "-created_at"]
        indexes = [
            models.Index(fields=["group_order", "job"]),
            models.Index(fields=["status", "requested_at"]),
        ]

    def __str__(self):
        return self.rfq_number


class OrderRFQItem(UUIDMixin):
    rfq = models.ForeignKey(OrderRFQ, on_delete=models.CASCADE, related_name="items")
    order = models.ForeignKey(
        OrderRecord,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="rfq_items",
    )
    order_number = models.CharField(max_length=100)
    item_id = models.CharField(max_length=100, blank=True)
    part_name = models.CharField(max_length=300)
    part_detail = models.TextField(blank=True)
    amount = models.PositiveIntegerField(default=1)
    unit = models.CharField(max_length=80)

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["rfq", "order"],
                name="uniq_order_rfq_item",
            )
        ]


class RFQMessage(UUIDMixin):
    TYPE_REQUEST = "RFQ_REQUEST"
    TYPE_PRICE_FOLLOW_UP = "PRICE_FOLLOW_UP"
    TYPE_DELIVERY_FOLLOW_UP = "DELIVERY_FOLLOW_UP"
    TYPE_VENDOR_REPLY = "VENDOR_REPLY"
    TYPE_CHOICES = [
        (TYPE_REQUEST, "ขอราคา"),
        (TYPE_PRICE_FOLLOW_UP, "ตามราคา"),
        (TYPE_DELIVERY_FOLLOW_UP, "ตามวันที่จัดส่ง"),
        (TYPE_VENDOR_REPLY, "Vendor ตอบกลับ"),
    ]
    DIRECTION_OUTBOUND = "OUTBOUND"
    DIRECTION_INBOUND = "INBOUND"
    DIRECTION_CHOICES = [
        (DIRECTION_OUTBOUND, "Outbound"),
        (DIRECTION_INBOUND, "Inbound"),
    ]
    STATUS_PENDING = "PENDING"
    STATUS_SENT = "SENT"
    STATUS_RECEIVED = "RECEIVED"
    STATUS_FAILED = "FAILED"
    STATUS_CHOICES = [
        (STATUS_PENDING, "Pending"),
        (STATUS_SENT, "Sent"),
        (STATUS_RECEIVED, "Received"),
        (STATUS_FAILED, "Failed"),
    ]

    rfq = models.ForeignKey(OrderRFQ, on_delete=models.CASCADE, related_name="messages")
    message_type = models.CharField(max_length=30, choices=TYPE_CHOICES)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    subject = models.CharField(max_length=500, blank=True)
    body_text = models.TextField(blank=True)
    from_email = models.EmailField(blank=True)
    to_emails = models.JSONField(default=list, blank=True)
    cc_emails = models.JSONField(default=list, blank=True)
    gmail_message_id = models.CharField(max_length=200, blank=True, db_index=True)
    gmail_thread_id = models.CharField(max_length=200, blank=True, db_index=True)
    rfc_message_id = models.CharField(max_length=500, blank=True, db_index=True)
    gmail_web_link = models.TextField(blank=True)
    occurred_at = models.DateTimeField(null=True, blank=True, db_index=True)
    sent_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="sent_rfq_messages",
    )
    error = models.TextField(blank=True)

    class Meta:
        ordering = ["occurred_at", "created_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["rfq", "gmail_message_id"],
                condition=~models.Q(gmail_message_id=""),
                name="uniq_rfq_gmail_message",
            )
        ]


class RFQAttachment(UUIDMixin):
    message = models.ForeignKey(RFQMessage, on_delete=models.CASCADE, related_name="attachments")
    filename = models.CharField(max_length=500)
    mime_type = models.CharField(max_length=200, blank=True)
    size = models.PositiveBigIntegerField(default=0)
    gmail_attachment_id = models.CharField(max_length=500, blank=True)
    gmail_message_id = models.CharField(max_length=200, blank=True)
    quotation_revision = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["created_at"]


class POBalance(UUIDMixin):
    rfq = models.OneToOneField(OrderRFQ, on_delete=models.CASCADE, related_name="po_balance")
    quotation_received_at = models.DateTimeField(null=True, blank=True)
    price = models.DecimalField(max_digits=18, decimal_places=4, null=True, blank=True)
    currency = models.CharField(max_length=10, default="THB")
    lead_time_days = models.PositiveIntegerField(null=True, blank=True)
    vendor_delivery_date = models.DateField(null=True, blank=True)
    actual_delivery_date = models.DateField(null=True, blank=True)
    note = models.TextField(blank=True)
    updated_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="updated_po_balances",
    )

    class Meta:
        ordering = ["-updated_at"]


class IntegrationCredential(UUIDMixin):
    PROVIDER_GMAIL = "GMAIL"
    provider = models.CharField(max_length=30, unique=True)
    encrypted_credentials = models.TextField(blank=True)
    account_email = models.EmailField(blank=True)
    scopes = models.JSONField(default=list, blank=True)
    connected_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="connected_integrations",
    )
    connected_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True)
    pending_state_hash = models.CharField(max_length=64, blank=True, db_index=True)
    pending_code_verifier = models.TextField(blank=True)
    pending_by_employee = models.ForeignKey(
        Employee,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="pending_integrations",
    )
    pending_at = models.DateTimeField(null=True, blank=True)


class AuditLog(models.Model):
    user = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
    employee = models.ForeignKey(Employee, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_logs")
    action = models.CharField(max_length=120)
    entity = models.CharField(max_length=120)
    entity_id = models.CharField(max_length=120, blank=True)
    detail = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
