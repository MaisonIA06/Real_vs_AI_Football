"""
Commande de seed du Quiz Foot : crée/met à jour les 10 QuizQuestion figées.

Les images sont versionnées dans media/quiz/ (comme les médias du jeu principal) ;
les lignes en base ne le sont pas et sont (re)créées par cette commande, de façon
idempotente (update_or_create sur `order`).

    docker exec realvsai_backend python manage.py populate_quiz
    docker exec realvsai_backend python manage.py populate_quiz --dry-run
"""
import os

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.quiz.models import QuizQuestion


# Contenu figé du Quiz Foot (validé question par question).
# `correct_index` est 0-based dans `choices` (A=0, B=1, C=2, D=3).
QUESTIONS = [
    {
        'order': 1,
        'image': 'Qu1.png',
        'question_type': QuizQuestion.QuestionType.MCQ,
        'question_text': "Quel joueur a marqué le célèbre but de la « Main de Dieu » lors de la Coupe du monde 1986 ?",
        'choices': ["Diego Maradona", "Michel Platini", "Gary Lineker", "Zico"],
        'correct_index': 0,
        'anecdote': "Quelques minutes après ce but controversé, Maradona a traversé plus de la moitié du terrain en dribblant plusieurs adversaires pour inscrire ce qui sera élu « But du siècle ».",
    },
    {
        'order': 2,
        'image': 'Qu2.jpg',
        'question_type': QuizQuestion.QuestionType.MCQ,
        'question_text': "Quel est le temps du but le plus rapide jamais marqué en Coupe du monde ?",
        'choices': ["11 secondes", "17 secondes", "23 secondes", "31 secondes"],
        'correct_index': 0,
        'anecdote': "Après une erreur de relance sud-coréenne, Hakan Şükür a marqué quasiment sur la première action du match. Il n'avait pourtant inscrit aucun but dans la compétition avant cette rencontre.",
    },
    {
        'order': 3,
        'image': 'Qu3.jpg',
        'question_type': QuizQuestion.QuestionType.TRUE_FALSE,
        'question_text': "Le ballon officiel de cette Coupe du monde est capable de communiquer des informations aux arbitres en temps réel.",
        'choices': ["Vrai", "Faux"],
        'correct_index': 0,
        'anecdote': "Grâce à une puce intégrée, le ballon envoie des centaines de données chaque seconde. Cette technologie participe notamment à la détection des hors-jeu et des contacts avec le ballon avec une précision impossible à obtenir à l'œil nu.",
    },
    {
        'order': 4,
        'image': 'Qu4.jpg',
        'question_type': QuizQuestion.QuestionType.TRUE_FALSE,
        'question_text': "Lors d'une Coupe du monde, un chien a interrompu un match et a été élu « homme du match ».",
        'choices': ["Vrai", "Faux"],
        'correct_index': 1,
        'anecdote': "Des animaux ont déjà interrompu des matchs professionnels partout dans le monde, mais aucun chien n'a jamais été officiellement élu « Homme du match » en Coupe du monde.",
    },
    {
        'order': 5,
        'image': 'Qu5.jpg',
        'question_type': QuizQuestion.QuestionType.MCQ,
        'question_text': "Quel était le vrai nom du joueur Pelé ?",
        'choices': [
            "Edson Arantes do Nascimento",
            "Edson Alves do Nascimento",
            "Eduardo Arantes dos Reis",
            "La réponse D",
        ],
        'correct_index': 0,
        'anecdote': "Le surnom « Pelé » lui aurait été attribué dans son enfance après qu'il eut mal prononcé le nom d'un gardien appelé Bilé. Ce surnom deviendra l'un des plus célèbres de l'histoire du sport, alors qu'il ne l'appréciait pas au départ.",
    },
    {
        'order': 6,
        'image': 'Qu6.png',
        'question_type': QuizQuestion.QuestionType.MCQ,
        'question_text': "Quel gardien colombien est devenu célèbre pour ses arrêts en « coup du scorpion » ?",
        'choices': ["René Higuita", "José Luis Chilavert", "Jorge Campos", "José Ammendola"],
        'correct_index': 0,
        'anecdote': "Le 6 septembre 1995, lors d'un match amical entre l'Angleterre et la Colombie à Wembley, René Higuita réalisa son célèbre « coup du scorpion » en repoussant le ballon avec ses talons derrière son dos. Cette action spectaculaire est devenue l'un des gestes les plus iconiques de l'histoire du football.",
    },
    {
        'order': 7,
        'image': 'Qu7.jpg',
        'question_type': QuizQuestion.QuestionType.TRUE_FALSE,
        'question_text': "Le trophée original de la Coupe du monde a déjà été volé.",
        'choices': ["Vrai", "Faux"],
        'correct_index': 0,
        'anecdote': "Le trophée original de la Coupe du monde, appelé alors « Jules-Rimet », a été volé une première fois en 1966 en Angleterre avant d'être retrouvé par un chien nommé Pickles. Il a ensuite été volé une seconde fois au Brésil en 1983 et n'a jamais été retrouvé.",
    },
    {
        'order': 8,
        'image': 'Qu8.jpg',
        'question_type': QuizQuestion.QuestionType.MCQ,
        'question_text': "Quelle est la particularité du Stade 974 qui a été construit pour la Coupe du monde 2022 ?",
        'choices': [
            "C'était le plus grand stade du tournoi",
            "Il flotte sur l'eau",
            "Il est démontable",
            "Il n'a pas de places assises",
        ],
        'correct_index': 2,
        'anecdote': "Le Stade 974 a été construit à partir de conteneurs maritimes et de structures modulaires. Son nom fait référence à la fois au nombre de conteneurs utilisés pour sa construction et à l'indicatif téléphonique international du Qatar (+974).",
    },
    {
        'order': 9,
        'image': 'Qu9.jpg',
        'question_type': QuizQuestion.QuestionType.MCQ,
        'question_text': "Quel gardien a marqué plus de 130 buts au cours de sa carrière ?",
        'choices': ["Gianluigi Buffon", "José Luis Chilavert", "Oliver Kahn", "Rogério Ceni"],
        'correct_index': 3,
        'anecdote': "Rogério Ceni est une légende du football brésilien. Gardien du São Paulo FC, il était aussi spécialiste des coups francs et des penalties. Il a inscrit 132 buts officiels au cours de sa carrière, un record exceptionnel pour un gardien.",
    },
    {
        'order': 10,
        'image': 'Qu10.png',
        'question_type': QuizQuestion.QuestionType.MCQ,
        'question_text': "En cas de but, où l'arbitre reçoit-il l'information ?",
        'choices': ["Sur son oreillette", "Sur sa montre", "Sur l'écran géant", "Sur son téléphone"],
        'correct_index': 1,
        'anecdote': "Grâce à la technologie sur la ligne de but, lorsqu'un ballon franchit entièrement la ligne, la montre de l'arbitre vibre et affiche instantanément le message « GOAL ». L'information lui parvient en moins d'une seconde, même si les joueurs ou les spectateurs ne s'en sont pas encore rendu compte.",
    },
]


