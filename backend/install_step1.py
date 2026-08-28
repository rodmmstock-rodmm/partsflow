from pathlib import Path
import shutil

here = Path(__file__).resolve().parent
models = here/"core/models.py"
snippet = (here/"step1_files/role_models_snippet.txt").read_text(encoding="utf-8")
text = models.read_text(encoding="utf-8")
if "class RoleAccess(" not in text:
    models.write_text(text.rstrip()+"\n\n"+snippet+"\n", encoding="utf-8")
    print("Added RoleAccess model")

for name in ["auth_api.py","role_api.py","web_urls.py"]:
    shutil.copy2(here/"step1_files"/name, here/"core"/name)
    print("Updated", name)

print("Now run: python manage.py makemigrations core && python manage.py migrate")
