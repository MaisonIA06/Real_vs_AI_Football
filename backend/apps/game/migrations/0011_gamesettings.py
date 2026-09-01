# Réglages globaux du jeu (catégorie active choisie dans l'admin).
# Migration écrite à la main : un makemigrations automatique embarquerait aussi
# le drift historique de l'app (modèles Quiz/QuizPair/SecretQuote retirés de
# models.py sans migration), qui est traité séparément.

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('game', '0010_remove_multiplayerroom_ordered_pair_ids'),
    ]

    operations = [
        migrations.CreateModel(
            name='GameSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('active_category', models.ForeignKey(blank=True, help_text='Si renseignée, les parties ne proposent que des paires de cette catégorie ; vide = toutes les catégories.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='game.category')),
            ],
            options={
                'verbose_name_plural': 'Game settings',
            },
        ),
    ]
