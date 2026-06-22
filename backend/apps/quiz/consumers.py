"""
Consumer WebSocket du Quiz Foot (mode live animé, type « classe »).

Calqué sur apps.game.consumers.MultiplayerConsumer et son contrat de sécurité :
- `host.join` exige le `host_token` (renvoyé seulement à la création REST) ;
- `player.join` gère la reconnexion via `session_token` ;
- toutes les actions de contrôle (game.start/next/skip/show_answer/end) commencent
  par une garde `is_host` — sans quoi n'importe quel élève piloterait la partie.

Différence clé avec le jeu Real vs AI : la « bonne réponse » (correct_index) et
l'anecdote ne sont JAMAIS envoyées dans la question — uniquement à la révélation.
"""
import json
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncWebsocketConsumer

from .models import QuizQuestion, QuizRoom, QuizPlayer, QuizAnswer

logger = logging.getLogger(__name__)

# Bonus de rapidité pour les premiers à répondre correctement (1er, 2e, 3e),
# identique au multijoueur Real vs AI.
POSITION_BONUSES = (50, 30, 10)


# ============================================================================
# Logique pure (sans DB ni I/O) — testable directement
# ============================================================================

def position_bonus(correct_before):
    """Bonus selon le nombre de bonnes réponses déjà enregistrées avant celle-ci."""
    if 0 <= correct_before < len(POSITION_BONUSES):
        return POSITION_BONUSES[correct_before]
    return 0


def compute_points(is_correct, correct_before):
    """100 points de base si correct, + bonus de rapidité ; 0 sinon."""
    if not is_correct:
        return 0
    return 100 + position_bonus(correct_before)


def advance_state(current_index, total_questions):
    """Décision d'avancement : (nouvel_index, reste-t-il une question ?).

    Extraite pour rester testable sans DB : on ne doit repasser le statut en
    PLAYING que s'il reste une question, sinon la room reste sur un index
    hors limites avec un statut PLAYING incohérent (avant le FINISHED final).
    """
    new_index = current_index + 1
    return new_index, new_index < total_questions


def question_payload_for_players(question, question_number, total_questions):
    """Payload d'une question SANS la réponse (correct_index/anecdote exclus).

    C'est ce qui part vers l'hôte ET les joueurs pendant la question.
    """
    return {
        'question_id': question.id,
        'question_number': question_number,
        'total_questions': total_questions,
        'question_text': question.question_text,
        'image': question.image_url(),
        'question_type': question.question_type,
        'choices': question.choices,
    }


def answer_payload(question, player_results):
    """Payload de RÉVÉLATION : contient la bonne réponse et l'anecdote."""
    return {
        'question_id': question.id,
        'correct_index': question.correct_index,
        'correct_choice': question.correct_choice,
        'anecdote': question.anecdote,
        'player_results': player_results,
    }


# ============================================================================
# Consumer
# ============================================================================

