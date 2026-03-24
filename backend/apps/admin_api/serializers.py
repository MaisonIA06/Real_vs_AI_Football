"""
Serializers for the admin API.
"""
from rest_framework import serializers
from django.conf import settings
from apps.game.models import Category, MediaPair, GameSession, GlobalStats


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


class DashboardStatsSerializer(serializers.Serializer):
    total_categories = serializers.IntegerField()
    total_pairs = serializers.IntegerField()
    total_sessions = serializers.IntegerField()
    completed_sessions = serializers.IntegerField()
    average_score = serializers.FloatField()
    recent_sessions = serializers.ListField()
    top_pairs = serializers.ListField()
