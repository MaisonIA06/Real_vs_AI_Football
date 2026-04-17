"""Ajoute host_token à MultiplayerRoom pour empêcher l'usurpation d'hôte en WebSocket."""
import uuid
from django.db import migrations, models


def backfill_host_tokens(apps, schema_editor):
    MultiplayerRoom = apps.get_model('game', 'MultiplayerRoom')
    for room in MultiplayerRoom.objects.all():
        room.host_token = uuid.uuid4()
        room.save(update_fields=['host_token'])


class Migration(migrations.Migration):

    dependencies = [
        ('game', '0007_add_total_pairs_to_game_session'),
    ]

    operations = [
        migrations.AddField(
            model_name='multiplayerroom',
            name='host_token',
            field=models.UUIDField(default=uuid.uuid4, null=True),
        ),
        migrations.RunPython(backfill_host_tokens, reverse_code=migrations.RunPython.noop),
        migrations.AlterField(
            model_name='multiplayerroom',
            name='host_token',
            field=models.UUIDField(default=uuid.uuid4, unique=True),
        ),
    ]
