"""Régénère les symlinks opaques `media/q/<jeton><ext>` pour toutes les paires.

À lancer une fois après le déploiement du constat B (les paires existantes n'ont
pas encore de symlinks), ou après un changement de SECRET_KEY (les jetons changent).
"""
from django.core.management.base import BaseCommand

from apps.game.models import MediaPair


class Command(BaseCommand):
    help = "Régénère les symlinks opaques media/q/ pour toutes les MediaPair."

    def handle(self, *args, **options):
        count = 0
        for pair in MediaPair.objects.all():
            pair.sync_opaque_links()
            count += 1
        self.stdout.write(self.style.SUCCESS(f"Symlinks opaques régénérés pour {count} paire(s)."))
