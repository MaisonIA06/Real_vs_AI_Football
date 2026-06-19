"""
Modèles du Quiz Foot — un mode live animé (type « classe ») indépendant du jeu
Real vs AI : un animateur pilote depuis un écran, les participants rejoignent via
QR code et répondent sur leur téléphone.

Le contenu (10 questions de culture foot) est figé et semé depuis le filesystem
par la commande `populate_quiz` (cf. management/commands/populate_quiz.py), sur
le même principe que `populate_pairs` pour le jeu principal.
"""
import random
import string
import uuid

from django.core.exceptions import ValidationError
from django.db import models


def get_quiz_image_path(instance, filename):
    """Chemin d'upload des images de questions : media/quiz/<filename>."""
    return f'quiz/{filename}'


class QuizQuestion(models.Model):
    """Une question du Quiz Foot : un énoncé, une image, des propositions.

    Les propositions sont stockées dans `choices` (liste JSON de chaînes) et la
    bonne réponse est l'index `correct_index` dans cette liste. Un QCM a 4
    propositions (A/B/C/D) ; un Vrai/Faux en a 2 (A=Vrai, B=Faux).
    """

    class QuestionType(models.TextChoices):
        MCQ = 'mcq', 'QCM (4 choix)'
        TRUE_FALSE = 'truefalse', 'Vrai / Faux'

    order = models.PositiveSmallIntegerField(
        unique=True,
        help_text="Numéro de la question (ordre d'affichage, ex: 1 à 10)"
    )
    question_text = models.TextField(help_text="Énoncé de la question")
    image = models.FileField(
        upload_to=get_quiz_image_path,
        blank=True,
        help_text="Image affichée au centre de la question"
    )
    question_type = models.CharField(
        max_length=10,
        choices=QuestionType.choices,
        default=QuestionType.MCQ,
    )
    choices = models.JSONField(
        default=list,
        help_text="Liste des propositions (ordre A, B, C, D)"
    )
    correct_index = models.PositiveSmallIntegerField(
        help_text="Index (0-based) de la bonne réponse dans `choices`"
    )
    anecdote = models.TextField(
        blank=True,
        help_text="Anecdote affichée après la révélation de la réponse"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order']
        verbose_name = "Question Quiz"
        verbose_name_plural = "Questions Quiz"

    def __str__(self):
        return f"Q{self.order} - {self.question_text[:50]}"

    def clean(self):
        """Valide la cohérence des propositions et de la bonne réponse.

        Appelée par l'admin (ModelForm) ; protège la saisie humaine. Un QCM doit
        avoir exactement 4 propositions, un Vrai/Faux exactement 2, et
        `correct_index` doit pointer une proposition existante.
        """
        expected = 2 if self.question_type == self.QuestionType.TRUE_FALSE else 4
        if len(self.choices) != expected:
            raise ValidationError(
                {'choices': f"Un {self.get_question_type_display()} doit avoir "
                            f"exactement {expected} propositions (reçu : {len(self.choices)})."}
            )
        if not (0 <= self.correct_index < len(self.choices)):
            raise ValidationError(
                {'correct_index': f"correct_index doit être entre 0 et {len(self.choices) - 1}."}
            )

    @property
    def correct_choice(self):
        """Texte de la bonne réponse, ou None si l'index est hors limites."""
        if 0 <= self.correct_index < len(self.choices):
            return self.choices[self.correct_index]
        return None

    def image_url(self):
        """URL de l'image (ou None). L'image du quiz n'est pas un indice de
        réponse (contrairement au jeu Real vs AI), donc pas d'URL opaque.

        On normalise le `/` initial : MEDIA_URL vaut 'media/' (sans slash de
        tête), donc `self.image.url` renvoie une URL relative qui casserait
        l'affichage selon la route du client — cf. opaque_media_url() côté game."""
        if not self.image:
            return None
        url = self.image.url
        if not url.startswith(('/', 'http://', 'https://')):
            url = '/' + url
        return url


def generate_quiz_room_code():
    """Génère un code de room unique de 6 caractères alphanumériques."""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


class QuizRoom(models.Model):
    """Une room de Quiz Foot pour une session live animée."""

    class RoomStatus(models.TextChoices):
        WAITING = 'waiting', 'En attente'
        PLAYING = 'playing', 'En cours'
        SHOWING_ANSWER = 'showing_answer', 'Révélation'
        FINISHED = 'finished', 'Terminé'

    room_code = models.CharField(
        max_length=6,
        unique=True,
        default=generate_quiz_room_code,
        help_text="Code unique de la room (6 caractères)"
    )
    host_token = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        help_text="Token secret de l'hôte, requis pour piloter la room"
    )
    status = models.CharField(
        max_length=20,
        choices=RoomStatus.choices,
        default=RoomStatus.WAITING,
    )
    current_question_index = models.IntegerField(
        default=0,
        help_text="Index de la question en cours"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Room Quiz"
        verbose_name_plural = "Rooms Quiz"

    def __str__(self):
        return f"Quiz {self.room_code} - {self.status}"


class QuizPlayer(models.Model):
    """Un participant dans une room de Quiz Foot."""

    room = models.ForeignKey(
        QuizRoom,
        on_delete=models.CASCADE,
        related_name='players'
    )
    pseudo = models.CharField(max_length=50, help_text="Pseudo du joueur")
    score = models.IntegerField(default=0)
    session_token = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        help_text="Token unique pour la reconnexion"
    )
    channel_name = models.CharField(
        max_length=255,
        blank=True,
        help_text="Nom du channel WebSocket actuel"
    )
    is_connected = models.BooleanField(default=True)
    joined_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-score', 'joined_at']
        verbose_name = "Joueur Quiz"
        verbose_name_plural = "Joueurs Quiz"

    def __str__(self):
        return f"{self.pseudo} (Quiz {self.room.room_code}) - {self.score} pts"


class QuizAnswer(models.Model):
    """Une réponse soumise par un joueur à une question du Quiz Foot."""

    player = models.ForeignKey(
        QuizPlayer,
        on_delete=models.CASCADE,
        related_name='answers'
    )
    question = models.ForeignKey(
        QuizQuestion,
        on_delete=models.CASCADE,
        related_name='quiz_answers'
    )
    selected_index = models.IntegerField(
        help_text="Index (0-based) de la proposition choisie"
    )
    is_correct = models.BooleanField()
    points_earned = models.IntegerField(default=0)
    response_time_ms = models.IntegerField(
        help_text="Temps de réponse en millisecondes"
    )
    answer_order = models.IntegerField(
        default=0,
        help_text="Ordre de réponse (1er, 2ème, etc.)"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['answer_order']
        verbose_name = "Réponse Quiz"
        verbose_name_plural = "Réponses Quiz"
        unique_together = ['player', 'question']

    def __str__(self):
        status = "✓" if self.is_correct else "✗"
        return f"{status} {self.player.pseudo} - {self.points_earned} pts"
