"""
Tests de l'étape 2 du Quiz Foot : API REST (création / détail de room).

Contrat de sécurité (calqué sur le multijoueur) : `host_token` n'est renvoyé
QU'À la création de la room, jamais par le GET détail (route publique).
"""
from django.test import TestCase
from rest_framework.test import APIClient

from apps.quiz.models import QuizRoom, QuizQuestion


class QuizRoomCreateApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def test_create_room_returns_host_token_and_code(self):
        resp = self.client.post('/api/quiz/rooms/')
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(len(data['room_code']), 6)
        self.assertIn('host_token', data)
        self.assertEqual(data['status'], QuizRoom.RoomStatus.WAITING)
        # La room existe bien en base
        self.assertTrue(QuizRoom.objects.filter(room_code=data['room_code']).exists())

    def test_create_room_exposes_question_count(self):
        QuizQuestion.objects.create(order=1, question_text="Q", choices=["A", "B"], correct_index=0)
        resp = self.client.post('/api/quiz/rooms/')
        self.assertEqual(resp.json()['question_count'], 1)


class QuizRoomDetailApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.room = QuizRoom.objects.create()

    def test_detail_never_leaks_host_token(self):
        resp = self.client.get(f'/api/quiz/rooms/{self.room.room_code}/')
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertNotIn('host_token', data)
        self.assertEqual(data['room_code'], self.room.room_code)
        self.assertEqual(data['status'], QuizRoom.RoomStatus.WAITING)
        self.assertIn('players_count', data)

    def test_detail_is_case_insensitive(self):
        resp = self.client.get(f'/api/quiz/rooms/{self.room.room_code.lower()}/')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['room_code'], self.room.room_code)

    def test_detail_unknown_room_returns_404(self):
        resp = self.client.get('/api/quiz/rooms/ZZZZZZ/')
        self.assertEqual(resp.status_code, 404)
