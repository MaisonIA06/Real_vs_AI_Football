from django.contrib import admin

from .models import QuizQuestion, QuizRoom, QuizPlayer, QuizAnswer


@admin.register(QuizQuestion)
class QuizQuestionAdmin(admin.ModelAdmin):
    list_display = ('order', 'question_type', 'question_text', 'correct_choice', 'is_active')
    list_editable = ('is_active',)
    ordering = ('order',)


@admin.register(QuizRoom)
class QuizRoomAdmin(admin.ModelAdmin):
    list_display = ('room_code', 'status', 'current_question_index', 'created_at')
    readonly_fields = ('host_token', 'room_code')


@admin.register(QuizPlayer)
class QuizPlayerAdmin(admin.ModelAdmin):
    list_display = ('pseudo', 'room', 'score', 'is_connected')


@admin.register(QuizAnswer)
class QuizAnswerAdmin(admin.ModelAdmin):
    list_display = ('player', 'question', 'is_correct', 'points_earned', 'answer_order')
