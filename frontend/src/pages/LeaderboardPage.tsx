import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import { Trophy, Flame, Clock, Home, Medal } from 'lucide-react';
import { gameApi } from '../services/api';
import LogoMIA from '../components/LogoMIA';

export default function LeaderboardPage() {
  const navigate = useNavigate();

  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => gameApi.getLeaderboard(undefined, 20).then((res) => res.data),
  });

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getMedalColor = (position: number) => {
    switch (position) {
      case 0:
        return 'text-yellow-400';
      case 1:
        return 'text-gray-300';
      case 2:
        return 'text-amber-600';
      default:
        return 'text-dark-500';
    }
  };

  return (
    <div className="min-h-screen px-4 py-12">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl" />
      </div>

      {/* Logo MIA en bas à gauche */}
      <LogoMIA size="medium" />

      <div className="relative z-10 max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-yellow-500 to-orange-500 mb-6">
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Classement
          </h1>
          <p className="text-dark-400">Les meilleurs détecteurs d'IA</p>
        </motion.div>

        {/* Leaderboard */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card"
        >
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
            </div>
          ) : leaderboard && leaderboard.length > 0 ? (
            <div className="divide-y divide-dark-700">
              {leaderboard.map((entry, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * index }}
                  className={`flex items-center gap-4 p-4 ${
                    index < 3 ? 'bg-dark-800/30' : ''
                  }`}
                >
                  {/* Position */}
                  <div className="w-12 text-center">
                    {index < 3 ? (
                      <Medal className={`w-8 h-8 mx-auto ${getMedalColor(index)}`} />
                    ) : (
                      <span className="text-xl font-bold text-dark-500">{index + 1}</span>
                    )}
                  </div>

                  {/* Player info */}
                  <div className="flex-1">
                    <div className="font-semibold text-lg">{entry.pseudo}</div>
                    <div className="text-sm text-dark-400">
                      {entry.quiz_name || 'Mode Aléatoire'} • {formatDate(entry.created_at)}
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-6">
                    <div className="text-center hidden sm:block">
                      <div className="flex items-center gap-1 text-orange-400">
                        <Flame className="w-4 h-4" />
                        <span className="font-bold">{entry.streak_max}</span>
                      </div>
                      <div className="text-xs text-dark-500">Streak</div>
                    </div>

                    <div className="text-center hidden sm:block">
                      <div className="flex items-center gap-1 text-accent-400">
                        <Clock className="w-4 h-4" />
                        <span className="font-bold">{formatTime(entry.time_total_ms)}</span>
                      </div>
                      <div className="text-xs text-dark-500">Temps</div>
                    </div>

                    <div className="text-right min-w-[80px]">
                      <div className="text-2xl font-bold gradient-text">{entry.score}</div>
                      <div className="text-xs text-dark-500">points</div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-dark-400">
              <Trophy className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p>Aucun score enregistré pour le moment.</p>
              <p className="text-sm mt-2">Soyez le premier !</p>
            </div>
          )}
        </motion.div>

        {/* Back button */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-8"
        >
          <button onClick={() => navigate('/')} className="btn-secondary text-lg">
            <Home className="w-6 h-6 inline mr-2" />
            Retour à l'accueil
          </button>
        </motion.div>
      </div>
    </div>
  );
}

