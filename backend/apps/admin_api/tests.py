"""
Tests de l'API admin — réglages du jeu (catégorie active).

Le réglage `active_category` (GameSettings, singleton) restreint le tirage des
paires à une seule catégorie ; null = toutes les catégories (défaut).
"""
import tempfile

from django.contrib.auth.models import User
from django.test import override_settings
from rest_framework.test import APITestCase

from apps.game.models import Category, GameSettings


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class GameSettingsEndpointTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('admin', 'a@a.fr', 'x')
        self.category = Category.objects.create(name='Animal')

    def test_requires_admin_auth(self):
        response = self.client.get('/api/admin/settings/')
        self.assertIn(response.status_code, [401, 403])

    def test_default_is_all_categories(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get('/api/admin/settings/')

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()['active_category'])

    def test_set_active_category(self):
        self.client.force_authenticate(self.admin)
        response = self.client.put(
            '/api/admin/settings/',
            {'active_category': self.category.id},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['active_category'], self.category.id)
        self.assertEqual(payload['active_category_name'], 'Animal')
        self.assertEqual(GameSettings.load().active_category, self.category)

    def test_reset_to_all_categories(self):
        GameSettings.load()  # crée le singleton
        GameSettings.objects.update(active_category=self.category)
        self.client.force_authenticate(self.admin)

        response = self.client.put(
            '/api/admin/settings/', {'active_category': None}, format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()['active_category'])
        self.assertIsNone(GameSettings.load().active_category)

    def test_unknown_category_rejected(self):
        self.client.force_authenticate(self.admin)
        response = self.client.put(
            '/api/admin/settings/', {'active_category': 999999}, format='json',
        )

        self.assertEqual(response.status_code, 400)
