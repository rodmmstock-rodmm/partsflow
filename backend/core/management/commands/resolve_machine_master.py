import csv
import re
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from core.models import Machine, MachineCode


VALID_DECISIONS = {
    "",
    "NEW_MACHINE",
    "OLD",
    "ALIAS",
    "LINE",
    "KEEP_REFERENCE",
    "IGNORE",
}


def text(value):
    return "" if value is None else str(value).strip()


def normalize(value):
    return re.sub(r"\s+", "", text(value)).upper()


def classify_reference(code):
    u = text(code).upper()

    if "LINE" in u:
        return "LINE"

    if re.fullmatch(r"[A-Z0-9]+-\d+[A-Z]?", u):
        return "STRICT"

    if "-" in u:
        return "IRREGULAR"

    return "OTHER"


def suggested_action(category):
    if category == "STRICT":
        return "NEW_MACHINE"
    if category == "LINE":
        return "LINE"
    return "REVIEW"


def find_machine_by_current_code(code):
    """
    Resolve a target by Machine.code first, then by a CURRENT MachineCode.
    """
    code = text(code)
    if not code:
        return None

    machine = Machine.objects.filter(code__iexact=code).first()
    if machine:
        return machine

    mc = (
        MachineCode.objects
        .filter(code__iexact=code, code_type="CURRENT")
        .select_related("machine")
        .first()
    )
    if mc and mc.machine_id:
        return mc.machine

    return None


