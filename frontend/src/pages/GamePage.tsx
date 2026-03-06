import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Flame, Home, X } from 'lucide-react';
import { gameApi, MediaPair, AnswerResponse } from '../services/api';
import MediaDisplay from '../components/MediaDisplay';
import AudioDisplay from '../components/AudioDisplay';
import Timer from '../components/Timer';
import ProgressBar from '../components/ProgressBar';
import FeedbackOverlay from '../components/FeedbackOverlay';
import LogoMIA from '../components/LogoMIA';

export default function GamePage() {
  const { sessionKey } = useParams<{ sessionKey: string }>();
  const navigate = useNavigate();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [isAnswering, setIsAnswering] = useState(false);
  const [feedback, setFeedback] = useState<AnswerResponse | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [pairs, setPairs] = useState<MediaPair[]>([]);
  const startTimeRef = useRef<number>(Date.now());

  // Fetch session data
  const { data: session, isLoading, error } = useQuery({
    queryKey: ['session', sessionKey],
    queryFn: async () => {
      const response = await gameApi.startSession();
      return response.data;
    },
    enabled: false, // We use the stored session
  });

  // Load pairs from localStorage (stored when session was created)
  useEffect(() => {
    const storedPairs = localStorage.getItem(`pairs_${sessionKey}`);
    if (storedPairs) {
      setPairs(JSON.parse(storedPairs));
    } else {
      // If no stored pairs, go back to home
      navigate('/');
    }
  }, [sessionKey, navigate]);

  const currentPair = pairs[currentIndex];

  const handleQuit = useCallback(() => {
    setShowQuitConfirm(true);
  }, []);

  const confirmQuit = useCallback(() => {
    // Nettoyer le localStorage de la session
    if (sessionKey) {
      localStorage.removeItem(`pairs_${sessionKey}`);
    }
    navigate('/');
  }, [sessionKey, navigate]);

  const handleAnswer = useCallback(
    async (choice: 'left' | 'right' | 'real' | 'ai') => {
      if (isAnswering || !currentPair || !sessionKey) return;

      setIsAnswering(true);
      const responseTime = Date.now() - startTimeRef.current;

      try {
        const response = await gameApi.submitAnswer(
          sessionKey,
          currentPair.id,
          choice,
          responseTime
        );

        const result = response.data;
        setFeedback(result);
        setScore(result.total_score);
        setStreak(result.current_streak);
        setShowFeedback(true);

        // Wait for feedback animation
        setTimeout(() => {
          setShowFeedback(false);

          if (result.is_session_complete) {
            navigate(`/result/${sessionKey}`);
          } else {
            setCurrentIndex((prev) => prev + 1);
            startTimeRef.current = Date.now();
          }

          setIsAnswering(false);
          setFeedback(null);
        }, 2000);
      } catch (error) {
        console.error('Error submitting answer:', error);
        setIsAnswering(false);
      }
    },
    [isAnswering, currentPair, sessionKey, navigate]
  );

  // Reset timer on question change
  useEffect(() => {
    startTimeRef.current = Date.now();
  }, [currentIndex]);

  if (!currentPair) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8">
      {/* Logo MIA en bas à gauche */}
      <LogoMIA size="small" />

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-4 mb-6"
      >
        {/* Bouton Quitter - en haut à gauche (agrandi pour tactile) */}
        <button
          onClick={handleQuit}
          className="btn-secondary flex items-center gap-2 px-5 py-3 text-base active:bg-dark-700 transition-colors"
          title="Quitter la partie"
        >
          <Home className="w-5 h-5" />
          <span>Quitter</span>
        </button>

        {/* Progress */}
        <div className="flex-1 min-w-[200px]">
          <div className="text-sm text-dark-400 mb-2">
            Question {currentIndex + 1} / {pairs.length}
          </div>
          <ProgressBar current={currentIndex + 1} total={pairs.length} />
        </div>

        {/* Score */}
        <div className="card px-6 py-3 flex items-center gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold gradient-text">{score}</div>
            <div className="text-xs text-dark-400">Points</div>
          </div>

          {streak > 1 && (
            <div className="streak-badge">
              <Flame className="w-5 h-5" />
              <span>x{streak}</span>
            </div>
          )}
        </div>

        {/* Timer */}
        <Timer 
          key={currentIndex} 
          duration={30} 
          onTimeUp={() => handleAnswer(currentPair.media_type === 'audio' ? 'ai' : 'left')} 
        />
      </motion.div>

      {/* Game Area */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <motion.h2
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-2xl md:text-3xl font-display font-bold text-center mb-8"
        >
          {currentPair.media_type === 'audio' ? (
            <>Est-ce <span className="gradient-text">réel</span> ou <span className="gradient-text">IA</span> ?</>
          ) : (
            <>Laquelle est générée par <span className="gradient-text">IA</span> ?</>
          )}
        </motion.h2>

        {/* Audio Display */}
        {currentPair.media_type === 'audio' && currentPair.audio_media && (
          <div className="w-full max-w-2xl">
            <AnimatePresence mode="wait">
              <motion.div
                key={`audio-${currentIndex}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <AudioDisplay
                  src={currentPair.audio_media}
                  onAnswer={(choice) => handleAnswer(choice)}
                  disabled={isAnswering}
                  isCorrect={feedback?.is_correct}
                  isReal={feedback?.ai_position === 'real'}
                  isSelected={feedback?.ai_position !== undefined}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        )}

        {/* Media Cards (Image/Video) */}
        {currentPair.media_type !== 'audio' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-5xl">
            <AnimatePresence mode="wait">
              <motion.div
                key={`left-${currentIndex}`}
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -50 }}
                transition={{ duration: 0.3 }}
              >
                <MediaDisplay
                  src={currentPair.left_media!}
                  type={currentPair.media_type as 'image' | 'video'}
                  label="A"
                  onClick={() => handleAnswer('left')}
                  disabled={isAnswering}
                  isCorrect={
                    feedback
                      ? feedback.ai_position === 'left'
                        ? true
                        : false
                      : undefined
                  }
                  isSelected={feedback?.ai_position !== undefined}
                />
              </motion.div>

              <motion.div
                key={`right-${currentIndex}`}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 50 }}
                transition={{ duration: 0.3 }}
              >
                <MediaDisplay
                  src={currentPair.right_media!}
                  type={currentPair.media_type as 'image' | 'video'}
                  label="B"
                  onClick={() => handleAnswer('right')}
                  disabled={isAnswering}
                  isCorrect={
                    feedback
                      ? feedback.ai_position === 'right'
                        ? true
                        : false
                      : undefined
                  }
                  isSelected={feedback?.ai_position !== undefined}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        )}

        {/* Category & Difficulty */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="mt-6 flex items-center gap-4 text-sm text-dark-400"
        >
          <span className="px-3 py-1 rounded-full bg-dark-800">
            {currentPair.category?.name || 'Général'}
          </span>
          <span
            className={`px-3 py-1 rounded-full ${
              currentPair.difficulty === 'easy'
                ? 'bg-green-500/20 text-green-400'
                : currentPair.difficulty === 'medium'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-red-500/20 text-red-400'
            }`}
          >
            {currentPair.difficulty === 'easy'
              ? 'Facile'
              : currentPair.difficulty === 'medium'
              ? 'Moyen'
              : 'Difficile'}
          </span>
        </motion.div>
      </div>

      {/* Feedback Overlay */}
      <AnimatePresence>
        {showFeedback && feedback && (
          <FeedbackOverlay
            isCorrect={feedback.is_correct}
            hint={feedback.hint}
            pointsEarned={feedback.points_earned}
            globalStats={feedback.global_stats}
          />
        )}
      </AnimatePresence>

      {/* Modale de confirmation de sortie (remplace window.confirm pour le tactile) */}
      <AnimatePresence>
        {showQuitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-900/80 backdrop-blur-sm"
            onClick={() => setShowQuitConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="card max-w-sm w-full p-8 relative text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowQuitConfirm(false)}
                className="absolute top-4 right-4 text-dark-400 active:text-white transition-colors p-2"
              >
                <X className="w-6 h-6" />
              </button>

              <h2 className="font-display text-2xl font-bold mb-3">
                Quitter la partie ?
              </h2>
              <p className="text-dark-400 mb-8">
                Votre progression sera perdue.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button
                  onClick={() => setShowQuitConfirm(false)}
                  className="btn-secondary px-8 py-4 text-lg"
                >
                  Continuer
                </button>
                <button
                  onClick={confirmQuit}
                  className="px-8 py-4 rounded-xl font-semibold text-lg bg-red-500/20 active:bg-red-500/40 border-2 border-red-500/50 text-red-400 transition-all"
                >
                  Quitter
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

