# Retrait du mécanisme de preset (sélection Foot de l'Event Foot).
# Migration écrite à la main : un makemigrations automatique embarquerait aussi
# le drift historique de l'app (modèles Quiz/QuizPair/SecretQuote retirés de
# models.py sans migration), qui est traité séparément.

from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('game', '0009_multiplayerroom_ordered_pair_ids'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='multiplayerroom',
            name='ordered_pair_ids',
        ),
    ]
