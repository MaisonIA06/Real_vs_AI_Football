"""
WebSocket consumers for multiplayer game.
"""
import json
import logging
import random
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.utils import timezone

from .models import MultiplayerRoom, MultiplayerPlayer, MultiplayerAnswer, MediaPair

logger = logging.getLogger(__name__)


class MultiplayerConsumer(AsyncWebsocketConsumer):
    """WebSocket consumer for multiplayer game rooms."""
    
    async def connect(self):
        """Handle WebSocket connection."""
        # Normalize room code to uppercase
        self.room_code = self.scope['url_route']['kwargs']['room_code'].upper()
        self.room_group_name = f'multiplayer_{self.room_code}'
        self.player_id = None
        self.is_host = False
        
        print(f"[WS] New connection to room {self.room_code}, channel: {self.channel_name}")
        
        # Join room group
        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )
        
        await self.accept()
    
    async def disconnect(self, close_code):
        """Handle WebSocket disconnection."""
        # Mark player as disconnected
        if self.player_id:
            await self.mark_player_disconnected()
            # Notify others
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'player_left',
                    'player_id': self.player_id,
                }
            )
        
        # Leave room group
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )
    
    async def receive(self, text_data):
        """Handle incoming WebSocket messages."""
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
                await self.send_error(f"Unknown action: {action}")
                
        except json.JSONDecodeError:
            await self.send_error("Invalid JSON")
        except Exception:
            logger.exception("Unhandled error in WebSocket receive")
            await self.send_error("Erreur interne")
    
    # ========================================
    # Action Handlers
    # ========================================
    
    async def handle_host_join(self, data):
        """Host joins and creates/connects to the room.

        Requires a valid `host_token` matching the one stored on the room
        (returned only to the creator via POST /api/game/multiplayer/rooms/).
        """
        host_token = (data.get('host_token') or '').strip()
        if not host_token:
            await self.send_error("host_token requis")
            return

        room = await self.get_room()
        if not room:
            await self.send_error("Room not found")
            return

        if str(room.host_token) != host_token:
            logger.warning(
                "[WS] Tentative d'usurpation d'hôte pour la room %s (channel=%s)",
                self.room_code, self.channel_name,
            )
            await self.send_error("host_token invalide")
            return

        self.is_host = True
        print(f"[WS] Host joined room {self.room_code}, channel: {self.channel_name}")

        players = await self.get_players_list()

        await self.send(text_data=json.dumps({
            'type': 'host.joined',
            'room_code': self.room_code,
            'players': players,
            'status': room.status,
        }))
    
    async def handle_player_join(self, data):
        """Player joins the room with a pseudo.

        - Premier join: pas de session_token, le serveur crée le joueur et renvoie un token.
        - Reconnexion: le client doit renvoyer le session_token reçu à la création.
        - Un autre client qui tente de rejoindre avec un pseudo déjà pris est refusé.
        """
        pseudo = data.get('pseudo', '').strip()
        session_token = (data.get('session_token') or '').strip() or None

        if not pseudo:
            await self.send_error("Pseudo required")
            return

        if len(pseudo) > 50:
            await self.send_error("Pseudo too long (max 50 characters)")
            return

        room = await self.get_room()
        if not room:
            await self.send_error("Room not found")
            return

        # Create or update player (this handles reconnection)
        player, created, error = await self.create_or_update_player(
            pseudo, room.status, session_token=session_token,
        )

        if error:
            await self.send_error(error)
            return

        self.player_id = player.id

        print(f"[WS] Player {player.pseudo} (ID: {player.id}) joined room {self.room_code}, channel: {self.channel_name}, room_status: {room.status}")

        # Send confirmation to player with room status for reconnection handling.
        # Le session_token n'est renvoyé qu'au premier join (création) pour que le
        # client le stocke; on ne le renvoie pas aux reconnexions légitimes.
        response_payload = {
            'type': 'player.joined',
            'player_id': player.id,
            'pseudo': player.pseudo,
            'room_code': self.room_code,
            'room_status': room.status,
        }
        if created:
            response_payload['session_token'] = str(player.session_token)
        await self.send(text_data=json.dumps(response_payload))
        
        # If game is in progress, send current question to the player (reconnection case)
        if room.status == 'playing':
            question_data = await self.get_current_question_data()
            if question_data:
                print(f"[WS] Sending current question to reconnecting player {player.pseudo}")
                await self.send(text_data=json.dumps({
                    'type': 'game.started',
                    'question': question_data,
                }))
        
        # Notify all (especially host) about new player
        players = await self.get_players_list()
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'players_updated',
                'players': players,
            }
        )
    
    async def handle_game_start(self, data):
        """Host starts the game."""
        if not self.is_host:
            await self.send_error("Only host can start the game")
            return
        
        room = await self.get_room()
        if not room:
            await self.send_error("Room not found")
            return
        
        if room.status != 'waiting':
            await self.send_error("Game already started")
            return
        
        # Start the game
        await self.start_game()
        
        # Get first question data
        question_data = await self.get_current_question_data()
        
        print(f"[WS] Starting game in room {self.room_code}, broadcasting to group {self.room_group_name}")
        
        # Notify all players
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'game_started',
                'question': question_data,
            }
        )
        
        print(f"[WS] game_started broadcast sent to group {self.room_group_name}")
    
    async def handle_next_question(self, data):
        """Host moves to the next question."""
        if not self.is_host:
            await self.send_error("Only host can control the game")
            return
        
        room = await self.get_room()
        if not room:
            await self.send_error("Room not found")
            return
        
        # Move to next question
        has_next = await self.advance_to_next_question()
        
        if has_next:
            question_data = await self.get_current_question_data()
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'new_question',
                    'question': question_data,
                }
            )
        else:
            # Game finished
            await self.handle_game_end(data)
    
    async def handle_skip_question(self, data):
        """Host skips the current question."""
        await self.handle_next_question(data)
    
    async def handle_show_answer(self, data):
        """Host shows the correct answer."""
        if not self.is_host:
            await self.send_error("Only host can control the game")
            return
        
        room = await self.get_room()
        answer_data = await self.get_answer_data()
        
        await self.set_room_status('showing_answer')
        
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'answer_revealed',
                'answer': answer_data,
            }
        )
    
    async def handle_player_answer(self, data):
        """Player submits an answer."""
        print(f"[WS] handle_player_answer called, player_id={self.player_id}, channel={self.channel_name}")
        
        # Récupérer player_id depuis la base de données si perdu
        if not self.player_id:
            print(f"[WS] player_id is None, trying to recover from database...")
            self.player_id = await self.get_player_from_channel()
            print(f"[WS] Recovered player_id: {self.player_id}")
        
        if not self.player_id:
            print(f"[WS] ERROR: Could not find player for channel {self.channel_name}")
            await self.send_error("You must join first - please refresh the page")
            return
        
        choice = data.get('choice')
        # J: le temps vient du client — le caster et le borner côté serveur,
        # ne jamais l'insérer brut (valeurs négatives/géantes/non-int).
        try:
            response_time_ms = int(data.get('response_time_ms', 30000))
        except (TypeError, ValueError):
            response_time_ms = 30000
        response_time_ms = max(0, min(response_time_ms, 600000))

        print(f"[WS] Player {self.player_id} answering with choice={choice}, time={response_time_ms}ms")
        
        if choice not in ['left', 'right', 'real', 'ai']:
            await self.send_error("Invalid choice")
            return
        
        room = await self.get_room()
        if not room:
            await self.send_error("Room not found")
            return
            
        if room.status != 'playing':
            print(f"[WS] ERROR: Game not in progress, room status={room.status}")
            await self.send_error(f"Game not in progress (status: {room.status})")
            return
        
        # Submit answer
        result = await self.submit_answer(choice, response_time_ms)
        
        if result.get('error'):
            await self.send_error(result['error'])
            return
        
        # Send confirmation to player
        await self.send(text_data=json.dumps({
            'type': 'answer.submitted',
            'is_correct': result['is_correct'],
            'points_earned': result['points_earned'],
            'total_score': result['total_score'],
        }))
        
        # Notify host about player's answer
        print(f"[WS] Sending player_answered to group {self.room_group_name} for player {self.player_id} ({result['pseudo']})")
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'player_answered',
                'player_id': self.player_id,
                'pseudo': result['pseudo'],
                'answered': True,
            }
        )
        
        # Check if all players answered
        all_answered = await self.check_all_answered()
        if all_answered:
            await self.channel_layer.group_send(
                self.room_group_name,
                {
                    'type': 'all_players_answered',
                }
            )
    
    async def handle_game_end(self, data):
        """End the game and show final results."""
        await self.set_room_status('finished')
        
        podium = await self.get_podium_data()
        
        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'game_finished',
                'podium': podium,
            }
        )
    
    # ========================================
    # Group Message Handlers
    # ========================================
    
    async def players_updated(self, event):
        """Send players list update to all."""
        await self.send(text_data=json.dumps({
            'type': 'players.updated',
            'players': event['players'],
        }))
    
    async def player_left(self, event):
        """Notify about player disconnection."""
        await self.send(text_data=json.dumps({
            'type': 'player.left',
            'player_id': event['player_id'],
        }))
    
    async def game_started(self, event):
        """Notify that game has started."""
        print(f"[WS] game_started handler called for channel {self.channel_name}, is_host={self.is_host}, player_id={self.player_id}")
        await self.send(text_data=json.dumps({
            'type': 'game.started',
            'question': event['question'],
        }))
        print(f"[WS] game.started message sent to channel {self.channel_name}")
    
    async def new_question(self, event):
        """Send new question to all."""
        await self.send(text_data=json.dumps({
            'type': 'game.new_question',
            'question': event['question'],
        }))
    
    async def answer_revealed(self, event):
        """Send correct answer to all."""
        await self.send(text_data=json.dumps({
            'type': 'game.answer_revealed',
            'answer': event['answer'],
        }))
    
    async def player_answered(self, event):
        """Notify that a player has answered."""
        print(f"[WS] player_answered handler called for channel {self.channel_name}, is_host={self.is_host}")
        await self.send(text_data=json.dumps({
            'type': 'player.answered',
            'player_id': event['player_id'],
            'pseudo': event['pseudo'],
        }))
    
    async def all_players_answered(self, event):
        """Notify that all players have answered."""
        await self.send(text_data=json.dumps({
            'type': 'game.all_answered',
        }))
    
    async def game_finished(self, event):
        """Send final results."""
        await self.send(text_data=json.dumps({
            'type': 'game.finished',
            'podium': event['podium'],
        }))
    
    # ========================================
    # Database Operations
    # ========================================
    
    @database_sync_to_async
    def get_room(self):
        """Get the room by code."""
        try:
            return MultiplayerRoom.objects.get(room_code=self.room_code)
        except MultiplayerRoom.DoesNotExist:
            return None
    
    @database_sync_to_async
    def get_players_list(self):
        """Get list of connected players."""
        try:
            room = MultiplayerRoom.objects.get(room_code=self.room_code)
            players = room.players.filter(is_connected=True)
            return [
                {
                    'id': p.id,
                    'pseudo': p.pseudo,
                    'score': p.score,
                }
                for p in players
            ]
        except MultiplayerRoom.DoesNotExist:
            return []
    
    @database_sync_to_async
    def get_player_from_channel(self):
        """Get player ID from channel_name stored in database."""
        try:
            room = MultiplayerRoom.objects.get(room_code=self.room_code)
            player = room.players.filter(
                channel_name=self.channel_name,
                is_connected=True
            ).first()
            return player.id if player else None
        except MultiplayerRoom.DoesNotExist:
            return None
    
    @database_sync_to_async
    def create_or_update_player(self, pseudo, room_status='waiting', session_token=None):
        """Create a new player or update existing one.

        Reconnexion: `session_token` doit matcher le token stocké sur le joueur.
        Nouveau joueur: si le pseudo existe déjà (même déconnecté), on refuse pour
        éviter l'usurpation par simple saisie du pseudo.
        """
        try:
            room = MultiplayerRoom.objects.get(room_code=self.room_code)

            existing_player = room.players.filter(pseudo__iexact=pseudo).first()

            # Cas 1: un joueur existe déjà avec ce pseudo
            if existing_player:
                # Reconnexion légitime: session_token fourni et correct
                if session_token and str(existing_player.session_token) == session_token:
                    existing_player.is_connected = True
                    existing_player.channel_name = self.channel_name
                    existing_player.save()
                    print(f"[DB] Player {pseudo} reconnected to room {self.room_code}")
                    return existing_player, False, None

                # Pas de token ou token invalide → refuser (usurpation potentielle)
                logger.warning(
                    "[WS] Tentative de join avec pseudo déjà pris sans token valide: "
                    "room=%s pseudo=%s", self.room_code, pseudo,
                )
                return None, False, "Ce pseudo est déjà utilisé"

            # Cas 2: nouveau joueur
            if room_status != 'waiting':
                # Don't allow new players to join once game has started
                return None, False, "La partie a déjà commencé"

            # Create new player
            player = MultiplayerPlayer.objects.create(
                room=room,
                pseudo=pseudo,
                channel_name=self.channel_name,
            )
            print(f"[DB] New player {pseudo} created in room {self.room_code}")
            return player, True, None

        except MultiplayerRoom.DoesNotExist:
            return None, False, "Room not found"
    
    @database_sync_to_async
    def mark_player_disconnected(self):
        """Mark the current player as disconnected."""
        if self.player_id:
            try:
                player = MultiplayerPlayer.objects.get(id=self.player_id)
                player.is_connected = False
                player.save()
            except MultiplayerPlayer.DoesNotExist:
                pass
    
    @database_sync_to_async
    def start_game(self):
        """Start the game and prepare questions."""
        room = MultiplayerRoom.objects.get(room_code=self.room_code)
        
        # Get 10 random pairs
        all_pairs = list(MediaPair.objects.filter(is_active=True))
        pairs = random.sample(all_pairs, min(10, len(all_pairs)))
        
        room.pairs.set(pairs)
        
        # Generate random AI positions
        positions = {}
        for pair in pairs:
            if pair.media_type != 'audio':
                positions[str(pair.id)] = random.choice(['left', 'right'])
        
        room.ai_positions = positions
        room.status = 'playing'
        room.current_pair_index = 0
        room.save()
    
    @database_sync_to_async
    def get_current_question_data(self):
        """Get data for the current question."""
        room = MultiplayerRoom.objects.get(room_code=self.room_code)
        # Sort pairs by ID for consistent ordering
        pairs = list(room.pairs.all().order_by('id'))
        
        if room.current_pair_index >= len(pairs):
            return None
        
        pair = pairs[room.current_pair_index]
        # Default to 'right' if ai_position is not set (AI on right, real on left)
        ai_position = room.ai_positions.get(str(pair.id), 'right')
        
        # Build media URLs
        data = {
            'pair_id': pair.id,
            'question_number': room.current_pair_index + 1,
            'total_questions': len(pairs),
            'media_type': pair.media_type,
            'category': pair.category.name if pair.category else 'Général',
            'difficulty': pair.difficulty,
        }
        
        if pair.media_type == 'audio':
            data['audio_media'] = pair.audio_media.url if pair.audio_media else None
            data['is_real'] = pair.is_real
        else:
            # Position real and AI media based on random position
            if ai_position == 'left':
                data['left_media'] = pair.ai_media.url if pair.ai_media else None
                data['right_media'] = pair.real_media.url if pair.real_media else None
            else:
                data['left_media'] = pair.real_media.url if pair.real_media else None
                data['right_media'] = pair.ai_media.url if pair.ai_media else None
        
        return data
    
    @database_sync_to_async
    def advance_to_next_question(self):
        """Move to the next question. Returns True if there are more questions."""
        room = MultiplayerRoom.objects.get(room_code=self.room_code)
        room.current_pair_index += 1
        room.status = 'playing'
        room.save()
        
        return room.current_pair_index < room.pairs.count()
    
    @database_sync_to_async
    def set_room_status(self, status):
        """Set the room status."""
        room = MultiplayerRoom.objects.get(room_code=self.room_code)
        room.status = status
        room.save()
    
    @database_sync_to_async
    def get_answer_data(self):
        """Get the correct answer data for the current question."""
        room = MultiplayerRoom.objects.get(room_code=self.room_code)
        # Sort pairs by ID for consistent ordering
        pairs = list(room.pairs.all().order_by('id'))
        
        if room.current_pair_index >= len(pairs):
            return None
        
        pair = pairs[room.current_pair_index]
        ai_position = room.ai_positions.get(str(pair.id), 'right')
        
        # Get player scores for this question
        answers = MultiplayerAnswer.objects.filter(
            player__room=room,
            media_pair=pair
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
        
        return {
            'pair_id': pair.id,
            'ai_position': ai_position if pair.media_type != 'audio' else ('ai' if not pair.is_real else 'real'),
            'hint': pair.hint,
            'player_results': player_results,
        }
    
    @database_sync_to_async
    def submit_answer(self, choice, response_time_ms):
        """Submit a player's answer."""
        try:
            room = MultiplayerRoom.objects.get(room_code=self.room_code)
            player = MultiplayerPlayer.objects.get(id=self.player_id)
            # Sort pairs by ID for consistent ordering
            pairs = list(room.pairs.all().order_by('id'))
            
            if room.current_pair_index >= len(pairs):
                return {'error': 'No current question'}
            
            pair = pairs[room.current_pair_index]
            
            # Check if already answered
            if MultiplayerAnswer.objects.filter(player=player, media_pair=pair).exists():
                return {'error': 'Already answered'}
            
            # Determine if correct
            if pair.media_type == 'audio':
                is_correct = (
                    (choice == 'real' and pair.is_real is True) or
                    (choice == 'ai' and pair.is_real is False)
                )
            else:
                ai_position = room.ai_positions.get(str(pair.id), 'right')
                is_correct = (choice == ai_position)
            
            # Calculate points with position bonus
            base_points = 100 if is_correct else 0
            position_bonus = 0
            
            if is_correct:
                # Count how many correct answers before this one
                correct_before = MultiplayerAnswer.objects.filter(
                    player__room=room,
                    media_pair=pair,
                    is_correct=True
                ).count()
                
                # Bonus: 1st = +50, 2nd = +30, 3rd = +10
                if correct_before == 0:
                    position_bonus = 50
                elif correct_before == 1:
                    position_bonus = 30
                elif correct_before == 2:
                    position_bonus = 10
            
            points_earned = base_points + position_bonus
            
            # Get answer order
            answer_order = MultiplayerAnswer.objects.filter(
                player__room=room,
                media_pair=pair
            ).count() + 1
            
            # Create answer
            MultiplayerAnswer.objects.create(
                player=player,
                media_pair=pair,
                choice=choice,
                is_correct=is_correct,
                response_time_ms=response_time_ms,
                points_earned=points_earned,
                answer_order=answer_order,
            )
            
            # Update player score
            player.score += points_earned
            player.save()
            
            return {
                'is_correct': is_correct,
                'points_earned': points_earned,
                'total_score': player.score,
                'pseudo': player.pseudo,
            }
            
        except Exception:
            logger.exception("Error while submitting multiplayer answer")
            return {'error': 'Erreur interne lors de la soumission'}
    
    @database_sync_to_async
    def check_all_answered(self):
        """Check if all connected players have answered the current question."""
        room = MultiplayerRoom.objects.get(room_code=self.room_code)
        # Sort pairs by ID for consistent ordering
        pairs = list(room.pairs.all().order_by('id'))
        
        if room.current_pair_index >= len(pairs):
            return True
        
        pair = pairs[room.current_pair_index]
        
        connected_players = room.players.filter(is_connected=True).count()
        answered = MultiplayerAnswer.objects.filter(
            player__room=room,
            player__is_connected=True,
            media_pair=pair
        ).count()
        
        return answered >= connected_players
    
    @database_sync_to_async
    def get_podium_data(self):
        """Get final podium/leaderboard data."""
        room = MultiplayerRoom.objects.get(room_code=self.room_code)
        players = room.players.order_by('-score', 'joined_at')
        
        return [
            {
                'rank': idx + 1,
                'id': p.id,
                'pseudo': p.pseudo,
                'score': p.score,
            }
            for idx, p in enumerate(players)
        ]
    
    # ========================================
    # Helpers
    # ========================================
    
    async def send_error(self, message):
        """Send error message to client."""
        await self.send(text_data=json.dumps({
            'type': 'error',
            'message': message,
        }))

