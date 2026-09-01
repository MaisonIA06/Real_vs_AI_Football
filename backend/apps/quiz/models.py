"""
App quiz (ex-Quiz Foot) réduite à une coquille — retrait de l'Event Foot.

Les modèles ont été supprimés par la migration 0002_delete_quiz_models, qui
droppe proprement les tables en production. L'app entière sera retirée une
fois cette migration exécutée partout.
"""


import random
import string


def get_quiz_image_path(instance, filename):
    """Conservée uniquement parce que la migration 0001 la référence."""
    return f'quiz/{filename}'


def generate_quiz_room_code():
    """Conservée uniquement parce que la migration 0001 la référence."""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