class Command(BaseCommand):
    help = "Sème (ou met à jour) les 10 questions figées du Quiz Foot."

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help="Affiche ce qui serait créé/mis à jour sans rien modifier en base.",
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        quiz_dir = os.path.join(settings.MEDIA_ROOT, 'quiz')

        created = 0
        updated = 0
        missing_images = []

        for data in QUESTIONS:
            image_name = data['image']
            image_rel = f"quiz/{image_name}"
            if not os.path.isfile(os.path.join(quiz_dir, image_name)):
                missing_images.append(image_rel)
                self.stdout.write(
                    self.style.WARNING(f"  ⚠️  Image manquante : {image_rel}")
                )

            if dry_run:
                exists = QuizQuestion.objects.filter(order=data['order']).exists()
                verb = "mettrait à jour" if exists else "créerait"
                self.stdout.write(f"  [DRY-RUN] {verb} Q{data['order']} : {data['question_text'][:60]}")
                continue

            _, was_created = QuizQuestion.objects.update_or_create(
                order=data['order'],
                defaults={
                    'question_text': data['question_text'],
                    'image': image_rel,
                    'question_type': data['question_type'],
                    'choices': data['choices'],
                    'correct_index': data['correct_index'],
                    'anecdote': data['anecdote'],
                    'is_active': True,
                },
            )
            if was_created:
                created += 1
                self.stdout.write(self.style.SUCCESS(f"  ✅ Q{data['order']} créée"))
            else:
                updated += 1
                self.stdout.write(f"  ♻️  Q{data['order']} mise à jour")

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS("=" * 50))
        prefix = "[DRY-RUN] " if dry_run else ""
        self.stdout.write(self.style.SUCCESS(f"{prefix}📊 Résumé Quiz Foot :"))
        self.stdout.write(f"   Questions créées      : {created}")
        self.stdout.write(f"   Questions mises à jour: {updated}")
        self.stdout.write(f"   Images manquantes     : {len(missing_images)}")
        self.stdout.write(self.style.SUCCESS("=" * 50))
