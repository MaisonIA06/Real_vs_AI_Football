"""Ajoute MultiplayerRoom.ordered_pair_ids (sélection préchoisie ordonnée).

Migration écrite à la main pour n'ajouter QUE ce champ : un makemigrations
automatique embarquerait aussi la suppression des modèles orphelins
(Quiz/QuizPair/SecretQuote) et toucherait la table orpheline game_quizpair
(piège documenté dans CLAUDE.md). On reste donc minimal et sûr.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('game', '0008_add_host_token_and_session_validation'),
    ]

    operations = [
        migrations.AddField(
            model_name='multiplayerroom',
            name='ordered_pair_ids',
            field=models.JSONField(
                default=list,
                blank=True,
                help_text=(
                    "Ordre figé des paires pour une sélection préchoisie (preset). "
                    "Vide = sélection aléatoire classique triée par id."
                ),
            ),
        ),
    ]
