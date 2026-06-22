import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import {
  Users, Play, ArrowRight, Eye, Trophy, Home, CheckCircle, XCircle, Crown, Medal, Award, Sparkles,
} from 'lucide-react';
import { gameApi } from '../../services/api';
import {
  useQuizSocket, QuizQuestionData, QuizAnswerData, QuizPodiumPlayer,
} from '../../hooks/useQuizSocket';
import LogoMIA from '../../components/LogoMIA';

type HostScreen = 'lobby' | 'question' | 'answer' | 'podium';
const LETTERS = ['A', 'B', 'C', 'D'];

// Pluie de confettis (4s, deux sources) — identique au mode classe.
const fireConfetti = () => {
  const duration = 4000;
  const animationEnd = Date.now() + duration;
  const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 1000 };
  const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

  const interval = window.setInterval(() => {
    const timeLeft = animationEnd - Date.now();
    if (timeLeft <= 0) return clearInterval(interval);
    const particleCount = 50 * (timeLeft / duration);
    confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 }, colors: ['#FFD700', '#FFA500', '#FF6347', '#00CED1', '#9370DB'] });
    confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 }, colors: ['#FFD700', '#FFA500', '#FF6347', '#00CED1', '#9370DB'] });
  }, 250);
};

const fireWinnerConfetti = () => {
  confetti({ particleCount: 100, spread: 70, origin: { x: 0.5, y: 0.5 }, colors: ['#FFD700', '#FFC700', '#FFE700'], scalar: 1.2 });
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
    // Les confettis sont déclenchés par l'apparition du podium (onAnimationComplete).
    setScreen('podium');
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

              {/* Résultats des joueurs (bonnes/mauvaises réponses + points), comme le mode classe */}
              {screen === 'answer' && currentAnswer && currentAnswer.player_results.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="card p-6 mb-6 max-w-2xl mx-auto"
                >
                  <h3 className="font-display text-lg font-semibold mb-4 text-center">Résultats</h3>
                  <div className="space-y-2">
                    {currentAnswer.player_results.map((result, index) => (
                      <div
                        key={index}
                        className={`flex items-center justify-between p-3 rounded-lg ${
                          result.is_correct ? 'bg-green-500/10' : 'bg-red-500/10'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {result.is_correct ? (
                            <CheckCircle className="w-5 h-5 text-green-400" />
                          ) : (
                            <XCircle className="w-5 h-5 text-red-400" />
                          )}
                          <span className="font-medium">{result.pseudo}</span>
                        </div>
                        <span className={`font-bold ${result.is_correct ? 'text-green-400' : 'text-red-400'}`}>
                          +{result.points_earned}
                        </span>
                      </div>
                    ))}
                  </div>
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

          {/* PODIUM animé (barres 3D, médailles, couronne, confettis séquentiels) */}
          {screen === 'podium' && (
            <motion.div
              key="podium"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onAnimationComplete={() => {
                setTimeout(fireConfetti, 800);
                setTimeout(fireWinnerConfetti, 1500);
              }}
              className="w-full max-w-4xl text-center"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, type: 'spring' }}
                className="mb-12"
              >
                <motion.div animate={{ rotate: [0, -10, 10, -10, 0] }} transition={{ duration: 0.5, delay: 0.5 }}>
                  <Trophy className="w-16 h-16 md:w-20 md:h-20 text-yellow-400 mx-auto mb-4" />
                </motion.div>
                <h1 className="font-display text-4xl md:text-6xl font-bold">
                  <span className="gradient-text">Podium Final</span>
                </h1>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                  className="h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent mx-auto mt-4 max-w-md"
                />
              </motion.div>

              {/* Podium : révélation séquentielle 3e -> 2e -> 1er */}
              <div className="flex justify-center items-end gap-4 md:gap-8 mb-12 px-4">
                {/* 2e place */}
                {podium[1] && (
                  <motion.div
                    initial={{ opacity: 0, y: 100 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.2, duration: 0.6, type: 'spring', bounce: 0.4 }}
                    className="flex flex-col items-center"
                  >
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.4, type: 'spring' }}>
                      <Medal className="w-10 h-10 md:w-12 md:h-12 text-gray-300 mb-2" />
                    </motion.div>
                    <motion.div
                      initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.3, type: 'spring' }}
                      className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gradient-to-br from-gray-400/30 to-gray-500/20 flex items-center justify-center mb-2 ring-4 ring-gray-400/50 shadow-lg shadow-gray-500/20"
                    >
                      <span className="text-2xl md:text-3xl font-bold text-gray-200">{podium[1].pseudo.charAt(0).toUpperCase()}</span>
                    </motion.div>
                    <p className="font-medium text-lg text-gray-200">{podium[1].pseudo}</p>
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} className="text-gray-300 font-bold text-xl">
                      {podium[1].score} pts
                    </motion.p>
                    <motion.div
                      initial={{ height: 0 }} animate={{ height: 100 }} transition={{ delay: 1.2, duration: 0.4 }}
                      className="w-24 md:w-28 bg-gradient-to-t from-gray-600/40 to-gray-400/20 rounded-t-lg mt-4 flex items-center justify-center"
                    >
                      <span className="text-4xl font-bold text-gray-400/50">2</span>
                    </motion.div>
                  </motion.div>
                )}

                {/* 1re place */}
                {podium[0] && (
                  <motion.div
                    initial={{ opacity: 0, y: 100 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 1.8, duration: 0.8, type: 'spring', bounce: 0.5 }}
                    className="flex flex-col items-center"
                  >
                    <motion.div initial={{ scale: 0, rotate: -180 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 2.0, type: 'spring', bounce: 0.6 }}>
                      <Crown className="w-12 h-12 md:w-16 md:h-16 text-yellow-400 mb-2" />
                    </motion.div>
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.9, type: 'spring', bounce: 0.5 }} className="relative">
                      <motion.div
                        animate={{ boxShadow: ['0 0 20px rgba(234, 179, 8, 0.3)', '0 0 40px rgba(234, 179, 8, 0.5)', '0 0 20px rgba(234, 179, 8, 0.3)'] }}
                        transition={{ duration: 1.5, repeat: Infinity }}
                        className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-gradient-to-br from-yellow-400/40 to-yellow-600/20 flex items-center justify-center ring-4 ring-yellow-400 shadow-2xl"
                      >
                        <span className="text-3xl md:text-4xl font-bold text-yellow-300">{podium[0].pseudo.charAt(0).toUpperCase()}</span>
                      </motion.div>
                      <motion.div animate={{ rotate: 360 }} transition={{ duration: 4, repeat: Infinity, ease: 'linear' }} className="absolute -top-2 -right-2">
                        <Sparkles className="w-6 h-6 text-yellow-400" />
                      </motion.div>
                    </motion.div>
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 2.1 }} className="font-bold text-xl md:text-2xl text-yellow-300 mt-2">
                      {podium[0].pseudo}
                    </motion.p>
                    <motion.p initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 2.2, type: 'spring' }} className="text-yellow-400 font-bold text-2xl md:text-3xl">
                      {podium[0].score} pts
                    </motion.p>
                    <motion.div
                      initial={{ height: 0 }} animate={{ height: 140 }} transition={{ delay: 1.8, duration: 0.5 }}
                      className="w-28 md:w-36 bg-gradient-to-t from-yellow-600/40 to-yellow-400/20 rounded-t-lg mt-4 flex items-center justify-center"
                    >
                      <span className="text-5xl font-bold text-yellow-400/50">1</span>
                    </motion.div>
                  </motion.div>
                )}

                {/* 3e place */}
                {podium[2] && (
                  <motion.div
                    initial={{ opacity: 0, y: 100 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6, duration: 0.6, type: 'spring', bounce: 0.4 }}
                    className="flex flex-col items-center"
                  >
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.8, type: 'spring' }}>
                      <Award className="w-8 h-8 md:w-10 md:h-10 text-orange-400 mb-2" />
                    </motion.div>
                    <motion.div
                      initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.7, type: 'spring' }}
                      className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-orange-400/30 to-orange-600/20 flex items-center justify-center mb-2 ring-4 ring-orange-500/50 shadow-lg shadow-orange-500/20"
                    >
                      <span className="text-xl md:text-2xl font-bold text-orange-300">{podium[2].pseudo.charAt(0).toUpperCase()}</span>
                    </motion.div>
                    <p className="font-medium text-orange-200">{podium[2].pseudo}</p>
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }} className="text-orange-400 font-bold text-lg">
                      {podium[2].score} pts
                    </motion.p>
                    <motion.div
                      initial={{ height: 0 }} animate={{ height: 70 }} transition={{ delay: 0.6, duration: 0.4 }}
                      className="w-20 md:w-24 bg-gradient-to-t from-orange-600/40 to-orange-400/20 rounded-t-lg mt-4 flex items-center justify-center"
                    >
                      <span className="text-3xl font-bold text-orange-400/50">3</span>
                    </motion.div>
                  </motion.div>
                )}
              </div>

              {/* Classement complet (au-delà du top 3) */}
              {podium.length > 3 && (
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 2.5 }}
                  className="card p-6 mb-8 max-w-2xl mx-auto"
                >
                  <h3 className="font-display text-lg font-semibold mb-4">Classement complet</h3>
                  <div className="space-y-2">
                    {podium.slice(3).map((player, index) => (
                      <motion.div
                        key={player.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 2.6 + index * 0.1 }}
                        className="flex items-center justify-between p-3 bg-dark-700 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-dark-600 flex items-center justify-center font-bold">
                            {player.rank}
                          </span>
                          <span>{player.pseudo}</span>
                        </div>
                        <span className="font-bold text-dark-300">{player.score} pts</span>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              <button onClick={() => navigate('/')} className="btn-secondary mt-4 inline-flex items-center gap-2">
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
