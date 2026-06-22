import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import {
  Users, Play, ArrowRight, Eye, Trophy, Home, CheckCircle, Crown, Medal, Award,
} from 'lucide-react';
import { gameApi } from '../../services/api';
import {
  useQuizSocket, QuizQuestionData, QuizAnswerData, QuizPodiumPlayer,
} from '../../hooks/useQuizSocket';
import LogoMIA from '../../components/LogoMIA';

type HostScreen = 'lobby' | 'question' | 'answer' | 'podium';
const LETTERS = ['A', 'B', 'C', 'D'];

const fireConfetti = () => {
  confetti({ particleCount: 120, spread: 80, origin: { y: 0.5 }, colors: ['#FFD700', '#FFA500', '#22c55e', '#00CED1'] });
};

export default function QuizHostPage() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [hostToken, setHostToken] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState('');
  const [detectedIp, setDetectedIp] = useState('');
  const [customIp, setCustomIp] = useState('');
  const [showIpInput, setShowIpInput] = useState(false);
  const [showQuitConfirm, setShowQuitConfirm] = useState(false);
  const [questionCount, setQuestionCount] = useState<number>(0);
  const [screen, setScreen] = useState<HostScreen>('lobby');
  const [answeredPlayers, setAnsweredPlayers] = useState<Set<number>>(new Set());
  const roomCreatedRef = useRef(false);

  // Créer la room au montage (garde anti double-création en StrictMode).
  useEffect(() => {
    if (roomCreatedRef.current) return;
    roomCreatedRef.current = true;

    const createRoom = async () => {
      try {
        let lanIp: string | null = null;
        try {
          const ipResponse = await gameApi.getLocalIP();
          lanIp = ipResponse.data.ip;
        } catch { /* fallback sur window.location */ }

        const response = await gameApi.createQuizRoom();
        const code = response.data.room_code;
        setRoomCode(code);
        setQuestionCount(response.data.question_count ?? 0);
        if (response.data.host_token) setHostToken(response.data.host_token);

        const currentUrl = new URL(window.location.href);
        const protocol = currentUrl.protocol;
        setDetectedIp(lanIp || currentUrl.hostname);
        let hostname: string;
        if (lanIp && lanIp !== '127.0.0.1' && !lanIp.startsWith('172.18.') && !lanIp.startsWith('172.17.')) {
          hostname = lanIp;
        } else {
          hostname = currentUrl.hostname;
          if (hostname === 'localhost' || hostname === '127.0.0.1') hostname = lanIp || hostname;
        }
        setJoinUrl(`${protocol}//${hostname}/quiz/join/${code}`);
      } catch (error) {
        console.error('Échec de création de la room quiz:', error);
        navigate('/');
      }
    };
    createRoom();
  }, [navigate]);

  const handleGameStarted = useCallback((_q: QuizQuestionData) => {
    setScreen('question');
    setAnsweredPlayers(new Set());
  }, []);

  const handleNewQuestion = useCallback((_q: QuizQuestionData) => {
    setScreen('question');
    setAnsweredPlayers(new Set());
  }, []);

  const handleAnswerRevealed = useCallback((_a: QuizAnswerData) => {
    setScreen('answer');
  }, []);

  const handlePlayerAnswered = useCallback((playerId: number) => {
    setAnsweredPlayers((prev) => new Set(prev).add(playerId));
  }, []);

  const handleGameFinished = useCallback((_podium: QuizPodiumPlayer[]) => {
    setScreen('podium');
    fireConfetti();
  }, []);

  // Ref vers showAnswer : permet de le déclencher depuis handleAllAnswered, qui
  // est défini avant que le hook n'expose showAnswer.
  const showAnswerRef = useRef<() => void>(() => {});

  const handleAllAnswered = useCallback(() => {
    // Auto-révélation quand tous les joueurs connectés ont répondu (comme le mode classe).
    showAnswerRef.current();
  }, []);

  const {
    players, currentQuestion, currentAnswer, podium,
    startGame, nextQuestion, showAnswer, endGame,
  } = useQuizSocket({
    roomCode: roomCode ?? '',
    isHost: true,
    hostToken: hostToken ?? undefined,
    onGameStarted: handleGameStarted,
    onNewQuestion: handleNewQuestion,
    onAnswerRevealed: handleAnswerRevealed,
    onPlayerAnswered: handlePlayerAnswered,
    onAllAnswered: handleAllAnswered,
    onGameFinished: handleGameFinished,
  });

  // Garder la ref synchronisée avec la dernière instance de showAnswer.
  useEffect(() => {
    showAnswerRef.current = showAnswer;
  }, [showAnswer]);

  // --- Helpers IP / lien de partage (alignés sur le mode classe) ---
  const updateJoinUrl = (ip: string) => {
    if (!roomCode) return;
    setJoinUrl(`${window.location.protocol}//${ip}/quiz/join/${roomCode}`);
  };

  const handleCustomIpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const ip = e.target.value;
    setCustomIp(ip);
    if (ip && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
      updateJoinUrl(ip);
    }
  };

  const handleUseDetectedIp = () => {
    if (detectedIp && detectedIp !== 'localhost' && detectedIp !== '127.0.0.1') {
      setCustomIp(detectedIp);
      updateJoinUrl(detectedIp);
      setShowIpInput(false);
    }
  };

  const isTrueFalse = currentQuestion?.question_type === 'truefalse';
  const answeredCount = answeredPlayers.size;

  if (!roomCode) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-4 md:p-8">
      <LogoMIA size="small" />

      {/* Header : Quitter + compteur joueurs (sans chrono, choix produit) */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-6"
      >
        <button
          onClick={() => setShowQuitConfirm(true)}
          className="btn-secondary flex items-center gap-2 px-5 py-3 text-base"
        >
          <Home className="w-5 h-5" />
          <span>Quitter</span>
        </button>

        <div className="card px-4 py-2 flex items-center gap-2">
          <Users className="w-5 h-5 text-primary-400" />
          <span className="font-bold">{players.length}</span>
          <span className="text-dark-400 hidden sm:inline">joueur{players.length > 1 ? 's' : ''}</span>
        </div>
      </motion.div>

      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-5xl mx-auto">
        <AnimatePresence mode="wait">
          {/* LOBBY : Salle d'attente (QR + code + lien + IP + avatars) */}
          {screen === 'lobby' && (
            <motion.div
              key="lobby"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="text-center max-w-2xl w-full"
            >
              <h1 className="font-display text-4xl md:text-5xl font-bold mb-2">
                <span className="gradient-text">Salle d'attente</span>
              </h1>
              <p className="text-dark-400 mb-8">Quiz Foot ⚽ — {questionCount} questions</p>

              {/* QR Code + code + lien + correction IP */}
              <div className="card p-8 mb-8 inline-block">
                {joinUrl && (
                  <QRCodeSVG value={joinUrl} size={200} level="M" includeMargin className="mx-auto" />
                )}
                <p className="mt-4 text-dark-400">Scannez pour rejoindre</p>
                <div className="mt-2 px-4 py-2 bg-dark-800 rounded-lg">
                  <span className="text-dark-400">Code : </span>
                  <span className="font-mono font-bold text-2xl gradient-text">{roomCode}</span>
                </div>

                {joinUrl && (
                  <div className="mt-4 p-3 bg-dark-700 rounded-lg">
                    <p className="text-xs text-dark-400 mb-2">Ou copiez ce lien :</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={joinUrl}
                        readOnly
                        className="flex-1 px-2 py-1 bg-dark-800 rounded text-xs font-mono text-dark-300"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(joinUrl);
                          alert('URL copiée !');
                        }}
                        className="px-3 py-2 bg-primary-500/20 active:bg-primary-500/30 rounded text-sm text-primary-400 transition-colors whitespace-nowrap"
                      >
                        Copier
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <button
                    onClick={() => setShowIpInput(!showIpInput)}
                    className="text-sm text-primary-400 active:text-primary-300 transition-colors p-2"
                  >
                    {showIpInput ? 'Masquer' : "Corriger l'IP"}
                  </button>

                  {showIpInput && (
                    <div className="mt-2 p-3 bg-dark-700 rounded-lg">
                      <p className="text-xs text-dark-400 mb-2">Entrez votre IP LAN :</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={customIp}
                          onChange={handleCustomIpChange}
                          placeholder="192.168.x.x"
                          className="flex-1 px-2 py-1 bg-dark-800 rounded text-xs font-mono text-dark-300 focus:border-primary-500 focus:outline-none border-2 border-dark-700"
                          pattern="\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}"
                        />
                        {detectedIp && detectedIp !== 'localhost' && detectedIp !== '127.0.0.1' && (
                          <button
                            onClick={handleUseDetectedIp}
                            className="px-3 py-2 bg-accent-500/20 active:bg-accent-500/30 rounded text-sm text-accent-400 transition-colors"
                            title={`Utiliser ${detectedIp}`}
                          >
                            Auto
                          </button>
                        )}
                      </div>
                      {customIp && !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(customIp) && (
                        <p className="text-xs text-red-400 mt-1">Format IP invalide</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Liste des joueurs avec avatars */}
              <div className="card p-6 mb-8">
                <h3 className="font-display text-lg font-semibold mb-4 flex items-center justify-center gap-2">
                  <Users className="w-5 h-5 text-primary-400" />
                  Joueurs connectés ({players.length})
                </h3>
                {players.length === 0 ? (
                  <p className="text-dark-400">En attente de joueurs...</p>
                ) : (
                  <div className="flex flex-wrap justify-center gap-3">
                    {players.map((player, index) => (
                      <motion.div
                        key={player.id}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: index * 0.1 }}
                        className="px-4 py-2 bg-dark-700 rounded-full flex items-center gap-2"
                      >
                        <div className="w-8 h-8 rounded-full bg-primary-500/30 flex items-center justify-center">
                          {player.pseudo.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{player.pseudo}</span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={startGame}
                disabled={players.length < 1}
                className="btn-primary inline-flex items-center gap-3 text-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-6 h-6" />
                Lancer la partie
              </button>
            </motion.div>
          )}

          {/* QUESTION & RÉVÉLATION */}
          {(screen === 'question' || screen === 'answer') && currentQuestion && (
            <motion.div key="question" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="w-full text-center">
              <p className="text-dark-400 mb-1">
                Question {currentQuestion.question_number}/{currentQuestion.total_questions}
              </p>
              <h2 className="font-display text-2xl md:text-3xl font-bold mb-5">{currentQuestion.question_text}</h2>

              {currentQuestion.image && (
                <img src={currentQuestion.image} alt=""
                  className="max-h-[40vh] w-auto mx-auto rounded-2xl mb-6 object-contain" />
              )}

              <div className={`grid grid-cols-2 gap-3 mb-6 ${isTrueFalse ? 'max-w-xl' : 'max-w-3xl'} mx-auto`}>
                {currentQuestion.choices.map((choice, index) => {
                  const isCorrect = screen === 'answer' && currentAnswer?.correct_index === index;
                  return (
                    <div key={index}
                      className={`flex items-center gap-3 px-5 py-4 rounded-2xl border-2 text-left text-lg font-medium transition-all ${
                        isCorrect ? 'border-green-500 bg-green-500/20'
                          : 'border-dark-700 bg-dark-800'
                      }`}>
                      {!isTrueFalse && (
                        <span className="flex-shrink-0 w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center font-bold">
                          {LETTERS[index]}
                        </span>
                      )}
                      <span className="flex-1">{choice}</span>
                      {isCorrect && <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0" />}
                    </div>
                  );
                })}
              </div>

              {/* Anecdote à la révélation */}
              {screen === 'answer' && currentAnswer?.anecdote && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="card p-4 max-w-3xl mx-auto text-left text-dark-300 mb-6">
                  💡 {currentAnswer.anecdote}
                </motion.div>
              )}

              {/* Contrôles animateur */}
              <div className="flex items-center justify-center gap-4">
                {screen === 'question' ? (
                  <>
                    <span className="flex items-center gap-2 text-dark-400">
                      <Users className="w-5 h-5" /> {answeredCount}/{players.length} ont répondu
                    </span>
                    <button onClick={showAnswer} className="btn-primary flex items-center gap-2">
                      <Eye className="w-5 h-5" /> Révéler la réponse
                    </button>
                  </>
                ) : currentQuestion.question_number >= currentQuestion.total_questions ? (
                  <button onClick={endGame} className="btn-primary flex items-center gap-2">
                    <Trophy className="w-5 h-5" /> Voir le podium
                  </button>
                ) : (
                  <button onClick={nextQuestion} className="btn-primary flex items-center gap-2">
                    <ArrowRight className="w-5 h-5" /> Question suivante
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* PODIUM */}
          {screen === 'podium' && (
            <motion.div key="podium" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-xl text-center">
              <Trophy className="w-20 h-20 text-yellow-400 mx-auto mb-4" />
              <h1 className="font-display text-4xl font-bold gradient-text mb-8">Podium</h1>
              <div className="space-y-3">
                {podium.slice(0, 5).map((p) => {
                  const icon = p.rank === 1 ? <Crown className="w-6 h-6 text-yellow-400" />
                    : p.rank === 2 ? <Medal className="w-6 h-6 text-gray-300" />
                    : p.rank === 3 ? <Award className="w-6 h-6 text-amber-600" />
                    : <span className="w-6 text-center text-dark-400">{p.rank}</span>;
                  return (
                    <motion.div key={p.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: p.rank * 0.1 }}
                      className={`flex items-center justify-between px-5 py-4 rounded-xl ${p.rank === 1 ? 'bg-yellow-500/10 border border-yellow-500/40' : 'bg-dark-800'}`}>
                      <span className="flex items-center gap-3 text-lg">{icon}<span className="font-semibold">{p.pseudo}</span></span>
                      <span className="font-bold text-xl">{p.score} pts</span>
                    </motion.div>
                  );
                })}
              </div>
              <button onClick={() => navigate('/')} className="btn-secondary mt-8 flex items-center gap-2 mx-auto">
                <Home className="w-5 h-5" /> Accueil
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Modale de confirmation de sortie (tactile-friendly) */}
      <AnimatePresence>
        {showQuitConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-dark-900/80"
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
              <h2 className="font-display text-2xl font-bold mb-3">Quitter la partie ?</h2>
              <p className="text-dark-400 mb-8">La partie sera terminée pour tous les joueurs.</p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button onClick={() => setShowQuitConfirm(false)} className="btn-secondary px-8 py-4 text-lg">
                  Continuer
                </button>
                <button
                  onClick={() => navigate('/')}
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
