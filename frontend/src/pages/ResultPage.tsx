import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import confetti from 'canvas-confetti';
import { Trophy, Flame, Clock, RotateCcw, Share2, Check, Home } from 'lucide-react';
import { gameApi } from '../services/api';
import LogoMIA from '../components/LogoMIA';
import VirtualKeyboard from '../components/VirtualKeyboard';

export default function ResultPage() {
  const { sessionKey } = useParams<{ sessionKey: string }>();
  const navigate = useNavigate();
  const [pseudo, setPseudo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pseudoSaved, setPseudoSaved] = useState(false);

  const { data: result, isLoading } = useQuery({
    queryKey: ['result', sessionKey],
    queryFn: () => gameApi.getResult(sessionKey!).then((res) => res.data),
    enabled: !!sessionKey,
  });

  // Trigger confetti for good scores
  useEffect(() => {
    if (result && result.score >= 700) {
      const duration = 3000;
      const end = Date.now() + duration;

      const frame = () => {
        confetti({
          particleCount: 3,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
          colors: ['#d946ef', '#22d3ee', '#f59e0b'],
        });
        confetti({
          particleCount: 3,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
          colors: ['#d946ef', '#22d3ee', '#f59e0b'],
        });

        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    }
  }, [result]);

  const handleSubmitPseudo = async () => {
    if (!pseudo.trim() || !sessionKey) return;

    setIsSubmitting(true);
    try {
      await gameApi.submitPseudo(sessionKey, pseudo.trim());
      setPseudoSaved(true);
    } catch (error) {
      console.error('Error saving pseudo:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getScoreMessage = (score: number) => {
    if (score >= 900) return "Incroyable ! Vous avez l'œil d'un expert !";
    if (score >= 700) return 'Excellent ! Vous êtes difficile à tromper !';
    if (score >= 500) return 'Bien joué ! Vous avez un bon instinct.';
    if (score >= 300) return "Pas mal ! L'IA devient de plus en plus convaincante...";
    return "L'IA vous a bien eu cette fois ! Réessayez !";
  };

  const getScoreColor = (score: number) => {
    if (score >= 700) return 'text-green-400';
    if (score >= 400) return 'text-yellow-400';
    return 'text-red-400';
  };

  if (isLoading || !result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
      </div>
    );
  }

  const correctAnswers = result.answers.filter((a) => a.is_correct).length;
  const accuracy = Math.round((correctAnswers / result.answers.length) * 100);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl" />
      </div>

      {/* Logo MIA en bas à gauche */}
      <LogoMIA size="medium" />

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-2xl"
      >
        {/* Header */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-primary-500 to-accent-500 mb-6"
          >
            <Trophy className="w-12 h-12 text-white" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="font-display text-4xl md:text-5xl font-bold mb-4"
          >
            Partie terminée !
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-xl text-dark-300"
          >
            {getScoreMessage(result.score)}
          </motion.p>
        </div>

        {/* Score Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="card mb-8"
        >
          {/* Main Score */}
          <div className="text-center mb-8">
            <div className={`text-7xl font-display font-bold ${getScoreColor(result.score)}`}>
              {result.score}
            </div>
            <div className="text-dark-400 text-lg">points</div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="text-center p-4 rounded-xl bg-dark-800/50">
              <div className="flex items-center justify-center mb-2">
                <Check className="w-5 h-5 text-green-400 mr-1" />
                <span className="text-2xl font-bold">{correctAnswers}/{result.answers.length}</span>
              </div>
              <div className="text-sm text-dark-400">Correct</div>
            </div>

            <div className="text-center p-4 rounded-xl bg-dark-800/50">
              <div className="flex items-center justify-center mb-2">
                <Flame className="w-5 h-5 text-orange-400 mr-1" />
                <span className="text-2xl font-bold">{result.streak_max}</span>
              </div>
              <div className="text-sm text-dark-400">Meilleur streak</div>
            </div>

            <div className="text-center p-4 rounded-xl bg-dark-800/50">
              <div className="flex items-center justify-center mb-2">
                <Clock className="w-5 h-5 text-accent-400 mr-1" />
                <span className="text-2xl font-bold">{formatTime(result.time_total_ms)}</span>
              </div>
              <div className="text-sm text-dark-400">Temps total</div>
            </div>
          </div>

          {/* Accuracy Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-dark-400">Précision</span>
              <span className="font-bold">{accuracy}%</span>
            </div>
            <div className="progress-bar">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${accuracy}%` }}
                transition={{ delay: 0.8, duration: 1 }}
                className="progress-bar-fill"
              />
            </div>
          </div>

          {/* Answer History */}
          <div className="flex justify-center gap-2 flex-wrap">
            {result.answers.map((answer, index) => (
              <motion.div
                key={index}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.6 + index * 0.05 }}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  answer.is_correct
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-red-500/20 text-red-400'
                }`}
              >
                {index + 1}
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Pseudo Input + Virtual Keyboard */}
        {!pseudoSaved && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="card mb-8"
          >
            <h3 className="font-display text-lg font-semibold mb-4 text-center">
              Enregistrez votre score au classement
            </h3>
            <div className="flex items-center gap-3 mb-2">
              <input
                type="text"
                value={pseudo}
                readOnly
                placeholder="Votre pseudo"
                maxLength={50}
                className="input-styled flex-1 caret-primary-500"
                inputMode="none"
              />
            </div>
            <VirtualKeyboard
              value={pseudo}
              onChange={setPseudo}
              onSubmit={handleSubmitPseudo}
              maxLength={50}
              submitLabel={isSubmitting ? '...' : 'Valider'}
              submitDisabled={!pseudo.trim() || isSubmitting}
            />
          </motion.div>
        )}

        {pseudoSaved && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="card mb-8 text-center text-green-400"
          >
            <Check className="w-6 h-6 inline mr-2" />
            Score enregistré sous le pseudo "{pseudo}"
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="flex flex-wrap justify-center gap-4"
        >
          <button onClick={() => navigate('/')} className="btn-primary text-xl px-10 py-5">
            <RotateCcw className="w-6 h-6 inline mr-2" />
            Rejouer
          </button>

          <button onClick={() => navigate('/leaderboard')} className="btn-secondary text-xl px-10 py-5">
            <Trophy className="w-6 h-6 inline mr-2" />
            Classement
          </button>

          <button
            onClick={() => {
              navigator.share?.({
                title: 'Real vs AI',
                text: `J'ai marqué ${result.score} points sur Real vs AI ! Saurez-vous faire mieux ?`,
                url: window.location.origin,
              });
            }}
            className="btn-secondary text-xl px-10 py-5"
          >
            <Share2 className="w-6 h-6 inline mr-2" />
            Partager
          </button>
        </motion.div>
      </motion.div>
    </div>
  );
}

