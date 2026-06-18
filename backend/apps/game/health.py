from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET


@require_GET
def health(request):
    database_status = 'ok'
    cache_status = 'ok'

    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
            cursor.fetchone()
    except Exception:
        database_status = 'error'

    try:
        cache_key = 'healthcheck:probe'
        cache.set(cache_key, 'ok', timeout=5)
        if cache.get(cache_key) != 'ok':
            cache_status = 'unavailable'
    except Exception:
        cache_status = 'unavailable'

    overall_status = 'ok' if database_status == 'ok' else 'error'
    http_status = 200 if overall_status == 'ok' else 503

    return JsonResponse(
        {
            'status': overall_status,
            'database': database_status,
            'cache': cache_status,
        },
        status=http_status,
    )
