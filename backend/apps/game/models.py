"""
Models for the Real vs AI game.
"""
import hashlib
import hmac
import os
import uuid
from django.db import models
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from django.conf import settings
from django.utils.text import slugify


class Category(models.Model):
    """Category for grouping media pairs (e.g., Landscapes, Portraits, Animals)."""
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ['name']

    def __str__(self):
        return self.name

    def get_slug(self):
        """Retourne un slug du nom de la catégorie pour les dossiers."""
        return slugify(self.name)


@receiver(post_save, sender=Category)
def create_category_folders(sender, instance, created, **kwargs):
    """Crée les dossiers pour la catégorie lors de sa création."""
    if created:
        category_slug = instance.get_slug()
        folders = [
            os.path.join(settings.MEDIA_ROOT, 'pairs', 'real', category_slug),
            os.path.join(settings.MEDIA_ROOT, 'pairs', 'ai', category_slug),
            os.path.join(settings.MEDIA_ROOT, 'pairs', 'audio', category_slug),
        ]
        for folder in folders:
            os.makedirs(folder, exist_ok=True)


def get_upload_path_real(instance, filename):
    """Génère le chemin d'upload pour les médias réels."""
    category_slug = instance.category.get_slug() if instance.category else 'uncategorized'
    return f'pairs/real/{category_slug}/{filename}'


def get_upload_path_ai(instance, filename):
    """Génère le chemin d'upload pour les médias IA."""
    category_slug = instance.category.get_slug() if instance.category else 'uncategorized'
    return f'pairs/ai/{category_slug}/{filename}'


def get_upload_path_audio(instance, filename):
    """Génère le chemin d'upload pour les audios."""
    category_slug = instance.category.get_slug() if instance.category else 'uncategorized'
    return f'pairs/audio/{category_slug}/{filename}'


