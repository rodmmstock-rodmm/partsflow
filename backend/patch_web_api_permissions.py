from pathlib import Path

path = Path("core/web_api.py")
text = path.read_text(encoding="utf-8")
text = text.replace("from rest_framework.permissions import AllowAny\n", "")

imp = "from .web_permissions import EmployeeModulePermission\n"
if imp not in text:
    marker = "from .web_serializers import (\n"
    text = text.replace(marker, imp + "\n" + marker, 1)

text = text.replace(
    "@permission_classes([AllowAny])",
    "@permission_classes([EmployeeModulePermission])",
)
path.write_text(text, encoding="utf-8")
print("Patched core/web_api.py")
