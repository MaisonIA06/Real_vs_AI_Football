import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Play, Hand } from 'lucide-react';

interface MediaDisplayProps {
  src: string;
  type: 'image' | 'video';
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  isCorrect?: boolean;
  isSelected?: boolean;
}

export default function MediaDisplay({
  src,
  type,
  label,
  onClick,
  disabled = false,
  isCorrect,
  isSelected = false,
}: MediaDisplayProps) {
  const getStatusClasses = () => {
    if (!isSelected) return '';
    if (isCorrect) return 'selected-correct glow-success';
    return 'selected-wrong glow-error';
  };

  return (
    <motion.div
      whileTap={!disabled ? { scale: 0.97 } : {}}
      className={`media-card aspect-[4/3] relative ${getStatusClasses()} ${
        disabled ? 'cursor-not-allowed opacity-80' : ''
      }`}
      onClick={!disabled ? onClick : undefined}
    >
      {/* Label Badge */}
      <div className="absolute top-4 left-4 z-20 w-12 h-12 rounded-full bg-dark-900/80 backdrop-blur-sm flex items-center justify-center font-display font-bold text-xl">
        {label}
      </div>

      {/* Video indicator */}
      {type === 'video' && (
        <div className="absolute top-4 right-4 z-20 px-3 py-1.5 rounded-full bg-primary-500/80 backdrop-blur-sm flex items-center gap-1 text-sm font-semibold">
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
          loading="lazy"
        />
      ) : (
        <video
          src={src}
          className="w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onError={(e) => console.error('Video load error:', src, e)}
        />
      )}

      {/* Touch-friendly selection overlay — visible en permanence (pas de hover) */}
      {!disabled && !isSelected && (
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-dark-900/80 to-transparent pt-12 pb-4 flex items-end justify-center pointer-events-none">
          <span className="px-6 py-3 rounded-xl bg-primary-500/90 backdrop-blur-sm font-semibold text-white flex items-center gap-2 shadow-lg">
            <Hand className="w-5 h-5" />
            Sélectionner
          </span>
        </div>
      )}

      {/* Result Overlay */}
      {isSelected && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={`absolute inset-0 flex items-center justify-center ${
            isCorrect ? 'bg-green-500/30' : 'bg-red-500/30'
          }`}
        >
          {isCorrect ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 10 }}
            >
              <CheckCircle className="w-20 h-20 text-green-400" />
            </motion.div>
          ) : (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', damping: 10 }}
            >
              <XCircle className="w-20 h-20 text-red-400" />
            </motion.div>
          )}
        </motion.div>
      )}

      {/* Real/AI Label after answer */}
      {isSelected && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full font-semibold text-lg ${
            isCorrect
              ? 'bg-green-500/90 text-white'
              : 'bg-red-500/90 text-white'
          }`}
        >
          {isCorrect ? 'IA' : 'RÉEL'}
        </motion.div>
      )}
    </motion.div>
  );
}

