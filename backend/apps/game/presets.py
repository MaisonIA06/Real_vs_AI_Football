"""
Presets de sélection de paires pour le mode classe (multijoueur).

Un preset est une liste ORDONNÉE de chemins `real_media` stables (et non d'IDs,
qui peuvent différer entre dev et prod). À la création d'une room avec un preset,
les paires sont résolues dans cet ordre et l'ordre est figé dans
`MultiplayerRoom.ordered_pair_ids`.
"""
import logging

from .models import MediaPair

logger = logging.getLogger(__name__)


# Event Foot : sélection préchoisie et ordonnée (cf. demande event).
PAIR_PRESETS = {
    'foot': [
        'pairs/real/animal/Ours.mp4',
        'pairs/real/animal/Hibou.mp4',
        'pairs/real/sport/boxe.mp4',
        'pairs/real/paysage/Pluie.mp4',
        'pairs/real/art/Image_6.png',
        'pairs/real/animal/Kangourou.mp4',
        'pairs/real/animal/Pingouin.mp4',
        'pairs/real/sport/mecChelou.mp4',
        'pairs/real/art/Image_10.jpg',
        'pairs/real/cuisine/sushi.mp4',
    ],
}


def resolve_preset(name):
    """Retourne la liste ORDONNÉE des MediaPair actifs d'un preset.

    Les noms introuvables (média absent / paire inactive) sont ignorés en
    silence — le preset reste jouable avec les paires présentes. Retourne une
    liste vide si le preset est inconnu.
    """
    paths = PAIR_PRESETS.get(name)
    if not paths:
        return []
    pairs = []
    for path in paths:
        pair = MediaPair.objects.filter(real_media=path, is_active=True).first()
        if pair is not None:
            pairs.append(pair)
        else:
            logger.warning("Preset '%s' : paire introuvable pour %s", name, path)
    return pairs
