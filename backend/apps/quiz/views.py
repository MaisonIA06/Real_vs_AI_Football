"""
API REST du Quiz Foot.

Volontairement minimale : création et détail de room uniquement. Les questions
(et donc les bonnes réponses) ne transitent JAMAIS par le REST — elles sont
poussées par le QuizConsumer WebSocket pendant la partie, pour ne rien fuiter.
La détection d'IP locale (QR code) réutilise l'endpoint générique
`/api/game/local-ip/`.
"""
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import QuizRoom, QuizQuestion


def _active_question_count():
    return QuizQuestion.objects.filter(is_active=True).count()


class QuizRoomCreateView(APIView):
    """Crée une nouvelle room de Quiz Foot."""

    def post(self, request):
        room = QuizRoom.objects.create()

        # host_token renvoyé UNIQUEMENT ici — seule preuve d'être l'hôte légitime.
        # Ne jamais l'exposer dans le GET détail (route publique).
        return Response({
            'id': room.id,
            'room_code': room.room_code,
            'host_token': str(room.host_token),
            'status': room.status,
            'question_count': _active_question_count(),
            'created_at': room.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)


class QuizRoomDetailView(APIView):
    """Détail public d'une room (sans host_token)."""

    def get(self, request, room_code):
        room_code = room_code.upper()
        try:
            room = QuizRoom.objects.get(room_code=room_code)
        except QuizRoom.DoesNotExist:
            return Response(
                {'error': 'Room non trouvée'},
                status=status.HTTP_404_NOT_FOUND
            )

        return Response({
            'id': room.id,
            'room_code': room.room_code,
            'status': room.status,
            'players_count': room.players.filter(is_connected=True).count(),
            'question_count': _active_question_count(),
            'created_at': room.created_at.isoformat(),
        })
