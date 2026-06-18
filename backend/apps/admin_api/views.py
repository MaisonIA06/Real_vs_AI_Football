"""
Views for the admin API.
"""
from django.db.models import Avg, Count
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAdminUser
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser

from apps.game.models import Category, MediaPair, GameSession, GlobalStats
from .serializers import (
    CategoryAdminSerializer,
    MediaPairAdminSerializer,
    MediaPairCreateSerializer,
    DashboardStatsSerializer,
)


class CategoryViewSet(viewsets.ModelViewSet):
    """CRUD operations for categories."""
    permission_classes = [IsAdminUser]
    queryset = Category.objects.all()
    serializer_class = CategoryAdminSerializer
    pagination_class = None


class MediaPairViewSet(viewsets.ModelViewSet):
    """CRUD operations for media pairs."""
    permission_classes = [IsAdminUser]
    queryset = MediaPair.objects.select_related('category').all()
    parser_classes = [MultiPartParser, FormParser]

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return MediaPairCreateSerializer
        return MediaPairAdminSerializer

    def get_serializer_context(self):
        """Add request to serializer context for building absolute URLs."""
        context = super().get_serializer_context()
        context['request'] = self.request
        return context

    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by category
        category_id = self.request.query_params.get('category')
        if category_id:
            queryset = queryset.filter(category_id=category_id)

        # Filter by media type
        media_type = self.request.query_params.get('media_type')
        if media_type:
            queryset = queryset.filter(media_type=media_type)

        # Filter by difficulty
        difficulty = self.request.query_params.get('difficulty')
        if difficulty:
            queryset = queryset.filter(difficulty=difficulty)

        # Filter by active status
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')

        return queryset


@api_view(['GET'])
@permission_classes([IsAdminUser])
def dashboard_stats(request):
    """Get dashboard statistics."""
    from apps.game.models import GameAnswer
    
    total_categories = Category.objects.count()
    total_pairs = MediaPair.objects.count()
    total_sessions = GameSession.objects.count()
    completed_sessions = GameSession.objects.filter(is_completed=True).count()

    # Taux de réussite par type d'audience
    def calculate_success_rate(audience_type):
        """Calcule le taux de réussite pour un type d'audience."""
        sessions = GameSession.objects.filter(
            is_completed=True,
            audience_type=audience_type
        )
        total_answers = GameAnswer.objects.filter(session__in=sessions).count()
        correct_answers = GameAnswer.objects.filter(
            session__in=sessions,
            is_correct=True
        ).count()
        
        if total_answers == 0:
            return {
                'success_rate': 0,
                'total_sessions': 0,
                'total_answers': 0,
                'correct_answers': 0
            }
        
        return {
            'success_rate': round((correct_answers / total_answers) * 100, 1),
            'total_sessions': sessions.count(),
            'total_answers': total_answers,
            'correct_answers': correct_answers
        }
    
    school_stats = calculate_success_rate('school')
    public_stats = calculate_success_rate('public')

    # Recent sessions
    recent_sessions = list(
        GameSession.objects.filter(is_completed=True)
        .order_by('-created_at')[:10]
        .values('id', 'session_key', 'pseudo', 'score', 'streak_max', 'created_at', 'audience_type')
    )

    stats = {
        'total_categories': total_categories,
        'total_pairs': total_pairs,
        'total_sessions': total_sessions,
        'completed_sessions': completed_sessions,
        'school_stats': school_stats,
        'public_stats': public_stats,
        'recent_sessions': recent_sessions,
    }

    return Response(stats)


@api_view(['DELETE'])
@permission_classes([IsAdminUser])
def delete_session(request, session_id):
    """Delete a game session."""
    try:
        session = GameSession.objects.get(id=session_id)
        session.delete()
        return Response({'message': 'Session supprimée avec succès'}, status=status.HTTP_200_OK)
    except GameSession.DoesNotExist:
        return Response(
            {'error': 'Session non trouvée'},
            status=status.HTTP_404_NOT_FOUND
        )
