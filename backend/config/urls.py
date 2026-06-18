"""
URL configuration for Real vs AI project.
"""
from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from apps.game.health import health

urlpatterns = [
    path('health/', health, name='health'),
    path('admin/', admin.site.urls),
    path('api/game/', include('apps.game.urls')),
    path('api/admin/', include('apps.admin_api.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

