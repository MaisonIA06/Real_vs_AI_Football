"""
Serializers for the game API.
"""
from rest_framework import serializers
from .models import Category, MediaPair, GameSession, GameAnswer, GlobalStats


def build_media_url(request, media_field):
    """Retourne l'URL relative du média (résolu par le navigateur)."""
    if not media_field:
        return None
    return media_field.url


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'description']


class MediaPairGameSerializer(serializers.ModelSerializer):
    """Serializer for media pairs during gameplay (hides which is real)."""
    category = CategorySerializer(read_only=True)
    left_media = serializers.SerializerMethodField()
    right_media = serializers.SerializerMethodField()
    audio_media = serializers.SerializerMethodField()
    real_position = serializers.SerializerMethodField()
    is_real = serializers.SerializerMethodField()

    class Meta:
        model = MediaPair
        fields = ['id', 'category', 'media_type', 'difficulty', 'left_media', 'right_media', 'audio_media', 'real_position', 'is_real']

    def get_left_media(self, obj):
        """For image/video: left media (real or AI depending on position)."""
        if obj.media_type == 'audio':
            return None
        request = self.context.get('request')
        positions = self.context.get('positions', {})
        pos = positions.get(obj.id, 'left')
        
        if pos == 'left':
            return build_media_url(request, obj.real_media)
        return build_media_url(request, obj.ai_media)

    def get_right_media(self, obj):
        """For image/video: right media (real or AI depending on position)."""
        if obj.media_type == 'audio':
            return None
        request = self.context.get('request')
        positions = self.context.get('positions', {})
        pos = positions.get(obj.id, 'left')
        
        if pos == 'right':
            return build_media_url(request, obj.real_media)
        return build_media_url(request, obj.ai_media)

    def get_audio_media(self, obj):
        """For audio: the audio file URL."""
        if obj.media_type != 'audio':
            return None
        request = self.context.get('request')
        return build_media_url(request, obj.audio_media)

    def get_is_real(self, obj):
        """For audio: whether it's real (only revealed after answer)."""
        if obj.media_type != 'audio':
            return None
        if self.context.get('reveal_answer'):
            return obj.is_real
        return None

    def get_real_position(self, obj):
        """Only included in response after answer is submitted."""
        if self.context.get('reveal_answer'):
            if obj.media_type == 'audio':
                return 'real' if obj.is_real else 'ai'
            positions = self.context.get('positions', {})
            return positions.get(obj.id, 'left')
        return None


class GameSessionCreateSerializer(serializers.Serializer):
    """Serializer for creating a new game session."""
    audience_type = serializers.ChoiceField(
        choices=['school', 'public'],
        required=True,
        help_text="Type d'audience: 'school' pour scolaire, 'public' pour grand public"
    )


class GameSessionSerializer(serializers.ModelSerializer):
    pairs = serializers.SerializerMethodField()
    quiz_name = serializers.SerializerMethodField()

    class Meta:
        model = GameSession
        fields = ['session_key', 'quiz_name', 'pairs', 'score', 'current_streak', 'streak_max']

    def get_pairs(self, obj):
        return self.context.get('pairs_data', [])
    
    def get_quiz_name(self, obj):
        return "Mode Aléatoire"


class AnswerSubmitSerializer(serializers.Serializer):
    """Serializer for submitting an answer."""
    pair_id = serializers.IntegerField()
    choice = serializers.ChoiceField(choices=['left', 'right', 'real', 'ai'])
    # J: borne haute (10 min) en plus de la borne basse, pour éviter des temps
    # aberrants qui faussent le scoring/les stats.
    response_time_ms = serializers.IntegerField(min_value=0, max_value=600000)


class AnswerResponseSerializer(serializers.Serializer):
    """Serializer for answer response."""
    is_correct = serializers.BooleanField()
    hint = serializers.CharField()
    real_position = serializers.CharField()
    points_earned = serializers.IntegerField()
    current_streak = serializers.IntegerField()
    global_stats = serializers.DictField()


class GameResultSerializer(serializers.ModelSerializer):
    """Serializer for final game results."""
    answers = serializers.SerializerMethodField()
    quiz_name = serializers.SerializerMethodField()

    class Meta:
        model = GameSession
        fields = [
            'session_key', 'quiz_name', 'pseudo', 'score',
            'streak_max', 'time_total_ms', 'is_completed', 'answers'
        ]

    def get_answers(self, obj):
        return [
            {
                'order': a.order,
                'is_correct': a.is_correct,
                'response_time_ms': a.response_time_ms,
                'points_earned': a.points_earned,
            }
            for a in obj.answers.all()
        ]

    def get_quiz_name(self, obj):
        return "Mode Aléatoire"


class LeaderboardEntrySerializer(serializers.ModelSerializer):
    """Serializer for leaderboard entries."""
    quiz_name = serializers.SerializerMethodField()

    class Meta:
        model = GameSession
        fields = ['id', 'pseudo', 'score', 'streak_max', 'time_total_ms', 'quiz_name', 'created_at']

    def get_quiz_name(self, obj):
        return "Mode Aléatoire"


class PseudoSubmitSerializer(serializers.Serializer):
    """Serializer for submitting a pseudo for leaderboard."""
    pseudo = serializers.CharField(max_length=50, min_length=2)