class Command(BaseCommand):
    help = (
        "Export/review/apply MachineCode REFERENCE resolutions. "
        "No automatic business decisions are made."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--export-csv",
            default="",
            help="Export unresolved MachineCode references to a review CSV.",
        )
        parser.add_argument(
            "--apply-csv",
            default="",
            help="Apply approved decisions from a review CSV.",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Validate/apply in a transaction and roll back all database changes.",
        )

    def handle(self, *args, **options):
        export_csv = text(options["export_csv"])
        apply_csv = text(options["apply_csv"])
        dry_run = options["dry_run"]

        if bool(export_csv) == bool(apply_csv):
            raise CommandError(
                "Choose exactly one action: --export-csv OR --apply-csv"
            )

        if export_csv:
            self.export_csv(export_csv)
            return

        self.apply_csv(apply_csv, dry_run=dry_run)

    def export_csv(self, csv_path):
        path = Path(csv_path)
        path.parent.mkdir(parents=True, exist_ok=True)

        refs = list(
            MachineCode.objects
            .filter(code_type="REFERENCE", machine__isnull=True)
            .order_by("code")
        )

        counts = {
            "STRICT": 0,
            "LINE": 0,
            "IRREGULAR": 0,
            "OTHER": 0,
        }

        with path.open("w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow(
                [
                    "reference_code",
                    "category",
                    "suggested_action",
                    "decision",
                    "target_current_code",
                    "result_code_type",
                    "note",
                ]
            )

            for ref in refs:
                category = classify_reference(ref.code)
                counts[category] += 1

                writer.writerow(
                    [
                        ref.code,
                        category,
                        suggested_action(category),
                        "",
                        "",
                        "",
                        ref.note or "",
                    ]
                )

        self.stdout.write(self.style.SUCCESS(f"Exported: {path}"))
        self.stdout.write(f"REFERENCE total : {len(refs)}")
        self.stdout.write(f"STRICT          : {counts['STRICT']}")
        self.stdout.write(f"LINE            : {counts['LINE']}")
        self.stdout.write(f"IRREGULAR       : {counts['IRREGULAR']}")
        self.stdout.write(f"OTHER           : {counts['OTHER']}")
        self.stdout.write("")
        self.stdout.write(
            "Fill only the 'decision' column after business review."
        )
        self.stdout.write(
            "Allowed decisions: NEW_MACHINE, OLD, ALIAS, LINE, "
            "KEEP_REFERENCE, IGNORE"
        )
        self.stdout.write(
            "For OLD/ALIAS, also fill 'target_current_code'."
        )

    @transaction.atomic
    def apply_csv(self, csv_path, dry_run=False):
        path = Path(csv_path)
        if not path.exists():
            raise CommandError(f"Resolution CSV not found: {path}")

        with path.open("r", newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            rows = list(reader)

        required = {
            "reference_code",
            "decision",
            "target_current_code",
        }
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise CommandError(
                f"Resolution CSV missing columns: {', '.join(sorted(missing))}"
            )

        # -----------------------------------------
        # Validate everything before mutating data.
        # -----------------------------------------
        errors = []
        decisions = []
        seen_codes = set()

        for csv_row_no, row in enumerate(rows, start=2):
            reference_code = text(row.get("reference_code"))
            decision = normalize(row.get("decision"))
            target_code = text(row.get("target_current_code"))
            note = text(row.get("note"))

            if not reference_code:
                continue

            key = normalize(reference_code)
            if key in seen_codes:
                errors.append(
                    f"CSV row {csv_row_no}: duplicate reference_code "
                    f"{reference_code}"
                )
                continue
            seen_codes.add(key)

            if decision not in VALID_DECISIONS:
                errors.append(
                    f"CSV row {csv_row_no}: invalid decision '{decision}' "
                    f"for {reference_code}"
                )
                continue

            # Blank decision means intentionally not reviewed yet.
            if decision == "":
                continue

            ref = (
                MachineCode.objects
                .filter(code__iexact=reference_code)
                .select_related("machine")
                .first()
            )

            if not ref:
                errors.append(
                    f"CSV row {csv_row_no}: MachineCode not found: "
                    f"{reference_code}"
                )
                continue

            if ref.code_type != "REFERENCE" or ref.machine_id:
                errors.append(
                    f"CSV row {csv_row_no}: {reference_code} is no longer "
                    "an unresolved REFERENCE"
                )
                continue

            target_machine = None

            if decision in {"OLD", "ALIAS"}:
                if not target_code:
                    errors.append(
                        f"CSV row {csv_row_no}: {reference_code} decision "
                        f"{decision} requires target_current_code"
                    )
                    continue

                target_machine = find_machine_by_current_code(target_code)

                if not target_machine:
                    errors.append(
                        f"CSV row {csv_row_no}: target CURRENT machine "
                        f"not found: {target_code}"
                    )
                    continue

            if decision == "NEW_MACHINE":
                conflict = (
                    Machine.objects
                    .filter(code__iexact=reference_code)
                    .first()
                )
                if conflict:
                    errors.append(
                        f"CSV row {csv_row_no}: Machine already exists "
                        f"with code {conflict.code}; use mapping instead"
                    )
                    continue

            decisions.append(
                {
                    "csv_row": csv_row_no,
                    "reference": ref,
                    "reference_code": reference_code,
                    "decision": decision,
                    "target_machine": target_machine,
                    "note": note,
                }
            )

        if errors:
            self.stdout.write(self.style.ERROR("VALIDATION ERRORS:"))
            for error in errors[:100]:
                self.stdout.write(f"  - {error}")
            raise CommandError(
                f"Resolution aborted: {len(errors)} validation error(s)."
            )

        stats = {
            "NEW_MACHINE": 0,
            "OLD": 0,
            "ALIAS": 0,
            "LINE": 0,
            "KEEP_REFERENCE": 0,
            "IGNORE": 0,
        }

        for item in decisions:
            ref = item["reference"]
            code = item["reference_code"]
            decision = item["decision"]
            note = item["note"]

            if decision == "NEW_MACHINE":
                machine = Machine.objects.create(
                    code=code,
                    name=code,
                    legacy_source="MACHINE_RESOLUTION",
                    legacy_id=code,
                )

                ref.machine = machine
                ref.code_type = "CURRENT"
                ref.note = note or (
                    "Promoted from REFERENCE to CURRENT Machine "
                    "after business review."
                )
                ref.active = True
                ref.save()

            elif decision in {"OLD", "ALIAS"}:
                target = item["target_machine"]

                ref.machine = target
                ref.code_type = decision
                ref.note = note or (
                    f"Business-approved {decision} mapping to "
                    f"{target.code}."
                )
                ref.active = True
                ref.save()

            elif decision == "LINE":
                # Current schema intentionally keeps LINE as REFERENCE,
                # because a production line is not a physical Machine.
                ref.machine = None
                ref.code_type = "REFERENCE"
                ref.note = note or "CLASSIFIED: LINE / GROUP"
                ref.active = True
                ref.save()

            elif decision == "KEEP_REFERENCE":
                ref.machine = None
                ref.code_type = "REFERENCE"
                ref.note = note or "CLASSIFIED: KEEP_REFERENCE"
                ref.active = True
                ref.save()

            elif decision == "IGNORE":
                ref.machine = None
                ref.code_type = "REFERENCE"
                ref.note = note or "CLASSIFIED: IGNORE"
                ref.active = False
                ref.save()

            stats[decision] += 1

        remaining = MachineCode.objects.filter(
            code_type="REFERENCE",
            machine__isnull=True,
        ).count()

        self.stdout.write("")
        self.stdout.write(self.style.MIGRATE_HEADING("=" * 60))
        self.stdout.write(
            self.style.MIGRATE_HEADING(" MACHINE RESOLUTION PREVIEW")
        )
        self.stdout.write(self.style.MIGRATE_HEADING("=" * 60))
        self.stdout.write(f"Rows with approved decisions : {len(decisions)}")
        self.stdout.write(f"NEW_MACHINE                 : {stats['NEW_MACHINE']}")
        self.stdout.write(f"OLD                         : {stats['OLD']}")
        self.stdout.write(f"ALIAS                       : {stats['ALIAS']}")
        self.stdout.write(f"LINE                        : {stats['LINE']}")
        self.stdout.write(
            f"KEEP_REFERENCE              : {stats['KEEP_REFERENCE']}"
        )
        self.stdout.write(f"IGNORE                      : {stats['IGNORE']}")
        self.stdout.write(f"REFERENCE remaining         : {remaining}")

        if dry_run:
            transaction.set_rollback(True)
            self.stdout.write("")
            self.stdout.write(
                self.style.WARNING(
                    "DRY RUN COMPLETE - DATABASE ROLLED BACK"
                )
            )
            return

        self.stdout.write("")
        self.stdout.write(
            self.style.SUCCESS(
                "MACHINE RESOLUTION COMPLETE - SAVED TO DATABASE"
            )
        )
