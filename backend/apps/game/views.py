"""
Views for the game API.
"""
import random
from django.db import transaction
from django.db.models import F
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import MediaPair, GameSession, GameAnswer, GlobalStats, MultiplayerRoom
from .presets import resolve_preset, PAIR_PRESETS
from .serializers import (
    GameSessionCreateSerializer,
    GameSessionSerializer,
    MediaPairGameSerializer,
    AnswerSubmitSerializer,
    AnswerResponseSerializer,
    GameResultSerializer,
    LeaderboardEntrySerializer,
    PseudoSubmitSerializer,
)


def _session_owns(request, session_key):
    """I (anti-IDOR) : vrai si la session de jeu a été créée par le navigateur
    courant. L'ownership est enregistré dans request.session à la création, ce
    qui empêche un tiers (connaissant le session_key) de lire les résultats ou
    d'écraser le pseudo d'autrui sur le leaderboard."""
    return str(session_key) in request.session.get('owned_sessions', [])


class GameSessionView(APIView):
    """Create a new game session or get session details."""

    def post(self, request):
        """Start a new game session."""
        serializer = GameSessionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # Pick 10 random pairs
        all_pairs = list(MediaPair.objects.filter(is_active=True))
        pairs = random.sample(all_pairs, min(10, len(all_pairs)))

        if len(pairs) < 1:
            return Response(
                {'error': 'Pas assez de paires disponibles'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Get audience type from request
        audience_type = serializer.validated_data.get('audience_type', 'public')

        # Create session with total pairs count
        session = GameSession.objects.create(audience_type=audience_type, total_pairs=len(pairs))

        # Generate random positions for real media (left or right) - only for image/video
        positions = {}
        for pair in pairs:
            if pair.media_type != 'audio':
                positions[pair.id] = random.choice(['left', 'right'])

        # Store positions in session
        request.session[f'positions_{session.session_key}'] = positions
        request.session[f'pairs_{session.session_key}'] = [p.id for p in pairs]

        # I: enregistrer la propriété de la session sur ce navigateur.
        # Dédupliqué et borné aux 50 dernières pour éviter une croissance
        # illimitée de la session côté serveur.
        owned = request.session.get('owned_sessions', [])
        key = str(session.session_key)
        if key not in owned:
            owned.append(key)
        request.session['owned_sessions'] = owned[-50:]

        # Serialize pairs for response
        pairs_serializer = MediaPairGameSerializer(
            pairs,
            many=True,
            context={'request': request, 'positions': positions}
        )

        response_data = {
            'session_key': str(session.session_key),
            'quiz_name': 'Mode Aléatoire',
            'pairs': pairs_serializer.data,
            'total_pairs': len(pairs),
        }

        return Response(response_data, status=status.HTTP_201_CREATED)


class AnswerSubmitView(APIView):
    """Submit an answer for a game session."""

    def post(self, request, session_key):
        try:
            session = GameSession.objects.get(session_key=session_key, is_completed=False)
        except GameSession.DoesNotExist:
            return Response(
                {'error': 'Session non trouvée ou déjà terminée'},
                status=status.HTTP_404_NOT_FOUND
            )

        if not _session_owns(request, session_key):
            return Response(
                {'error': 'Accès non autorisé à cette session'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = AnswerSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        pair_id = serializer.validated_data['pair_id']
        choice = serializer.validated_data['choice']
        response_time_ms = serializer.validated_data['response_time_ms']

        # Get the pair
        try:
            pair = MediaPair.objects.get(id=pair_id)
        except MediaPair.DoesNotExist:
            return Response(
                {'error': 'Paire non trouvée'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Check if answer is correct (player must find the AI-generated media)
        if pair.media_type == 'audio':
            # For audio: choice is 'real' or 'ai', compare with pair.is_real
            is_correct = (
                (choice == 'real' and pair.is_real is True) or
                (choice == 'ai' and pair.is_real is False)
            )
            ai_position = 'ai' if pair.is_real is False else 'real'
        else:
            # For image/video: use left/right positions
            positions = request.session.get(f'positions_{session.session_key}', {})
            # Convert string keys back to int if needed
            positions = {int(k): v for k, v in positions.items()}
            real_position = positions.get(pair_id, 'left')
            # AI position is the opposite of real position
            ai_position = 'right' if real_position == 'left' else 'left'
            # Player wins if they find the AI (click on the AI image)
            is_correct = (choice == ai_position)

        # Calculate points
        base_points = 100 if is_correct else 0
        streak_bonus = 0
        time_bonus = 0

        if is_correct:
            # Streak bonus: +10 per consecutive correct, max +50
            session.current_streak += 1
            streak_bonus = min(session.current_streak * 10, 50)
            
            # Time bonus: up to 50 points if answered within 5 seconds
            if response_time_ms < 5000:
                time_bonus = int((5000 - response_time_ms) / 100)
            
            if session.current_streak > session.streak_max:
                session.streak_max = session.current_streak
        else:
            session.current_streak = 0

        points_earned = base_points + streak_bonus + time_bonus
        session.score += points_earned
        session.time_total_ms += response_time_ms

        # Get current answer count for order
        current_order = session.answers.count() + 1

        # Create answer record
        with transaction.atomic():
            GameAnswer.objects.create(
                session=session,
                media_pair=pair,
                is_correct=is_correct,
                response_time_ms=response_time_ms,
                order=current_order,
                points_earned=points_earned,
            )

            # Update global stats
            global_stats, created = GlobalStats.objects.get_or_create(media_pair=pair)
            global_stats.total_attempts = F('total_attempts') + 1
            if is_correct:
                global_stats.correct_answers = F('correct_answers') + 1
            global_stats.save()

            # Check if session is complete
            if current_order >= session.total_pairs:
                session.is_completed = True

            session.save()

        # Get fresh global stats for response
        global_stats.refresh_from_db()

        response_data = {
            'is_correct': is_correct,
            'hint': pair.hint,
            'ai_position': ai_position,
            'points_earned': points_earned,
            'current_streak': session.current_streak,
            'total_score': session.score,
            'global_stats': {
                'total_attempts': global_stats.total_attempts,
                'success_rate': global_stats.success_rate,
            },
            'is_session_complete': session.is_completed,
        }

        return Response(response_data)


class GameResultView(APIView):
    """Get final results for a completed game session."""

    def get(self, request, session_key):
        try:
            session = GameSession.objects.get(session_key=session_key)
        except GameSession.DoesNotExist:
            return Response(
                {'error': 'Session non trouvée'},
                status=status.HTTP_404_NOT_FOUND
            )

        if not _session_owns(request, session_key):
            return Response(
                {'error': 'Accès non autorisé à cette session'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = GameResultSerializer(session)
        return Response(serializer.data)

    def post(self, request, session_key):
        """Submit pseudo for leaderboard."""
        try:
            session = GameSession.objects.get(session_key=session_key, is_completed=True)
        except GameSession.DoesNotExist:
            return Response(
                {'error': 'Session non trouvée ou non terminée'},
                status=status.HTTP_404_NOT_FOUND
            )

        if not _session_owns(request, session_key):
            return Response(
                {'error': 'Accès non autorisé à cette session'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = PseudoSubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        session.pseudo = serializer.validated_data['pseudo']
        session.save()

        return Response({'message': 'Pseudo enregistré', 'pseudo': session.pseudo})


class LeaderboardView(APIView):
    """Get leaderboard."""

    def get(self, request):
        limit = int(request.query_params.get('limit', 10))

        sessions = GameSession.objects.filter(
            is_completed=True,
            pseudo__isnull=False,
        ).exclude(pseudo='')

        sessions = sessions.order_by('-score', 'time_total_ms')[:limit]

        serializer = LeaderboardEntrySerializer(sessions, many=True)
        return Response(serializer.data)


# =============================================================================
# Multiplayer / Live Mode Views
# =============================================================================

class MultiplayerRoomCreateView(APIView):
    """Create a new multiplayer room.

    Accepte optionnellement un `preset` (sélection de paires préchoisie et
    ordonnée, cf. apps.game.presets). Sans preset : comportement classique
    (sélection aléatoire au démarrage par le consumer).
    """

    def post(self, request):
        preset_name = (request.data or {}).get('preset')
        pairs = None

        # Valider le preset AVANT de créer la room : un event lancé avec un preset
        # cassé (nom erroné, paires non seedées en prod) doit échouer VISIBLEMENT,
        # pas retomber silencieusement en partie aléatoire ou tronquée.
        if preset_name:
            if preset_name not in PAIR_PRESETS:
                return Response(
                    {'error': f"Preset inconnu : {preset_name}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            pairs = resolve_preset(preset_name)
            expected = len(PAIR_PRESETS[preset_name])
            if len(pairs) < expected:
                return Response(
                    {'error': f"Preset « {preset_name} » incomplet : "
                              f"{len(pairs)}/{expected} paires résolues. "
                              f"Lancer populate_pairs côté serveur ?"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        with transaction.atomic():
            room = MultiplayerRoom.objects.create()
            if pairs:
                room.pairs.set(pairs)
                # Fige l'ordre exact voulu (le M2M ne préserve pas l'ordre).
                room.ordered_pair_ids = [p.id for p in pairs]
                room.save(update_fields=['ordered_pair_ids'])

        # Le host_token n'est renvoyé QU'À la création, jamais dans le GET détail.
        # C'est la seule preuve que le client est bien l'hôte légitime.
        return Response({
            'id': room.id,
            'room_code': room.room_code,
            'host_token': str(room.host_token),
            'quiz': None,
            'status': room.status,
            'preset': preset_name if pairs else None,
            'pairs_count': len(room.ordered_pair_ids) if pairs else None,
            'created_at': room.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)


class MultiplayerRoomDetailView(APIView):
    """Get multiplayer room details."""

    def get(self, request, room_code):
        room_code = room_code.upper()
        try:
            room = MultiplayerRoom.objects.get(room_code=room_code)
        except MultiplayerRoom.DoesNotExist:
            return Response(
                {'error': 'Room non trouvée'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Ne JAMAIS retourner host_token ici — cette route est publique.
        return Response({
            'id': room.id,
            'room_code': room.room_code,
            'quiz': None,
            'status': room.status,
            'players_count': room.players.filter(is_connected=True).count(),
            'created_at': room.created_at.isoformat(),
        })


class LocalIPView(APIView):
    """Get the local IP address of the server for QR code generation."""

    def get(self, request):
        import socket
        
        # Méthode 1: Utiliser X-Forwarded-Host (l'IP/hostname utilisé par le client)
        forwarded_host = request.META.get('HTTP_X_FORWARDED_HOST', '')
        if forwarded_host:
            host_ip = forwarded_host.split(':')[0]
            if host_ip and host_ip not in ('localhost', '127.0.0.1'):
                return Response({'ip': host_ip})
        
        # Méthode 2: Utiliser le Host header
        host = request.get_host()
        if host:
            host_ip = host.split(':')[0]
            if host_ip and host_ip not in ('localhost', '127.0.0.1'):
                return Response({'ip': host_ip})
        
        # Méthode 3: Fallback - détection via socket
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.settimeout(0)
            try:
                s.connect(('8.8.8.8', 80))
                ip = s.getsockname()[0]
            except Exception:
                ip = '127.0.0.1'
            finally:
                s.close()
        except Exception:
            ip = '127.0.0.1'
        
        return Response({'ip': ip})
