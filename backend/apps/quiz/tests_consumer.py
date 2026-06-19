"""
Tests de l'étape 3 du Quiz Foot : QuizConsumer.

Trois niveaux, tous sans dépendre du flush DB (piège TransactionTestCase /
table orpheline game_quizpair documenté dans CLAUDE.md) :
  1. Logique pure de scoring (compute_points / position_bonus).
  2. Sérialisation : la question envoyée aux joueurs ne contient PAS la réponse.
  3. Sécurité : un non-hôte ne peut pas piloter la partie (pattern DB-less,
     comme GameEndAuthorizationTests côté game).
"""
from unittest.mock import patch

from channels.routing import URLRouter
from channels.testing import WebsocketCommunicator
from django.test import SimpleTestCase, TestCase, override_settings

from apps.quiz.consumers import (
    QuizConsumer,
    advance_state,
    compute_points,
    position_bonus,
    question_payload_for_players,
    answer_payload,
)
from apps.quiz.models import QuizQuestion
from apps.quiz.routing import websocket_urlpatterns


class ScoringLogicTests(SimpleTestCase):
    def test_wrong_answer_scores_zero(self):
        self.assertEqual(compute_points(False, 0), 0)

    def test_first_correct_gets_full_bonus(self):
        self.assertEqual(compute_points(True, 0), 150)  # 100 + 50

    def test_second_and_third_correct_bonuses(self):
        self.assertEqual(compute_points(True, 1), 130)  # 100 + 30
        self.assertEqual(compute_points(True, 2), 110)  # 100 + 10

    def test_fourth_correct_onwards_no_bonus(self):
        self.assertEqual(compute_points(True, 3), 100)
        self.assertEqual(compute_points(True, 99), 100)

    def test_position_bonus_bounds(self):
        self.assertEqual(position_bonus(0), 50)
        self.assertEqual(position_bonus(2), 10)
        self.assertEqual(position_bonus(3), 0)
        self.assertEqual(position_bonus(-1), 0)


class AdvanceStateTests(SimpleTestCase):
    def test_has_next_when_not_last(self):
        # 10 questions, on est sur la 1re (index 0) → passe à index 1, reste des questions
        self.assertEqual(advance_state(0, 10), (1, True))

    def test_no_next_on_last_question(self):
        # index 9 sur 10 questions → passe à 10, plus de question
        self.assertEqual(advance_state(9, 10), (10, False))

    def test_no_next_past_the_end(self):
        self.assertEqual(advance_state(10, 10), (11, False))


class QuestionPayloadSecurityTests(TestCase):
    """La question envoyée aux joueurs ne doit jamais révéler la réponse."""

    def test_player_payload_excludes_answer(self):
        q = QuizQuestion.objects.create(
            order=1,
            question_text="Capitale ?",
            question_type=QuizQuestion.QuestionType.MCQ,
            choices=["A", "B", "C", "D"],
            correct_index=2,
            anecdote="Anecdote secrète",
        )
        payload = question_payload_for_players(q, 1, 10)

        self.assertNotIn('correct_index', payload)
        self.assertNotIn('anecdote', payload)
        self.assertEqual(payload['choices'], ["A", "B", "C", "D"])
        self.assertEqual(payload['question_number'], 1)
        self.assertEqual(payload['total_questions'], 10)
        self.assertEqual(payload['question_type'], QuizQuestion.QuestionType.MCQ)

    def test_reveal_payload_includes_answer_and_anecdote(self):
        q = QuizQuestion.objects.create(
            order=2, question_text="Q", choices=["A", "B"], correct_index=1,
            anecdote="Parce que.",
        )
        payload = answer_payload(q, player_results=[])
        self.assertEqual(payload['correct_index'], 1)
        self.assertEqual(payload['correct_choice'], "B")
        self.assertEqual(payload['anecdote'], "Parce que.")


# Routing brut (sans AllowedHostsOriginValidator ni AuthMiddleware) : on teste
# l'autorisation applicative, pas l'origine ni l'auth de session.
ws_application = URLRouter(websocket_urlpatterns)


async def _async_noop(*args, **kwargs):
    return None


async def _async_empty_list(*args, **kwargs):
    return []


@override_settings(
    CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}
)
class HostGuardTests(SimpleTestCase):
    """Seul l'hôte peut piloter la partie (gardes is_host)."""

    async def _connect(self):
        communicator = WebsocketCommunicator(ws_application, '/ws/quiz/TESTROOM/')
        connected, _ = await communicator.connect()
        self.assertTrue(connected)
        return communicator

    async def test_non_host_cannot_end_game(self):
        with patch.object(QuizConsumer, 'set_room_status', _async_noop), \
             patch.object(QuizConsumer, 'get_podium_data', _async_empty_list):
            communicator = await self._connect()
            await communicator.send_json_to({'action': 'game.end'})
            response = await communicator.receive_json_from()
            self.assertEqual(response.get('type'), 'error')
            await communicator.disconnect()

    async def test_non_host_cannot_start_game(self):
        communicator = await self._connect()
        await communicator.send_json_to({'action': 'game.start'})
        response = await communicator.receive_json_from()
        self.assertEqual(response.get('type'), 'error')
        await communicator.disconnect()

    async def test_non_host_cannot_show_answer(self):
        communicator = await self._connect()
        await communicator.send_json_to({'action': 'game.show_answer'})
        response = await communicator.receive_json_from()
        self.assertEqual(response.get('type'), 'error')
        await communicator.disconnect()

    async def test_non_host_cannot_advance_question(self):
        communicator = await self._connect()
        await communicator.send_json_to({'action': 'game.next_question'})
        response = await communicator.receive_json_from()
        self.assertEqual(response.get('type'), 'error')
        await communicator.disconnect()


class _FakeRoom:
    def __init__(self, host_token, status='showing_answer'):
        self.host_token = host_token
        self.status = status


@override_settings(
    CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}
)
class ShowAnswerGuardTests(SimpleTestCase):
    """show_answer sans question courante : erreur + statut inchangé (pas de
    régression FINISHED→SHOWING_ANSWER ni de broadcast answer=null)."""

    async def test_show_answer_without_current_question_is_guarded(self):
        token = 'abc-token-123'
        set_status_called = {'v': False}

        async def fake_get_room(self):
            return _FakeRoom(token)

        async def fake_players(self):
            return []

        async def fake_answer_data(self):
            return None

        async def fake_set_status(self, status):
            set_status_called['v'] = True

        with patch.object(QuizConsumer, 'get_room', fake_get_room), \
             patch.object(QuizConsumer, 'get_players_list', fake_players), \
             patch.object(QuizConsumer, 'get_answer_data', fake_answer_data), \
             patch.object(QuizConsumer, 'set_room_status', fake_set_status):
            comm = WebsocketCommunicator(ws_application, '/ws/quiz/TESTROOM/')
            self.assertTrue((await comm.connect())[0])

            await comm.send_json_to({'action': 'host.join', 'host_token': token})
            joined = await comm.receive_json_from()
            self.assertEqual(joined['type'], 'host.joined')

            await comm.send_json_to({'action': 'game.show_answer'})
            resp = await comm.receive_json_from()
            self.assertEqual(resp['type'], 'error')
            self.assertFalse(set_status_called['v'], "le statut ne doit pas changer")

            await comm.disconnect()
