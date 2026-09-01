import os
import tempfile
from unittest.mock import patch

from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, Client, SimpleTestCase, override_settings

from apps.game.consumers import MultiplayerConsumer
from apps.game.models import Category, MediaPair
from apps.game.routing import websocket_urlpatterns
from apps.game.serializers import MediaPairGameSerializer


class QuizAppRemovedTests(SimpleTestCase):
    """L'app quiz (ex-Quiz Foot / Event Foot) a été retirée du projet."""

    def test_quiz_app_not_installed(self):
        self.assertNotIn('apps.quiz', settings.INSTALLED_APPS)


class PresetsRemovedTests(TestCase):
    """Le mécanisme de preset (sélection Foot de l'Event Foot) a été retiré.

    La création de room redevient uniquement aléatoire : un éventuel champ
    `preset` dans le payload est ignoré au lieu de piloter (ou refuser) la
    sélection des paires.
    """

    def test_create_room_ignores_preset_field(self):
        response = Client().post(
            '/api/game/multiplayer/rooms/',
            {'preset': 'foot'},
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 201)
        payload = response.json()
        self.assertIn('room_code', payload)
        self.assertIn('host_token', payload)
        self.assertNotIn('preset', payload)

    def test_room_model_has_no_ordered_pair_ids_field(self):
        from apps.game.models import MultiplayerRoom
        field_names = [f.name for f in MultiplayerRoom._meta.get_fields()]
        self.assertNotIn('ordered_pair_ids', field_names)


class HealthEndpointTests(TestCase):
    def test_health_endpoint_reports_database_and_cache_status(self):
        response = Client().get('/health/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'application/json')
        payload = response.json()
        self.assertEqual(payload['status'], 'ok')
        self.assertEqual(payload['database'], 'ok')
        self.assertIn(payload['cache'], ['ok', 'unavailable'])


# Routing brut (sans AllowedHostsOriginValidator ni AuthMiddleware) : on teste
# l'autorisation applicative du consumer, pas l'origine ni l'auth de session.
ws_application = URLRouter(websocket_urlpatterns)


async def _async_noop(*args, **kwargs):
    return None


async def _async_empty_list(*args, **kwargs):
    return []


@override_settings(
    CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}
)
class GameEndAuthorizationTests(SimpleTestCase):
    """Sécurité multijoueur : seul l'hôte peut terminer la partie (game.end).

    On neutralise les accès DB de game.end (set_room_status / get_podium_data)
    pour tester UNIQUEMENT l'autorisation, sans dépendre de la base.
    """

    async def test_non_host_cannot_end_game(self):
        with patch.object(MultiplayerConsumer, 'set_room_status', _async_noop), \
             patch.object(MultiplayerConsumer, 'get_podium_data', _async_empty_list):
            communicator = WebsocketCommunicator(
                ws_application, '/ws/multiplayer/TESTROOM/'
            )
            connected, _ = await communicator.connect()
            self.assertTrue(connected)

            # Client qui n'a jamais fait host.join (is_host=False) : sans la garde,
            # game.end terminerait la partie et diffuserait game.finished.
            await communicator.send_json_to({'action': 'game.end'})
            response = await communicator.receive_json_from()

            self.assertEqual(
                response.get('type'), 'error',
                "Un non-hôte ne doit pas pouvoir déclencher game.end",
            )

            await communicator.disconnect()


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class OpaqueMediaUrlTests(TestCase):
    """Constat B : les URLs média de jeu ne doivent pas révéler réel/IA.

    L'ancienne implémentation renvoyait /media/pairs/ai/...(_AI) → la réponse
    était lisible dans l'URL. Désormais les URLs sont opaques (/media/q/<hmac>).
    """

    def test_game_media_urls_do_not_reveal_real_or_ai(self):
        category = Category.objects.create(name="Test")
        pair = MediaPair.objects.create(
            category=category,
            media_type='image',
            real_media=SimpleUploadedFile('Lion.jpg', b'realbytes', content_type='image/jpeg'),
            ai_media=SimpleUploadedFile('Lion_AI.png', b'aibytes', content_type='image/png'),
        )

        # real sur la gauche, IA sur la droite
        data = MediaPairGameSerializer(pair, context={'positions': {pair.id: 'left'}}).data

        for url in (data['left_media'], data['right_media']):
            self.assertIsNotNone(url)
            self.assertIn('/media/q/', url)
            lowered = url.lower()
            for leaky in ('pairs', '/ai/', '/real/', '_ai', 'lion'):
                self.assertNotIn(leaky, lowered, f"URL fuite l'indice '{leaky}' : {url}")

        # Le symlink opaque doit exister et résoudre vers le bon fichier
        # (left = real ici) — prouve que le service fonctionne, pas juste l'URL.
        link_name = data['left_media'].rsplit('/', 1)[1]
        link_path = os.path.join(settings.MEDIA_ROOT, 'q', link_name)
        self.assertTrue(os.path.exists(link_path), "Le symlink opaque doit exister")
        with open(link_path, 'rb') as fh:
            self.assertEqual(fh.read(), b'realbytes')


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class ActiveCategoryFilterTests(TestCase):
    """La catégorie active (GameSettings) restreint le tirage des paires,
    en solo comme en mode classe. Null = toutes les catégories."""

    def setUp(self):
        from apps.game.models import GameSettings  # noqa: F401 (usage ci-dessous)
        self.animal = Category.objects.create(name='Animal')
        self.paysage = Category.objects.create(name='Paysage')
        self.animal_pairs = [self._make_pair(self.animal, f'A{i}') for i in range(3)]
        self.paysage_pairs = [self._make_pair(self.paysage, f'P{i}') for i in range(3)]

    def _make_pair(self, category, name):
        return MediaPair.objects.create(
            category=category,
            media_type='image',
            real_media=SimpleUploadedFile(f'{name}.jpg', b'r', content_type='image/jpeg'),
            ai_media=SimpleUploadedFile(f'{name}_AI.jpg', b'a', content_type='image/jpeg'),
        )

    def _activate(self, category):
        from apps.game.models import GameSettings
        obj = GameSettings.load()
        obj.active_category = category
        obj.save()

    def test_playable_pairs_defaults_to_all_categories(self):
        from apps.game.models import playable_pairs
        self.assertEqual(playable_pairs().count(), 6)

    def test_playable_pairs_filters_by_active_category(self):
        from apps.game.models import playable_pairs
        self._activate(self.animal)

        pairs = list(playable_pairs())

        self.assertEqual(len(pairs), 3)
        self.assertTrue(all(p.category_id == self.animal.id for p in pairs))

    def test_solo_session_only_draws_from_active_category(self):
        self._activate(self.animal)

        response = Client().post(
            '/api/game/sessions/',
            {'audience_type': 'public'},
            content_type='application/json',
        )

        self.assertEqual(response.status_code, 201)
        returned_ids = {p['id'] for p in response.json()['pairs']}
        self.assertEqual(returned_ids, {p.id for p in self.animal_pairs})

    def test_multiplayer_start_game_only_draws_from_active_category(self):
        from apps.game.models import MultiplayerRoom
        self._activate(self.paysage)
        room = MultiplayerRoom.objects.create()

        consumer = MultiplayerConsumer()
        consumer.room_code = room.room_code
        # Version sync appelée directement dans le même thread pour rester
        # compatible TestCase (TransactionTestCase est cassé par la table
        # orpheline game_quizpair).
        consumer.start_game_sync()

        room.refresh_from_db()
        self.assertEqual(
            {p.id for p in room.pairs.all()},
            {p.id for p in self.paysage_pairs},
        )
