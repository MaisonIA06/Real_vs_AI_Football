"""
Tests de l'app quiz réduite à une coquille (retrait de l'Event Foot).

L'app ne subsiste que pour porter la migration de suppression de ses tables
(0002) jusqu'à son exécution en production ; elle sera retirée entièrement à
l'étape suivante. Aucun modèle, aucune route, aucun consumer ne doit rester.
"""
from django.apps import apps
from django.test import SimpleTestCase


class QuizAppShellTests(SimpleTestCase):
    """L'app quiz est une coquille vide : plus aucun modèle enregistré."""

    def test_no_models_remaining(self):
        self.assertEqual(list(apps.get_app_config('quiz').get_models()), [])
