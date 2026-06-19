"""
Tests de l'étape 1 du Quiz Foot : modèles + commande de seed populate_quiz.
"""
from django.core.exceptions import ValidationError
from django.core.management import call_command
from django.test import TestCase

from apps.quiz.models import (
    QuizQuestion,
    QuizRoom,
    QuizPlayer,
    QuizAnswer,
    generate_quiz_room_code,
)


class QuizQuestionModelTests(TestCase):
    def test_correct_choice_returns_text_at_correct_index(self):
        q = QuizQuestion.objects.create(
            order=1,
            question_text="Test ?",
            question_type=QuizQuestion.QuestionType.MCQ,
            choices=["A", "B", "C", "D"],
            correct_index=2,
        )
        self.assertEqual(q.correct_choice, "C")

    def test_correct_choice_none_when_index_out_of_range(self):
        q = QuizQuestion.objects.create(
            order=2,
            question_text="Test ?",
            choices=["A", "B"],
            correct_index=5,
        )
        self.assertIsNone(q.correct_choice)

    def test_order_is_unique(self):
        QuizQuestion.objects.create(order=3, question_text="A", choices=["x"], correct_index=0)
        with self.assertRaises(Exception):
            QuizQuestion.objects.create(order=3, question_text="B", choices=["y"], correct_index=0)

    def test_clean_rejects_wrong_choice_count(self):
        # QCM avec 3 propositions au lieu de 4
        q = QuizQuestion(
            order=10, question_text="Q",
            question_type=QuizQuestion.QuestionType.MCQ,
            choices=["A", "B", "C"], correct_index=0,
        )
        with self.assertRaises(ValidationError):
            q.clean()

    def test_clean_rejects_truefalse_with_four_choices(self):
        q = QuizQuestion(
            order=11, question_text="Q",
            question_type=QuizQuestion.QuestionType.TRUE_FALSE,
            choices=["Vrai", "Faux", "Peut-être", "Jamais"], correct_index=0,
        )
        with self.assertRaises(ValidationError):
            q.clean()

    def test_clean_rejects_out_of_range_correct_index(self):
        q = QuizQuestion(
            order=12, question_text="Q",
            question_type=QuizQuestion.QuestionType.MCQ,
            choices=["A", "B", "C", "D"], correct_index=4,
        )
        with self.assertRaises(ValidationError):
            q.clean()

    def test_clean_accepts_valid_mcq(self):
        q = QuizQuestion(
            order=13, question_text="Q",
            question_type=QuizQuestion.QuestionType.MCQ,
            choices=["A", "B", "C", "D"], correct_index=3,
        )
        q.clean()  # ne doit pas lever

    def test_image_url_is_absolute(self):
        q = QuizQuestion.objects.create(
            order=14, question_text="Q",
            choices=["A", "B", "C", "D"], correct_index=0,
            image="quiz/Qu1.png",
        )
        url = q.image_url()
        self.assertTrue(url.startswith('/'), f"URL non absolue : {url}")
        self.assertTrue(url.endswith("quiz/Qu1.png"))

    def test_image_url_none_when_no_image(self):
        q = QuizQuestion.objects.create(
            order=15, question_text="Q", choices=["A", "B"], correct_index=0,
        )
        self.assertIsNone(q.image_url())


class QuizRoomModelTests(TestCase):
    def test_room_code_and_host_token_generated(self):
        room = QuizRoom.objects.create()
        self.assertEqual(len(room.room_code), 6)
        self.assertIsNotNone(room.host_token)
        self.assertEqual(room.status, QuizRoom.RoomStatus.WAITING)

    def test_generate_quiz_room_code_format(self):
        code = generate_quiz_room_code()
        self.assertEqual(len(code), 6)
        self.assertTrue(code.isalnum())

    def test_player_answer_unique_per_question(self):
        room = QuizRoom.objects.create()
        player = QuizPlayer.objects.create(room=room, pseudo="Zoé")
        question = QuizQuestion.objects.create(
            order=4, question_text="Q", choices=["A", "B"], correct_index=0
        )
        QuizAnswer.objects.create(
            player=player, question=question, selected_index=0,
            is_correct=True, response_time_ms=1000,
        )
        with self.assertRaises(Exception):
            QuizAnswer.objects.create(
                player=player, question=question, selected_index=1,
                is_correct=False, response_time_ms=2000,
            )


class PopulateQuizCommandTests(TestCase):
    def test_seeds_ten_questions(self):
        call_command('populate_quiz', verbosity=0)
        self.assertEqual(QuizQuestion.objects.count(), 10)

    def test_is_idempotent(self):
        call_command('populate_quiz', verbosity=0)
        call_command('populate_quiz', verbosity=0)
        self.assertEqual(QuizQuestion.objects.count(), 10)

    def test_question_content_and_types(self):
        call_command('populate_quiz', verbosity=0)

        q1 = QuizQuestion.objects.get(order=1)
        self.assertIn("Main de Dieu", q1.question_text)
        self.assertEqual(q1.question_type, QuizQuestion.QuestionType.MCQ)
        self.assertEqual(len(q1.choices), 4)
        self.assertEqual(q1.correct_choice, "Diego Maradona")
        self.assertTrue(q1.image.name.endswith("Qu1.png"))

        # Vrai/Faux : 2 propositions, image associée
        q3 = QuizQuestion.objects.get(order=3)
        self.assertEqual(q3.question_type, QuizQuestion.QuestionType.TRUE_FALSE)
        self.assertEqual(q3.choices, ["Vrai", "Faux"])
        self.assertEqual(q3.correct_choice, "Vrai")

        q4 = QuizQuestion.objects.get(order=4)
        self.assertEqual(q4.correct_choice, "Faux")

        # Bonnes réponses non-triviales
        self.assertEqual(QuizQuestion.objects.get(order=8).correct_choice, "Il est démontable")
        self.assertEqual(QuizQuestion.objects.get(order=9).correct_choice, "Rogério Ceni")
        self.assertEqual(QuizQuestion.objects.get(order=10).correct_choice, "Sur sa montre")

    def test_dry_run_creates_nothing(self):
        call_command('populate_quiz', '--dry-run', verbosity=0)
        self.assertEqual(QuizQuestion.objects.count(), 0)