class MediaPair(models.Model):
    """A pair of media: one real, one AI-generated. Or a single audio file."""
    
    class MediaType(models.TextChoices):
        IMAGE = 'image', 'Image'
        VIDEO = 'video', 'Vidéo'
        AUDIO = 'audio', 'Audio'

    class Difficulty(models.TextChoices):
        EASY = 'easy', 'Facile'
        MEDIUM = 'medium', 'Moyen'
        HARD = 'hard', 'Difficile'

    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name='media_pairs'
    )
    # For image/video: both required. For audio: only audio_media and is_real
    real_media = models.FileField(upload_to=get_upload_path_real, null=True, blank=True)
    ai_media = models.FileField(upload_to=get_upload_path_ai, null=True, blank=True)
    # For audio type: single audio file
    audio_media = models.FileField(upload_to=get_upload_path_audio, null=True, blank=True)
    # For audio: indicates if the audio is real (True) or AI-generated (False)
    is_real = models.BooleanField(
        null=True,
        blank=True,
        help_text="Pour audio: True si réel, False si IA"
    )
    media_type = models.CharField(
        max_length=10,
        choices=MediaType.choices,
        default=MediaType.IMAGE
    )
    difficulty = models.CharField(
        max_length=10,
        choices=Difficulty.choices,
        default=Difficulty.MEDIUM
    )
    hint = models.TextField(
        blank=True,
        help_text="Explication affichée après la réponse"
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.category.name} - {self.media_type} #{self.id}"

    def delete_media_files(self):
        """Supprime les fichiers médias associés du disque."""
        for field in [self.real_media, self.ai_media, self.audio_media]:
            if field:
                try:
                    if os.path.isfile(field.path):
                        os.remove(field.path)
                except Exception:
                    pass  # Ignorer les erreurs de suppression

    # --- URLs/symlinks opaques (constat B : ne pas révéler réel/IA dans l'URL) ---

    _SIDE_FIELDS = ('real', 'ai', 'audio')

    def _media_field_for_side(self, side):
        return {
            'real': self.real_media,
            'ai': self.ai_media,
            'audio': self.audio_media,
        }.get(side)

    def opaque_token(self, side):
        """Jeton opaque (HMAC-SHA256 tronqué) pour un côté donné. Inimitable
        sans SECRET_KEY ; ne révèle pas le statut réel/IA du média."""
        msg = f"{self.pk}:{side}".encode()
        return hmac.new(settings.SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()[:40]

    def opaque_media_url(self, side):
        """URL opaque `/media/q/<jeton><ext>` pour le média d'un côté, ou None."""
        field = self._media_field_for_side(side)
        if not field:
            return None
        ext = os.path.splitext(field.name)[1].lower()
        media_url = settings.MEDIA_URL
        if not media_url.startswith('/'):
            media_url = '/' + media_url
        if not media_url.endswith('/'):
            media_url += '/'
        return f"{media_url}q/{self.opaque_token(side)}{ext}"

    def _opaque_link_path(self, side, ext):
        return os.path.join(settings.MEDIA_ROOT, 'q', f"{self.opaque_token(side)}{ext}")

    def sync_opaque_links(self):
        """(Re)crée les symlinks opaques `media/q/<jeton><ext>` -> fichier réel.
        Nginx sert `/media/q/` en statique (Range HTTP OK) sans révéler le chemin."""
        q_dir = os.path.join(settings.MEDIA_ROOT, 'q')
        os.makedirs(q_dir, exist_ok=True)
        for side in self._SIDE_FIELDS:
            field = self._media_field_for_side(side)
            if not field:
                continue
            try:
                target = field.path
            except (ValueError, NotImplementedError):
                continue
            if not os.path.isfile(target):
                continue
            ext = os.path.splitext(field.name)[1].lower()
            link_path = self._opaque_link_path(side, ext)
            rel_target = os.path.relpath(target, q_dir)
            # Création atomique : symlink vers un nom temporaire puis os.replace,
            # pour éviter une course remove->symlink (lien manquant = 404).
            tmp_path = f"{link_path}.tmp-{os.getpid()}"
            try:
                if os.path.islink(tmp_path) or os.path.exists(tmp_path):
                    os.remove(tmp_path)
                os.symlink(rel_target, tmp_path)
                os.replace(tmp_path, link_path)
            except OSError:
                try:
                    os.remove(tmp_path)
                except OSError:
                    pass

    def remove_opaque_links(self):
        """Supprime les symlinks opaques associés (suppression de la paire)."""
        for side in self._SIDE_FIELDS:
            field = self._media_field_for_side(side)
            if not field:
                continue
            ext = os.path.splitext(field.name)[1].lower()
            link_path = self._opaque_link_path(side, ext)
            try:
                if os.path.islink(link_path) or os.path.exists(link_path):
                    os.remove(link_path)
            except OSError:
                pass


@receiver(post_save, sender=MediaPair)
def sync_opaque_links_on_save(sender, instance, **kwargs):
    """Maintient les symlinks opaques à jour à chaque sauvegarde de paire."""
    instance.sync_opaque_links()


@receiver(post_delete, sender=MediaPair)
def delete_media_files_on_delete(sender, instance, **kwargs):
    """Signal pour supprimer fichiers médias + symlinks à la suppression d'un MediaPair."""
    instance.delete_media_files()
    instance.remove_opaque_links()


class GameSession(models.Model):
    """A game session for a player."""
    
    class AudienceType(models.TextChoices):
        SCHOOL = 'school', 'Scolaire'
        PUBLIC = 'public', 'Grand Public'
    
    session_key = models.UUIDField(default=uuid.uuid4, unique=True)
    audience_type = models.CharField(
        max_length=10,
        choices=AudienceType.choices,
        default=AudienceType.PUBLIC,
        help_text="Type d'audience: scolaire ou grand public"
    )
    pseudo = models.CharField(max_length=50, blank=True)
    score = models.IntegerField(default=0)
    streak_max = models.IntegerField(default=0)
    current_streak = models.IntegerField(default=0)
    time_total_ms = models.IntegerField(default=0)
    total_pairs = models.IntegerField(default=0, help_text="Nombre total de paires dans cette session")
    is_completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Session {self.session_key} - {self.pseudo or 'Anonyme'}"


class GameAnswer(models.Model):
    """An answer submitted during a game session."""
    session = models.ForeignKey(
        GameSession,
        on_delete=models.CASCADE,
        related_name='answers'
    )
    media_pair = models.ForeignKey(
        MediaPair,
        on_delete=models.CASCADE,
        related_name='game_answers'
    )
    is_correct = models.BooleanField()
    response_time_ms = models.IntegerField()
    order = models.PositiveIntegerField()
    points_earned = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['order']
        unique_together = ['session', 'order']

    def __str__(self):
        status = "✓" if self.is_correct else "✗"
        return f"{status} Q{self.order} - {self.session.session_key}"


class GlobalStats(models.Model):
    """Global statistics for each media pair."""
    media_pair = models.OneToOneField(
        MediaPair,
        on_delete=models.CASCADE,
        related_name='global_stats'
    )
    total_attempts = models.IntegerField(default=0)
    correct_answers = models.IntegerField(default=0)

    class Meta:
        verbose_name_plural = "Global stats"

    def __str__(self):
        return f"Stats for MediaPair #{self.media_pair.id}"

    @property
    def success_rate(self):
        if self.total_attempts == 0:
            return 0
        return round((self.correct_answers / self.total_attempts) * 100, 1)


def get_upload_path_celebrity(instance, filename):
    """Génère le chemin d'upload pour les images de célébrités."""
    return f'secret_quiz/celebrities/{filename}'


# =============================================================================
# Multiplayer / Live Mode Models
# =============================================================================

def generate_room_code():
    """Génère un code de room unique de 6 caractères alphanumériques."""
    import random
    import string
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))


