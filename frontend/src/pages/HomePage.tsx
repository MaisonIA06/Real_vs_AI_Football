import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Play, Zap, Trophy, GraduationCap, Users, X } from 'lucide-react';
import { gameApi } from '../services/api';
import LogoMIA from '../components/LogoMIA';

type AudienceType = 'school' | 'public';

export default function HomePage() {
  const navigate = useNavigate();
  const [isStarting, setIsStarting] = useState(false);
  const [showAudienceModal, setShowAudienceModal] = useState(false);

  // État pour le nouvel Easter Egg (Le Musée des Hallucinations)
  const [vsClickCount, setVsClickCount] = useState(0);
  const [showMuseumHint, setShowMuseumHint] = useState(false);

  // Reset le compteur après 3 secondes d'inactivité
  useEffect(() => {
    if (vsClickCount > 0) {
      const timer = setTimeout(() => {
        setVsClickCount(0);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [vsClickCount]);

  const handleVsClick = useCallback(() => {
    setVsClickCount((prev) => {
      const newCount = prev + 1;
      if (newCount >= 5) {
        setShowMuseumHint(true);
        setTimeout(() => {
          navigate('/museum');
        }, 1000);
        return 0;
      }
      return newCount;
    });
  }, [navigate]);

  const { data: quizzes, isLoading } = useQuery({
    queryKey: ['quizzes'],
    queryFn: () => gameApi.getLeaderboard().then(() => []), // Dummy call to keep the hook happy if needed
    enabled: false,
  });

  const handleStartClick = () => {
    setShowAudienceModal(true);
  };

  const startGame = async (audienceType: AudienceType) => {
    setShowAudienceModal(false);
    setIsStarting(true);
    try {
      const response = await gameApi.startSession(audienceType);
      // Stocker les paires dans localStorage avant de naviguer
      localStorage.setItem(`pairs_${response.data.session_key}`, JSON.stringify(response.data.pairs));
      navigate(`/game/${response.data.session_key}`);
    } catch (error) {
      console.error('Error starting game:', error);
      setIsStarting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
      </div>

      {/* Logo MIA en bas à gauche */}
      <LogoMIA size="medium" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 text-center max-w-4xl mx-auto"
      >
        {/* Logo / Title */}
        <motion.h1
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="font-display text-6xl md:text-8xl font-bold mb-6 select-none"
        >
          <span className="gradient-text">Real</span>
          <span 
            className="text-dark-300 cursor-default px-2 transition-colors active:text-primary-500"
            onClick={handleVsClick}
          >
            vs
          </span>
          <span className="gradient-text">AI</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-xl md:text-2xl text-dark-300 mb-12"
        >
          Saurez-vous repérer ce qui est généré par l'intelligence artificielle ?
        </motion.p>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12"
        >
          <div className="card flex flex-col items-center p-6 transition-transform active:scale-95">
            <div className="w-14 h-14 rounded-full bg-primary-500/20 flex items-center justify-center mb-4">
              <Zap className="w-7 h-7 text-primary-400" />
            </div>
            <h3 className="font-display text-lg font-semibold mb-2">10 Défis</h3>
            <p className="text-dark-400 text-sm">Testez votre perception sur 10 paires d'images ou vidéos</p>
          </div>

          <div className="card flex flex-col items-center p-6 transition-transform active:scale-95">
            <div className="w-14 h-14 rounded-full bg-accent-500/20 flex items-center justify-center mb-4">
              <Trophy className="w-7 h-7 text-accent-400" />
            </div>
            <h3 className="font-display text-lg font-semibold mb-2">Streak Bonus</h3>
            <p className="text-dark-400 text-sm">Enchaînez les bonnes réponses pour des points bonus</p>
          </div>

          <div className="card flex flex-col items-center p-6 transition-transform active:scale-95">
            <div className="w-14 h-14 rounded-full bg-orange-500/20 flex items-center justify-center mb-4">
              <Trophy className="w-7 h-7 text-orange-400" />
            </div>
            <h3 className="font-display text-lg font-semibold mb-2">Classement</h3>
            <p className="text-dark-400 text-sm">Comparez votre score avec les autres joueurs</p>
          </div>
        </motion.div>

        {/* Indicateur subtil du Musée */}
        <AnimatePresence>
          {showMuseumHint && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-dark-950/90 backdrop-blur-xl"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center"
              >
                <div className="text-6xl mb-4">🏛️</div>
                <h2 className="text-3xl font-display font-bold gradient-text">Entrée du Musée...</h2>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Start Button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.7 }}
        >
          <button
            onClick={handleStartClick}
            disabled={isStarting}
            className="btn-primary inline-flex items-center gap-3 text-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isStarting ? (
              <>
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Chargement...
              </>
            ) : (
              <>
                <Play className="w-6 h-6" />
                Commencer
              </>
            )}
          </button>
        </motion.div>

        {/* Multiplayer Mode Button */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-8"
        >
          <button
            onClick={() => navigate('/multiplayer/host')}
            className="btn-secondary inline-flex items-center gap-3 text-lg"
          >
            <Users className="w-5 h-5" />
            Mode Classe
          </button>
        </motion.div>

        {/* Leaderboard link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="mt-6"
        >
          <button
            onClick={() => navigate('/leaderboard')}
            className="text-dark-400 active:text-primary-400 transition-colors p-3"
          >
            <Trophy className="w-5 h-5 inline mr-2" />
            Voir le classement
          </button>
        </motion.div>
      </motion.div>

      {/* Modal de sélection d'audience */}
      <AnimatePresence>
        {showAudienceModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-900/80 backdrop-blur-sm"
            onClick={() => setShowAudienceModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="card max-w-md w-full p-8 relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Bouton fermer — agrandi pour le tactile */}
              <button
                onClick={() => setShowAudienceModal(false)}
                className="absolute top-3 right-3 text-dark-400 active:text-white transition-colors p-2 rounded-full"
              >
                <X className="w-7 h-7" />
              </button>

              {/* Titre */}
              <h2 className="font-display text-2xl font-bold text-center mb-2">
                Qui êtes-vous ?
              </h2>
              <p className="text-dark-400 text-center mb-8">
                Cette information nous aide à améliorer l'expérience
              </p>

              {/* Options */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Option Scolaire — zones tactiles agrandies */}
                <button
                  onClick={() => startGame('school')}
                  className="group flex flex-col items-center gap-4 p-8 rounded-xl bg-dark-800 border-2 border-dark-700 active:border-primary-500 active:bg-dark-700 transition-all min-h-[140px]"
                >
                  <div className="w-20 h-20 rounded-full bg-primary-500/20 flex items-center justify-center group-active:bg-primary-500/30 transition-colors">
                    <GraduationCap className="w-10 h-10 text-primary-400" />
                  </div>
                  <div className="text-center">
                    <div className="font-display text-xl font-semibold mb-1">Scolaire</div>
                    <div className="text-dark-400 text-sm">École, collège, lycée...</div>
                  </div>
                </button>

                {/* Option Grand Public — zones tactiles agrandies */}
                <button
                  onClick={() => startGame('public')}
                  className="group flex flex-col items-center gap-4 p-8 rounded-xl bg-dark-800 border-2 border-dark-700 active:border-accent-500 active:bg-dark-700 transition-all min-h-[140px]"
                >
                  <div className="w-20 h-20 rounded-full bg-accent-500/20 flex items-center justify-center group-active:bg-accent-500/30 transition-colors">
                    <Users className="w-10 h-10 text-accent-400" />
                  </div>
                  <div className="text-center">
                    <div className="font-display text-xl font-semibold mb-1">Grand Public</div>
                    <div className="text-dark-400 text-sm">Particulier, entreprise...</div>
                  </div>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
