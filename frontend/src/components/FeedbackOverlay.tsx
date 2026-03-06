import { motion } from 'framer-motion';
import { CheckCircle, XCircle, TrendingUp, Users } from 'lucide-react';

interface FeedbackOverlayProps {
  isCorrect: boolean;
  hint: string;
  pointsEarned: number;
  globalStats: {
    total_attempts: number;
    success_rate: number;
  };
}

export default function FeedbackOverlay({
  isCorrect,
  hint,
  pointsEarned,
  globalStats,
}: FeedbackOverlayProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-dark-950/90"
    >
      <motion.div
        initial={{ scale: 0.8, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 20 }}
        className={`max-w-md w-full mx-4 p-8 rounded-3xl ${
          isCorrect
            ? 'bg-gradient-to-br from-green-900/90 to-green-950/90 border border-green-500/30'
            : 'bg-gradient-to-br from-red-900/90 to-red-950/90 border border-red-500/30'
        }`}
      >
        {/* Icon */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 10, delay: 0.1 }}
          className="flex justify-center mb-6"
        >
          {isCorrect ? (
            <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-green-400" />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center">
              <XCircle className="w-12 h-12 text-red-400" />
            </div>
          )}
        </motion.div>

        {/* Title */}
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className={`text-3xl font-display font-bold text-center mb-4 ${
            isCorrect ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {isCorrect ? 'Bien joué !' : 'Raté !'}
        </motion.h2>

        {/* Points */}
        {pointsEarned > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-center gap-2 mb-6"
          >
            <TrendingUp className="w-5 h-5 text-green-400" />
            <span className="text-2xl font-bold text-green-400">+{pointsEarned} points</span>
          </motion.div>
        )}

        {/* Hint */}
        {hint && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-center text-dark-200 mb-6"
          >
            {hint}
          </motion.p>
        )}

        {/* Global Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex items-center justify-center gap-2 text-sm text-dark-400"
        >
          <Users className="w-4 h-4" />
          <span>
            {globalStats.success_rate}% des joueurs ont trouvé la bonne réponse
          </span>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

