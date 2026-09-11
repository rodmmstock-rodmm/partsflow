from django.contrib import admin
from django.urls import include, path, re_path
from django.views.generic import TemplateView

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include("core.web_urls")),
    re_path(
        r"^(?!api/|admin/|static/).*$",
        TemplateView.as_view(template_name="spa/index.html"),
        name="partsflow-spa",
    ),
]
