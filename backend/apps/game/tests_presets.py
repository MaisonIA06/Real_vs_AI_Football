"""
Tests de la sélection préchoisie ordonnée du mode classe (preset).

TestCase standard (rollback transactionnel) — surtout PAS TransactionTestCase,
qui casse au flush à cause de la table orpheline game_quizpair (cf. CLAUDE.md).
"""
import tempfile

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.game.models import Category, MediaPair, MultiplayerRoom
from apps.game.consumers import ordered_pairs_for_room
from apps.game import presets


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class PresetResolveTests(TestCase):
    def setUp(self):
        self.cat = Category.objects.create(name="PresetCat")
        # Crée des MediaPair dont les real_media correspondent au preset 'foot'.
        self.paths = presets.PAIR_PRESETS['foot']
        self.created = {}
        for path in self.paths:
            mp = MediaPair.objects.create(
                category=self.cat, media_type='video', real_media=path,
            )
            self.created[path] = mp

    def test_resolve_preset_returns_pairs_in_order(self):
        pairs = presets.resolve_preset('foot')
        self.assertEqual([p.real_media.name for p in pairs], self.paths)

    def test_resolve_unknown_preset_is_empty(self):
        self.assertEqual(presets.resolve_preset('inexistant'), [])

    def test_resolve_skips_missing_pairs(self):
        # Supprimer une paire : le preset reste résolu avec les autres, dans l'ordre.
        self.created[self.paths[3]].delete()
        pairs = presets.resolve_preset('foot')
        self.assertEqual(len(pairs), len(self.paths) - 1)
        self.assertNotIn(self.paths[3], [p.real_media.name for p in pairs])


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class OrderedPairsForRoomTests(TestCase):
    def setUp(self):
        self.cat = Category.objects.create(name="OrderCat")
        self.p1 = MediaPair.objects.create(category=self.cat, media_type='image', real_media='a.jpg')
        self.p2 = MediaPair.objects.create(category=self.cat, media_type='image', real_media='b.jpg')
        self.p3 = MediaPair.objects.create(category=self.cat, media_type='image', real_media='c.jpg')

    def test_falls_back_to_id_order_without_preset(self):
        room = MultiplayerRoom.objects.create()
        room.pairs.set([self.p3, self.p1, self.p2])
        ordered = ordered_pairs_for_room(room)
        self.assertEqual([p.id for p in ordered], sorted([self.p1.id, self.p2.id, self.p3.id]))

    def test_respects_ordered_pair_ids(self):
        room = MultiplayerRoom.objects.create(
            ordered_pair_ids=[self.p3.id, self.p1.id, self.p2.id]
        )
        room.pairs.set([self.p1, self.p2, self.p3])
        ordered = ordered_pairs_for_room(room)
        self.assertEqual([p.id for p in ordered], [self.p3.id, self.p1.id, self.p2.id])


@override_settings(MEDIA_ROOT=tempfile.mkdtemp())
class MultiplayerRoomCreatePresetTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.cat = Category.objects.create(name="ApiCat")
        for path in presets.PAIR_PRESETS['foot']:
            MediaPair.objects.create(category=self.cat, media_type='video', real_media=path)

    def test_create_without_preset_leaves_order_empty(self):
        resp = self.client.post('/api/game/multiplayer/rooms/', {}, format='json')
        self.assertEqual(resp.status_code, 201)
        self.assertIsNone(resp.json()['preset'])
        room = MultiplayerRoom.objects.get(room_code=resp.json()['room_code'])
        self.assertEqual(room.ordered_pair_ids, [])

    def test_create_with_foot_preset_freezes_ordered_selection(self):
        resp = self.client.post('/api/game/multiplayer/rooms/', {'preset': 'foot'}, format='json')
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data['preset'], 'foot')
        self.assertEqual(data['pairs_count'], len(presets.PAIR_PRESETS['foot']))

        room = MultiplayerRoom.objects.get(room_code=data['room_code'])
        # L'ordre figé doit correspondre exactement à l'ordre du preset.
        expected = [
            MediaPair.objects.get(real_media=path).id
            for path in presets.PAIR_PRESETS['foot']
        ]
        self.assertEqual(room.ordered_pair_ids, expected)
        self.assertEqual(room.pairs.count(), len(expected))

    def test_create_with_unknown_preset_returns_400(self):
        # Un preset inconnu doit échouer visiblement (pas de fallback silencieux),
        # et ne pas créer de room orpheline.
        before = MultiplayerRoom.objects.count()
        resp = self.client.post('/api/game/multiplayer/rooms/', {'preset': 'zzz'}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('error', resp.json())
        self.assertEqual(MultiplayerRoom.objects.count(), before)

    def test_create_with_incomplete_preset_returns_400(self):
        # Si une paire du preset manque en base, refuser (event tronqué = visible).
        MediaPair.objects.get(real_media=presets.PAIR_PRESETS['foot'][0]).delete()
        before = MultiplayerRoom.objects.count()
        resp = self.client.post('/api/game/multiplayer/rooms/', {'preset': 'foot'}, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('incomplet', resp.json()['error'])
        self.assertEqual(MultiplayerRoom.objects.count(), before)
