"""
URL patterns de l'API Quiz Foot.
"""
from django.urls import path

from . import views

urlpatterns = [
    path('rooms/', views.QuizRoomCreateView.as_view(), name='quiz-room-create'),
    path('rooms/<str:room_code>/', views.QuizRoomDetailView.as_view(), name='quiz-room-detail'),
]
