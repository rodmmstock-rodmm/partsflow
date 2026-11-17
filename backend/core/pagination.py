from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardPageNumberPagination(PageNumberPagination):
    """Default API pagination with the response keys used by PartsFlow."""

    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 100

    def get_paginated_response(self, data):
        return Response(
            {
                "count": self.page.paginator.count,
                "page": self.page.number,
                "page_size": self.page.paginator.per_page,
                "total_pages": self.page.paginator.num_pages,
                "has_next": self.page.has_next(),
                "has_previous": self.page.has_previous(),
                "next": self.get_next_link(),
                "previous": self.get_previous_link(),
                "results": data,
            }
        )


class StockTransactionPagination(StandardPageNumberPagination):
    """History returns no more than 100 rows for the selected month."""

    page_size = 100
    max_page_size = 100


class PartListPagination(StandardPageNumberPagination):
    """Count filtered Parts without evaluating unused stock/order annotations."""

    def get_count(self, queryset):
        # The page rows still use the fully annotated queryset. Only the
        # paginator's count query drops stock and active-order annotations,
        # which are not needed to count the filtered Part primary keys.
        return queryset.order_by().values("pk").count()
