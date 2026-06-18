"""
Serializers for the admin API.
"""
import os

from rest_framework import serializers
from django.conf import settings
from apps.game.models import Category, MediaPair, GameSession, GlobalStats


# Whitelist stricte d'extensions par type de média. Toute autre extension
# (.html, .svg, .js, .exe, etc.) est refusée pour empêcher l'upload de
# fichiers exécutés par le navigateur depuis /media/ (stored XSS).
ALLOWED_EXTENSIONS = {
    'image': {'.jpg', '.jpeg', '.png', '.webp', '.gif'},
    'video': {'.mp4', '.webm'},
    'audio': {'.mp3', '.wav', '.ogg', '.m4a'},
}


def _validate_extension(uploaded_file, media_type, field_name):
    """Vérifie que l'extension du fichier est autorisée pour le media_type."""
    if uploaded_file in (None, ''):
        return
    name = getattr(uploaded_file, 'name', '') or ''
    ext = os.path.splitext(name)[1].lower()
    allowed = ALLOWED_EXTENSIONS.get(media_type, set())
    if ext not in allowed:
        raise serializers.ValidationError({
            field_name: (
                f"Extension '{ext or '(aucune)'}' non autorisée pour le type "
                f"{media_type}. Extensions acceptées : {sorted(allowed)}."
            )
        })


class CategoryAdminSerializer(serializers.ModelSerializer):
    pairs_count = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ['id', 'name', 'description', 'is_active', 'pairs_count', 'created_at']

    def get_pairs_count(self, obj):
        return obj.media_pairs.count()


class MediaPairAdminSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    stats = serializers.SerializerMethodField()
    real_media = serializers.SerializerMethodField()
    ai_media = serializers.SerializerMethodField()
    audio_media = serializers.SerializerMethodField()

    class Meta:
        model = MediaPair
        fields = [
            'id', 'category', 'category_name', 'real_media', 'ai_media', 'audio_media', 'is_real',
            'media_type', 'difficulty', 'hint', 'is_active', 'stats', 'created_at'
        ]

    def get_stats(self, obj):
        try:
            stats = obj.global_stats
            return {
                'total_attempts': stats.total_attempts,
                'correct_answers': stats.correct_answers,
                'success_rate': stats.success_rate,
            }
        except GlobalStats.DoesNotExist:
            return {
                'total_attempts': 0,
                'correct_answers': 0,
                'success_rate': 0,
            }

    def get_real_media(self, obj):
        return obj.real_media.url if obj.real_media else None

    def get_ai_media(self, obj):
        return obj.ai_media.url if obj.ai_media else None

    def get_audio_media(self, obj):
        return obj.audio_media.url if obj.audio_media else None


class MediaPairCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = MediaPair
        fields = ['category', 'real_media', 'ai_media', 'audio_media', 'is_real', 'media_type', 'difficulty', 'hint', 'is_active']

    def validate(self, attrs):
        # Pour une mise à jour partielle, récupérer la valeur actuelle si absente.
        instance = getattr(self, 'instance', None)

        media_type = attrs.get(
            'media_type',
            getattr(instance, 'media_type', None),
        )

        # G: lister les fichiers réellement uploadés dans CETTE requête.
        uploaded_fields = [
            f for f in ('real_media', 'ai_media', 'audio_media')
            if f in attrs and attrs.get(f) not in (None, '')
        ]

        # G: si un fichier est uploadé, le media_type doit être connu ET valide.
        # Auparavant un media_type absent/vide faisait un `return attrs` anticipé
        # qui sautait TOUTE la whitelist d'extensions → contournement possible.
        if uploaded_fields:
            valid_types = set(ALLOWED_EXTENSIONS.keys())
            if media_type not in valid_types:
                raise serializers.ValidationError({
                    'media_type': (
                        "Un media_type valide est requis pour uploader un fichier. "
                        f"Valeurs acceptées : {sorted(valid_types)}."
                    )
                })
            for field_name in uploaded_fields:
                _validate_extension(attrs.get(field_name), media_type, field_name)

        return attrs


class DashboardStatsSerializer(serializers.Serializer):
    total_categories = serializers.IntegerField()
    total_pairs = serializers.IntegerField()
    total_sessions = serializers.IntegerField()
    completed_sessions = serializers.IntegerField()
    average_score = serializers.FloatField()
    recent_sessions = serializers.ListField()
    top_pairs = serializers.ListField()
