from django.urls import path
from . import api
urlpatterns=[
 path("app/parts",api.app_parts),
 path("app/inventory",api.app_inventory),
 path("app/issue",api.app_issue),
 path("app/receive",api.app_receive),
]