class MultiplayerRoom(models.Model):
    """A multiplayer room for live classroom sessions."""
    
    class RoomStatus(models.TextChoices):
        WAITING = 'waiting', 'En attente'
        PLAYING = 'playing', 'En cours'
        SHOWING_ANSWER = 'showing_answer', 'Révélation'
        FINISHED = 'finished', 'Terminé'
    
    room_code = models.CharField(
        max_length=6,
        unique=True,
        default=generate_room_code,
        help_text="Code unique de la room (6 caractères)"
    )
    host_token = models.UUIDField(
        default=uuid.uuid4,
        unique=True,
        help_text="Token secret de l'hôte, requis pour prendre le contrôle de la room"
    )
    status = models.CharField(
        max_length=20,
        choices=RoomStatus.choices,
        default=RoomStatus.WAITING
    )
    current_pair_index = models.IntegerField(
        default=0,
        help_text="Index de la question actuelle"
    )
    ai_positions = models.JSONField(
        default=dict,
        blank=True,
        help_text="Position de l'IA pour chaque paire (pair_id: 'left'|'right')"
    )
    pairs = models.ManyToManyField(
        MediaPair,
        blank=True,
        related_name='multiplayer_rooms',
        help_text="Paires de médias pour cette room"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = "Room Multiplayer"
        verbose_name_plural = "Rooms Multiplayer"

    def __str__(self):
        return f"Room {self.room_code} - {self.status}"


class MultiplayerPlayer(models.Model):
    """A player in a multiplayer room."""
    
    room = models.ForeignKey(
        MultiplayerRoom,
        on_delete=models.CASCADE,
        related_name='players'
    )
    pseudo = models.CharField(
        max_length=50,
        help_text="Pseudo du joueur"
    )
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
    is_connected = models.BooleanField(
        default=True,
        help_text="Indique si le joueur est actuellement connecté"
    )
    joined_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-score', 'joined_at']
        verbose_name = "Joueur Multiplayer"
        verbose_name_plural = "Joueurs Multiplayer"

    def __str__(self):
        return f"{self.pseudo} (Room {self.room.room_code}) - {self.score} pts"


class MultiplayerAnswer(models.Model):
    """An answer submitted by a player in a multiplayer game."""
    
    player = models.ForeignKey(
        MultiplayerPlayer,
        on_delete=models.CASCADE,
        related_name='answers'
    )
    media_pair = models.ForeignKey(
        MediaPair,
        on_delete=models.CASCADE,
        related_name='multiplayer_answers'
    )
    choice = models.CharField(
        max_length=10,
        help_text="Choix du joueur: 'left', 'right', 'real', 'ai'"
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
        verbose_name = "Réponse Multiplayer"
        verbose_name_plural = "Réponses Multiplayer"
        unique_together = ['player', 'media_pair']

    def __str__(self):
        status = "✓" if self.is_correct else "✗"
        return f"{status} {self.player.pseudo} - {self.points_earned} pts"