class QuizConsumer(AsyncWebsocketConsumer):
    """Consumer WebSocket pour une room de Quiz Foot."""

    async def connect(self):
        self.room_code = self.scope['url_route']['kwargs']['room_code'].upper()
        self.room_group_name = f'quiz_{self.room_code}'
        self.player_id = None
        self.is_host = False

        await self.channel_layer.group_add(self.room_group_name, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        if self.player_id:
            await self.mark_player_disconnected()
            await self.channel_layer.group_send(
                self.room_group_name,
                {'type': 'player_left', 'player_id': self.player_id},
            )
        await self.channel_layer.group_discard(self.room_group_name, self.channel_name)

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            action = data.get('action')

            handlers = {
                'host.join': self.handle_host_join,
                'player.join': self.handle_player_join,
                'game.start': self.handle_game_start,
                'game.next_question': self.handle_next_question,
                'game.skip': self.handle_skip_question,
                'game.show_answer': self.handle_show_answer,
                'player.answer': self.handle_player_answer,
                'game.end': self.handle_game_end,
            }

            handler = handlers.get(action)
            if handler:
                await handler(data)
            else:
                await self.send_error(f"Action inconnue : {action}")
        except json.JSONDecodeError:
            await self.send_error("JSON invalide")
        except Exception:
            logger.exception("Erreur non gérée dans QuizConsumer.receive")
            await self.send_error("Erreur interne")

    # ========================================
    # Action Handlers
    # ========================================

    async def handle_host_join(self, data):
        """L'hôte rejoint : exige un host_token valide pour piloter la room."""
        host_token = (data.get('host_token') or '').strip()
        if not host_token:
            await self.send_error("host_token requis")
            return

        room = await self.get_room()
        if not room:
            await self.send_error("Room introuvable")
            return

        if str(room.host_token) != host_token:
            logger.warning(
                "[Quiz] Tentative d'usurpation d'hôte room=%s channel=%s",
                self.room_code, self.channel_name,
            )
            await self.send_error("host_token invalide")
            return

        self.is_host = True
        players = await self.get_players_list()
        await self.send(text_data=json.dumps({
            'type': 'host.joined',
            'room_code': self.room_code,
            'players': players,
            'status': room.status,
        }))

    async def handle_player_join(self, data):
        """Un joueur rejoint avec un pseudo (reconnexion via session_token)."""
        pseudo = data.get('pseudo', '').strip()
        session_token = (data.get('session_token') or '').strip() or None

        if not pseudo:
            await self.send_error("Pseudo requis")
            return
        if len(pseudo) > 50:
            await self.send_error("Pseudo trop long (max 50 caractères)")
            return

        room = await self.get_room()
        if not room:
            await self.send_error("Room introuvable")
            return

        player, created, error = await self.create_or_update_player(
            pseudo, room.status, session_token=session_token,
        )
        if error:
            await self.send_error(error)
            return

        self.player_id = player.id

        response_payload = {
            'type': 'player.joined',
            'player_id': player.id,
            'pseudo': player.pseudo,
            'room_code': self.room_code,
            'room_status': room.status,
        }
        # session_token renvoyé uniquement au premier join (à stocker côté client).
        if created:
            response_payload['session_token'] = str(player.session_token)
        await self.send(text_data=json.dumps(response_payload))

        # Reconnexion en cours de partie : renvoyer la question courante.
        if room.status == QuizRoom.RoomStatus.PLAYING:
            question_data = await self.get_current_question_data()
            if question_data:
                await self.send(text_data=json.dumps({
                    'type': 'game.started',
                    'question': question_data,
                }))

        players = await self.get_players_list()
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'players_updated', 'players': players},
        )

    async def handle_game_start(self, data):
        if not self.is_host:
            await self.send_error("Seul l'hôte peut démarrer la partie")
            return

        room = await self.get_room()
        if not room:
            await self.send_error("Room introuvable")
            return
        if room.status != QuizRoom.RoomStatus.WAITING:
            await self.send_error("La partie a déjà commencé")
            return

        await self.start_game()
        question_data = await self.get_current_question_data()
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'game_started', 'question': question_data},
        )

    async def handle_next_question(self, data):
        if not self.is_host:
            await self.send_error("Seul l'hôte peut piloter la partie")
            return

        room = await self.get_room()
        if not room:
            await self.send_error("Room introuvable")
            return

        has_next = await self.advance_to_next_question()
        if has_next:
            question_data = await self.get_current_question_data()
            await self.channel_layer.group_send(
                self.room_group_name,
                {'type': 'new_question', 'question': question_data},
            )
        else:
            await self.handle_game_end(data)

    async def handle_skip_question(self, data):
        await self.handle_next_question(data)

    async def handle_show_answer(self, data):
        if not self.is_host:
            await self.send_error("Seul l'hôte peut piloter la partie")
            return

        answer_data = await self.get_answer_data()
        if answer_data is None:
            # Aucune question courante (partie finie ou index hors limites) :
            # ne pas régresser le statut ni diffuser un answer=null au front.
            await self.send_error("Aucune question à révéler")
            return
        await self.set_room_status(QuizRoom.RoomStatus.SHOWING_ANSWER)
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'answer_revealed', 'answer': answer_data},
        )

    async def handle_player_answer(self, data):
        if not self.player_id:
            self.player_id = await self.get_player_from_channel()
        if not self.player_id:
            await self.send_error("Vous devez d'abord rejoindre — rafraîchissez la page")
            return

        # selected_index vient du client : caster prudemment.
        try:
            selected_index = int(data.get('selected_index'))
        except (TypeError, ValueError):
            await self.send_error("selected_index invalide")
            return

        # response_time_ms borné côté serveur (valeurs aberrantes possibles).
        try:
            response_time_ms = int(data.get('response_time_ms', 30000))
        except (TypeError, ValueError):
            response_time_ms = 30000
        response_time_ms = max(0, min(response_time_ms, 600000))

        room = await self.get_room()
        if not room:
            await self.send_error("Room introuvable")
            return
        if room.status != QuizRoom.RoomStatus.PLAYING:
            await self.send_error(f"La partie n'est pas en cours (statut : {room.status})")
            return

        result = await self.submit_answer(selected_index, response_time_ms)
        if result.get('error'):
            await self.send_error(result['error'])
            return

        await self.send(text_data=json.dumps({
            'type': 'answer.submitted',
            'is_correct': result['is_correct'],
            'points_earned': result['points_earned'],
            'total_score': result['total_score'],
        }))

        # Diffusion à TOUTE la room (comme le mode classe) : informe l'animateur,
        # ET maintient les WebSockets des joueurs actifs (un flux régulier évite
        # les fermetures par timeout proxy/mobile → plus de fausses reconnexions
        # ni de retour à l'écran question).
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'player_answered',
                'player_id': self.player_id,
                'pseudo': result['pseudo'],
            },
        )

        if await self.check_all_answered():
            await self.channel_layer.group_send(
                self.room_group_name, {'type': 'all_players_answered'},
            )

    async def handle_game_end(self, data):
        if not self.is_host:
            await self.send_error("Seul l'hôte peut piloter la partie")
            return

        await self.set_room_status(QuizRoom.RoomStatus.FINISHED)
        podium = await self.get_podium_data()
        await self.channel_layer.group_send(
            self.room_group_name,
            {'type': 'game_finished', 'podium': podium},
        )

    # ========================================
    # Group Message Handlers
    # ========================================

    async def players_updated(self, event):
        await self.send(text_data=json.dumps({
            'type': 'players.updated', 'players': event['players'],
        }))

    async def player_left(self, event):
        await self.send(text_data=json.dumps({
            'type': 'player.left', 'player_id': event['player_id'],
        }))

    async def game_started(self, event):
        await self.send(text_data=json.dumps({
            'type': 'game.started', 'question': event['question'],
        }))

    async def new_question(self, event):
        await self.send(text_data=json.dumps({
            'type': 'game.new_question', 'question': event['question'],
        }))

    async def answer_revealed(self, event):
        await self.send(text_data=json.dumps({
            'type': 'game.answer_revealed', 'answer': event['answer'],
        }))

    async def player_answered(self, event):
        await self.send(text_data=json.dumps({
            'type': 'player.answered',
            'player_id': event['player_id'],
            'pseudo': event['pseudo'],
        }))

    async def all_players_answered(self, event):
        await self.send(text_data=json.dumps({'type': 'game.all_answered'}))

    async def game_finished(self, event):
        await self.send(text_data=json.dumps({
            'type': 'game.finished', 'podium': event['podium'],
        }))

    # ========================================
    # Database Operations
    # ========================================

    def _ordered_questions(self):
        return list(QuizQuestion.objects.filter(is_active=True).order_by('order'))

    @database_sync_to_async
    def get_room(self):
        try:
            return QuizRoom.objects.get(room_code=self.room_code)
        except QuizRoom.DoesNotExist:
            return None

    @database_sync_to_async
    def get_players_list(self):
        try:
            room = QuizRoom.objects.get(room_code=self.room_code)
        except QuizRoom.DoesNotExist:
            return []
        return [
            {'id': p.id, 'pseudo': p.pseudo, 'score': p.score}
            for p in room.players.filter(is_connected=True)
        ]

    @database_sync_to_async
    def get_player_from_channel(self):
        try:
            room = QuizRoom.objects.get(room_code=self.room_code)
        except QuizRoom.DoesNotExist:
            return None
        player = room.players.filter(
            channel_name=self.channel_name, is_connected=True
        ).first()
        return player.id if player else None

    @database_sync_to_async
    def create_or_update_player(self, pseudo, room_status='waiting', session_token=None):
        try:
            room = QuizRoom.objects.get(room_code=self.room_code)
        except QuizRoom.DoesNotExist:
            return None, False, "Room introuvable"

        existing_player = room.players.filter(pseudo__iexact=pseudo).first()
        if existing_player:
            # Reconnexion légitime : session_token correct.
            if session_token and str(existing_player.session_token) == session_token:
                existing_player.is_connected = True
                existing_player.channel_name = self.channel_name
                existing_player.save()
                return existing_player, False, None
            # Sinon : pseudo déjà pris → refus (anti-usurpation).
            logger.warning(
                "[Quiz] Join pseudo déjà pris sans token valide room=%s pseudo=%s",
                self.room_code, pseudo,
            )
            return None, False, "Ce pseudo est déjà utilisé"

        if room_status != QuizRoom.RoomStatus.WAITING:
            return None, False, "La partie a déjà commencé"

        player = QuizPlayer.objects.create(
            room=room, pseudo=pseudo, channel_name=self.channel_name,
        )
        return player, True, None

    @database_sync_to_async
    def mark_player_disconnected(self):
        if self.player_id:
            try:
                player = QuizPlayer.objects.get(id=self.player_id)
                player.is_connected = False
                player.save()
            except QuizPlayer.DoesNotExist:
                pass

    @database_sync_to_async
    def start_game(self):
        room = QuizRoom.objects.get(room_code=self.room_code)
        room.status = QuizRoom.RoomStatus.PLAYING
        room.current_question_index = 0
        room.save()

    @database_sync_to_async
    def get_current_question_data(self):
        room = QuizRoom.objects.get(room_code=self.room_code)
        questions = self._ordered_questions()
        if room.current_question_index >= len(questions):
            return None
        question = questions[room.current_question_index]
        return question_payload_for_players(
            question, room.current_question_index + 1, len(questions),
        )

    @database_sync_to_async
    def advance_to_next_question(self):
        room = QuizRoom.objects.get(room_code=self.room_code)
        new_index, has_next = advance_state(
            room.current_question_index, len(self._ordered_questions()),
        )
        room.current_question_index = new_index
        # Repasser PLAYING (sortie de SHOWING_ANSWER) seulement s'il reste une
        # question ; sinon handle_game_end mettra FINISHED.
        if has_next:
            room.status = QuizRoom.RoomStatus.PLAYING
        room.save()
        return has_next

    @database_sync_to_async
    def set_room_status(self, status):
        room = QuizRoom.objects.get(room_code=self.room_code)
        room.status = status
        room.save()

    @database_sync_to_async
    def get_answer_data(self):
        room = QuizRoom.objects.get(room_code=self.room_code)
        questions = self._ordered_questions()
        if room.current_question_index >= len(questions):
            return None
        question = questions[room.current_question_index]

        answers = QuizAnswer.objects.filter(
            player__room=room, question=question,
        ).select_related('player').order_by('answer_order')
        player_results = [
            {
                'pseudo': a.player.pseudo,
                'is_correct': a.is_correct,
                'points_earned': a.points_earned,
                'response_time_ms': a.response_time_ms,
            }
            for a in answers
        ]
        return answer_payload(question, player_results)

    @database_sync_to_async
    def submit_answer(self, selected_index, response_time_ms):
        try:
            room = QuizRoom.objects.get(room_code=self.room_code)
            player = QuizPlayer.objects.get(id=self.player_id)
            questions = self._ordered_questions()
            if room.current_question_index >= len(questions):
                return {'error': "Aucune question en cours"}
            question = questions[room.current_question_index]

            if not (0 <= selected_index < len(question.choices)):
                return {'error': "selected_index hors limites"}

            if QuizAnswer.objects.filter(player=player, question=question).exists():
                return {'error': "Déjà répondu"}

            is_correct = (selected_index == question.correct_index)

            correct_before = QuizAnswer.objects.filter(
                player__room=room, question=question, is_correct=True,
            ).count() if is_correct else 0
            points_earned = compute_points(is_correct, correct_before)

            answer_order = QuizAnswer.objects.filter(
                player__room=room, question=question,
            ).count() + 1

            QuizAnswer.objects.create(
                player=player,
                question=question,
                selected_index=selected_index,
                is_correct=is_correct,
                response_time_ms=response_time_ms,
                points_earned=points_earned,
                answer_order=answer_order,
            )
            player.score += points_earned
            player.save()

            return {
                'is_correct': is_correct,
                'points_earned': points_earned,
                'total_score': player.score,
                'pseudo': player.pseudo,
            }
        except Exception:
            logger.exception("Erreur lors de la soumission d'une réponse quiz")
            return {'error': "Erreur interne lors de la soumission"}

    @database_sync_to_async
    def check_all_answered(self):
        room = QuizRoom.objects.get(room_code=self.room_code)
        questions = self._ordered_questions()
        if room.current_question_index >= len(questions):
            return True
        question = questions[room.current_question_index]
        connected = room.players.filter(is_connected=True).count()
        answered = QuizAnswer.objects.filter(
            player__room=room, player__is_connected=True, question=question,
        ).count()
        return connected > 0 and answered >= connected

    @database_sync_to_async
    def get_podium_data(self):
        room = QuizRoom.objects.get(room_code=self.room_code)
        players = room.players.order_by('-score', 'joined_at')
        return [
            {'rank': idx + 1, 'id': p.id, 'pseudo': p.pseudo, 'score': p.score}
            for idx, p in enumerate(players)
        ]

    # ========================================
    # Helpers
    # ========================================

    async def send_error(self, message):
        await self.send(text_data=json.dumps({'type': 'error', 'message': message}))
