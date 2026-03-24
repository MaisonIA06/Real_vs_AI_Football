import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { gameApi } from '../../services/api';
import LogoMIA from '../../components/LogoMIA';

export default function MultiplayerJoinPage() {
  const { roomCode: urlRoomCode } = useParams<{ roomCode?: string }>();
  const navigate = useNavigate();

  // Debug: log the URL room code
  console.log('[JoinPage] Render with urlRoomCode:', urlRoomCode);

  const [roomCode, setRoomCode] = useState(urlRoomCode?.toUpperCase() || '');
  const [pseudo, setPseudo] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomExists, setRoomExists] = useState<boolean | null>(null);

  // Sync roomCode from URL params (handles late resolution from React Router)
  useEffect(() => {
    if (urlRoomCode && urlRoomCode.toUpperCase() !== roomCode) {
      console.log('[JoinPage] Syncing roomCode from URL:', urlRoomCode);
      setRoomCode(urlRoomCode.toUpperCase());
    }
  }, [urlRoomCode, roomCode]);

  // Verify room exists when code changes
  useEffect(() => {
    if (roomCode.length === 6) {
      const verifyRoom = async () => {
        // Utiliser fetch natif au lieu d'axios pour iOS
        const apiUrl = `${window.location.protocol}//${window.location.host}/api/game/multiplayer/rooms/${roomCode.toUpperCase()}/`;
        
        try {
          const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          if (response.ok) {
            setRoomExists(true);
            setError(null);
          } else {
            setRoomExists(false);
            setError('Room introuvable');
          }
        } catch (err: unknown) {
          setRoomExists(false);
          setError('Room introuvable');
        }
      };
      verifyRoom();
    } else {
      setRoomExists(null);
      setError(null);
    }
  }, [roomCode]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!roomCode || roomCode.length !== 6) {
      setError('Entrez un code à 6 caractères');
      return;
    }

    if (!pseudo || pseudo.length < 2) {
      setError('Entrez un pseudo (min 2 caractères)');
      return;
    }

    if (pseudo.length > 50) {
      setError('Pseudo trop long (max 50 caractères)');
      return;
    }

    setIsLoading(true);
    setError(null);

    // Navigate to player page - the WebSocket connection will handle joining
    navigate(`/multiplayer/play/${roomCode.toUpperCase()}`, {
      state: { pseudo },
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      {/* Background decorations */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
      </div>

      <LogoMIA size="medium" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Title */}
        <motion.h1
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="font-display text-4xl md:text-5xl font-bold mb-2 text-center"
        >
          <span className="gradient-text">Rejoindre</span>
        </motion.h1>
        <p className="text-dark-400 text-center mb-8">
          Entrez le code de la room et votre pseudo
        </p>

        {/* Join Form */}
        <form onSubmit={handleJoin} className="card p-6 space-y-6">
          {/* Room Code Input */}
          <div>
            <label htmlFor="roomCode" className="block text-sm font-medium text-dark-300 mb-2">
              Code de la room
            </label>
            <input
              type="text"
              id="roomCode"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="ABC123"
              className="w-full px-4 py-3 bg-dark-800 border-2 border-dark-700 rounded-xl text-center text-2xl font-mono tracking-widest focus:border-primary-500 focus:outline-none transition-colors"
              maxLength={6}
              autoComplete="off"
              autoFocus={!urlRoomCode}
            />
            {roomCode.length === 6 && (
              <div className="mt-2 flex items-center justify-center gap-2">
                {roomExists === true && (
                  <span className="text-green-400 text-sm flex items-center gap-1">
                    <span className="w-2 h-2 bg-green-400 rounded-full" />
                    Room trouvée
                  </span>
                )}
                {roomExists === false && (
                  <span className="text-red-400 text-sm flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    Room introuvable
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Pseudo Input */}
          <div>
            <label htmlFor="pseudo" className="block text-sm font-medium text-dark-300 mb-2">
              Votre pseudo
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
              <input
                type="text"
                id="pseudo"
                value={pseudo}
                onChange={(e) => setPseudo(e.target.value)}
                placeholder="Entrez votre pseudo"
                className="w-full pl-12 pr-4 py-3 bg-dark-800 border-2 border-dark-700 rounded-xl focus:border-primary-500 focus:outline-none transition-colors"
                maxLength={50}
                autoComplete="off"
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 px-4 py-2 rounded-lg"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </motion.div>
          )}

          {/* Join Button */}
          <button
            type="submit"
            disabled={isLoading || !roomExists || !pseudo}
            className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Connexion...
              </>
            ) : (
              <>
                <ArrowRight className="w-5 h-5" />
                Rejoindre la partie
              </>
            )}
          </button>
        </form>

        {/* Back Link — caché quand on arrive via un code room (mode élève) */}
        {!urlRoomCode && (
          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/')}
              className="text-dark-400 active:text-primary-400 transition-colors p-3 text-lg"
            >
              ← Retour à l'accueil
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

