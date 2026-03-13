import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  TrendingUp,
  Users,
  ArrowRight,
  Trophy,
  Volume2,
  Play,
  Pause,
} from 'lucide-react';
import { MediaPair, AnswerResponse } from '../services/api';

interface QuizResultProps {
  pair: MediaPair;
  feedback: AnswerResponse;
  playerChoice: 'left' | 'right' | 'real' | 'ai';
  onNext: () => void;
  isLastQuestion: boolean;
}

export default function QuizResult({
  pair,
  feedback,
  playerChoice,
  onNext,
  isLastQuestion,
}: QuizResultProps) {
  const { is_correct, hint, ai_position, points_earned, global_stats } = feedback;
  const successRate = global_stats.success_rate;
  const failRate = Math.round((100 - successRate) * 10) / 10;

  const isAudio = pair.media_type === 'audio';

  // For image/video: percentage of players who chose each side
  const getCardPercent = (side: 'left' | 'right'): number => {
    return ai_position === side ? successRate : failRate;
  };

  // For audio: percentage of players who chose each option
  const getAudioPercent = (choice: 'real' | 'ai'): number => {
    return ai_position === choice ? successRate : failRate;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-5xl mx-auto flex flex-col items-center"
    >
      {/* Result Header */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: 'spring', damping: 15 }}
        className="text-center mb-8"
      >
        <div className="flex justify-center mb-4">
          {is_correct ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 10, delay: 0.15 }}
              className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center"
            >
              <CheckCircle className="w-12 h-12 text-green-400" />
            </motion.div>
          ) : (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 10, delay: 0.15 }}
              className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center"
            >
              <XCircle className="w-12 h-12 text-red-400" />
            </motion.div>
          )}
        </div>
        <h2
          className={`text-3xl font-display font-bold mb-2 ${
            is_correct ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {is_correct ? 'Bien joué !' : 'Raté !'}
        </h2>
        {points_earned > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center justify-center gap-2"
          >
            <TrendingUp className="w-5 h-5 text-green-400" />
            <span className="text-xl font-bold text-green-400">
              +{points_earned} points
            </span>
          </motion.div>
        )}
      </motion.div>

      {/* Image/Video Results */}
      {!isAudio && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mb-8">
          <ResultMediaCard
            src={pair.left_media!}
            type={pair.media_type as 'image' | 'video'}
            label="A"
            isAI={ai_position === 'left'}
            isPlayerChoice={playerChoice === 'left'}
            percentage={getCardPercent('left')}
            delay={0.2}
          />
          <ResultMediaCard
            src={pair.right_media!}
            type={pair.media_type as 'image' | 'video'}
            label="B"
            isAI={ai_position === 'right'}
            isPlayerChoice={playerChoice === 'right'}
            percentage={getCardPercent('right')}
            delay={0.3}
          />
        </div>
      )}

      {/* Audio Results */}
      {isAudio && pair.audio_media && (
        <AudioResultSection
          src={pair.audio_media}
          aiPosition={ai_position as 'real' | 'ai'}
          playerChoice={playerChoice as 'real' | 'ai'}
          realPercent={getAudioPercent('real')}
          aiPercent={getAudioPercent('ai')}
        />
      )}

      {/* Hint */}
      {hint && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="card p-6 mb-6 w-full max-w-2xl text-center"
        >
          <p className="text-dark-200 italic text-lg">{hint}</p>
        </motion.div>
      )}

      {/* Global Stats */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="flex items-center justify-center gap-2 text-sm text-dark-400 mb-8"
      >
        <Users className="w-4 h-4" />
        <span>
          {successRate}% des joueurs ont trouvé la bonne réponse
          {global_stats.total_attempts > 0 &&
            ` (${global_stats.total_attempts} tentative${global_stats.total_attempts > 1 ? 's' : ''})`}
        </span>
      </motion.div>

      {/* Next Button */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7 }}
      >
        <button
          onClick={onNext}
          className="btn-primary inline-flex items-center gap-3 text-xl"
        >
          {isLastQuestion ? (
            <>
              <Trophy className="w-6 h-6" />
              Voir les résultats
            </>
          ) : (
            <>
              Suivant
              <ArrowRight className="w-6 h-6" />
            </>
          )}
        </button>
      </motion.div>
    </motion.div>
  );
}

/* ========================================
   Sub-component: ResultMediaCard
   ======================================== */

function ResultMediaCard({
  src,
  type,
  label,
  isAI,
  isPlayerChoice,
  percentage,
  delay,
}: {
  src: string;
  type: 'image' | 'video';
  label: string;
  isAI: boolean;
  isPlayerChoice: boolean;
  percentage: number;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="flex flex-col"
    >
      {/* Media Card */}
      <div
        className={`media-card aspect-[4/3] relative cursor-default ${
          isAI ? 'selected-correct glow-success' : ''
        }`}
      >
        {/* Label Badge */}
        <div className="absolute top-4 left-4 z-20 w-12 h-12 rounded-full bg-dark-900/80 backdrop-blur-sm flex items-center justify-center font-display font-bold text-xl">
          {label}
        </div>

        {/* Player Choice Badge */}
        {isPlayerChoice && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: delay + 0.2 }}
            className="absolute top-4 right-4 z-20 px-3 py-1.5 rounded-full bg-primary-500/90 backdrop-blur-sm text-sm font-semibold"
          >
            Votre choix
          </motion.div>
        )}

        {/* Video indicator */}
        {type === 'video' && (
          <div
            className={`absolute ${
              isPlayerChoice ? 'top-16' : 'top-4'
            } right-4 z-20 px-3 py-1.5 rounded-full bg-primary-500/80 backdrop-blur-sm flex items-center gap-1 text-sm font-semibold`}
          >
            <Play className="w-4 h-4" />
            VIDÉO
          </div>
        )}

        {/* Media Content */}
        {type === 'image' ? (
          <img
            src={src}
            alt={`Option ${label}`}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <video
            src={src}
            className="w-full h-full object-cover"
            autoPlay
            muted
            loop
            playsInline
          />
        )}

        {/* Result Overlay */}
        <div
          className={`absolute inset-0 flex items-center justify-center ${
            isAI ? 'bg-green-500/20' : 'bg-dark-900/20'
          }`}
        >
          {isAI && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 10, delay: delay + 0.1 }}
            >
              <CheckCircle className="w-16 h-16 text-green-400 drop-shadow-lg" />
            </motion.div>
          )}
        </div>

        {/* IA / RÉEL Label at bottom */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay + 0.2 }}
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-2 rounded-full font-semibold text-lg ${
            isAI ? 'bg-green-500/90 text-white' : 'bg-dark-700/90 text-dark-200'
          }`}
        >
          {isAI ? '🤖 IA' : '📷 RÉEL'}
        </motion.div>
      </div>

      {/* Stats Bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: delay + 0.3 }}
        className="mt-3 px-1"
      >
        <div className="flex justify-between items-center text-sm mb-1.5">
          <span className="text-dark-400">{percentage}% des joueurs</span>
        </div>
        <div className="h-3 bg-dark-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ delay: delay + 0.4, duration: 0.8, ease: 'easeOut' }}
            className={`h-full rounded-full ${
              isAI
                ? 'bg-gradient-to-r from-green-500 to-green-400'
                : 'bg-gradient-to-r from-dark-500 to-dark-400'
            }`}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ========================================
   Sub-component: AudioResultSection
   ======================================== */

function AudioResultSection({
  src,
  aiPosition,
  playerChoice,
  realPercent,
  aiPercent,
}: {
  src: string;
  aiPosition: 'real' | 'ai';
  playerChoice: 'real' | 'ai';
  realPercent: number;
  aiPercent: number;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isAudioReal = aiPosition === 'real';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="w-full max-w-2xl mb-8"
    >
      {/* Audio Player */}
      <div className="card p-6 mb-6">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-500/20 to-accent-500/20 flex items-center justify-center flex-shrink-0">
            <Volume2 className="w-8 h-8 text-primary-400" />
          </div>
          <div className="flex-1">
            <button
              onClick={handlePlayPause}
              className="w-14 h-14 rounded-full bg-primary-500 active:bg-primary-600 flex items-center justify-center transition-all active:scale-95 mb-2"
            >
              {isPlaying ? (
                <Pause className="w-7 h-7 text-white" />
              ) : (
                <Play className="w-7 h-7 text-white ml-0.5" />
              )}
            </button>
            <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all"
                style={{
                  width: `${duration ? (currentTime / duration) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-dark-400 mt-1">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>
        <audio
          ref={audioRef}
          src={src}
          onTimeUpdate={() =>
            audioRef.current && setCurrentTime(audioRef.current.currentTime)
          }
          onLoadedMetadata={() =>
            audioRef.current && setDuration(audioRef.current.duration)
          }
          onEnded={() => setIsPlaying(false)}
        />

        {/* Audio nature label */}
        <div className="mt-4 text-center">
          <span
            className={`inline-block px-6 py-2 rounded-full font-semibold text-lg ${
              isAudioReal
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}
          >
            Cet audio est {isAudioReal ? '📷 RÉEL' : '🤖 IA'}
          </span>
        </div>
      </div>

      {/* Answer Options as Results */}
      <div className="grid grid-cols-2 gap-4">
        <AudioChoiceResult
          label="RÉEL"
          isCorrectAnswer={aiPosition === 'real'}
          isPlayerChoice={playerChoice === 'real'}
          percentage={realPercent}
          delay={0.3}
        />
        <AudioChoiceResult
          label="IA"
          isCorrectAnswer={aiPosition === 'ai'}
          isPlayerChoice={playerChoice === 'ai'}
          percentage={aiPercent}
          delay={0.4}
        />
      </div>
    </motion.div>
  );
}

/* ========================================
   Sub-component: AudioChoiceResult
   ======================================== */

function AudioChoiceResult({
  label,
  isCorrectAnswer,
  isPlayerChoice,
  percentage,
  delay,
}: {
  label: string;
  isCorrectAnswer: boolean;
  isPlayerChoice: boolean;
  percentage: number;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`p-5 rounded-xl border-2 ${
        isCorrectAnswer
          ? 'bg-green-500/10 border-green-500/50'
          : 'bg-dark-800/50 border-dark-700'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className={`font-bold text-lg ${
            isCorrectAnswer ? 'text-green-400' : 'text-dark-300'
          }`}
        >
          {label}
        </span>
        <div className="flex items-center gap-2">
          {isPlayerChoice && (
            <span className="text-xs px-2 py-1 rounded-full bg-primary-500/30 text-primary-300 font-medium">
              Votre choix
            </span>
          )}
          {isCorrectAnswer && (
            <CheckCircle className="w-5 h-5 text-green-400" />
          )}
        </div>
      </div>

      {/* Percentage bar */}
      <div className="mb-1.5">
        <div className="h-3 bg-dark-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ delay: delay + 0.3, duration: 0.8, ease: 'easeOut' }}
            className={`h-full rounded-full ${
              isCorrectAnswer
                ? 'bg-gradient-to-r from-green-500 to-green-400'
                : 'bg-gradient-to-r from-dark-500 to-dark-400'
            }`}
          />
        </div>
      </div>
      <span className="text-sm text-dark-400">{percentage}% des joueurs</span>
    </motion.div>
  );
}
