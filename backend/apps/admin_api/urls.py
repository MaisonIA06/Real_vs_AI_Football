"""
URL patterns for the admin API.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework.authtoken.views import obtain_auth_token
from . import views

router = DefaultRouter()
router.register(r'categories', views.CategoryViewSet)
router.register(r'media-pairs', views.MediaPairViewSet)

urlpatterns = [
    path('', include(router.urls)),
    # C: login admin → renvoie un token (DRF). Endpoint public (AllowAny) ;
    # ce sont les vues ci-dessus qui exigent IsAdminUser.
    path('auth/login/', obtain_auth_token, name='admin-login'),
    path('stats/', views.dashboard_stats, name='dashboard-stats'),
    path('sessions/<int:session_id>/', views.delete_session, name='delete-session'),
]
