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
