import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, XCircle, Trophy, Loader2, Crown, Medal, Award, WifiOff } from 'lucide-react';
import {
  useQuizSocket,
  QuizAnswerData,
  QuizPodiumPlayer,
  QuizAnswerResult,
} from '../../hooks/useQuizSocket';
import LogoMIA from '../../components/LogoMIA';

type PlayerScreen = 'joining' | 'waiting' | 'question' | 'answered' | 'result' | 'podium';

const LETTERS = ['A', 'B', 'C', 'D'];

interface StoredSession {
  pseudo: string;
  sessionToken?: string;
}

const sessionKeyFor = (code: string) => `realvsai_quiz_${code}`;

function loadSession(code: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(sessionKeyFor(code));
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export default function QuizPlayerPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const normalizedRoomCode = roomCode?.toUpperCase() || '';
  const stored = loadSession(normalizedRoomCode);
  const locationPseudo = (location.state as { pseudo?: string })?.pseudo || '';
  const pseudo = locationPseudo || stored?.pseudo || '';

  const [screen, setScreen] = useState<PlayerScreen>('joining');
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<QuizAnswerResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const startTimeRef = useRef<number>(Date.now());

  // Pas de pseudo ni de session → renvoyer vers la page de saisie.
  useEffect(() => {
    if (!pseudo) navigate(`/quiz/join/${normalizedRoomCode}`);
  }, [pseudo, normalizedRoomCode, navigate]);

  const persistSession = useCallback((sessionToken?: string) => {
    if (!pseudo) return;
    const existing = loadSession(normalizedRoomCode);
    const data: StoredSession = {
      pseudo,
      sessionToken: sessionToken || existing?.sessionToken,
    };
    try {
      localStorage.setItem(sessionKeyFor(normalizedRoomCode), JSON.stringify(data));
    } catch {
      /* quota / mode privé : on continue sans persistance */
    }
  }, [pseudo, normalizedRoomCode]);

  const handlePlayerJoined = useCallback((_id: number, _pseudo: string, sessionToken?: string) => {
    setScreen((s) => (s === 'joining' || s === 'waiting' ? 'waiting' : s));
    setError(null);
    setIsReconnecting(false);
    persistSession(sessionToken);
  }, [persistSession]);

  const startQuestion = useCallback(() => {
    setScreen('question');
    setSelectedIndex(null);
    setLastResult(null);
    startTimeRef.current = Date.now();
  }, []);

  const handleAnswerRevealed = useCallback((_answer: QuizAnswerData) => {
    setScreen('result');
  }, []);

  const handleGameFinished = useCallback((_podium: QuizPodiumPlayer[]) => {
    setScreen('podium');
    try {
      localStorage.removeItem(sessionKeyFor(normalizedRoomCode));
    } catch { /* ignore */ }
  }, [normalizedRoomCode]);

  const handleAnswerSubmitted = useCallback((result: QuizAnswerResult) => {
    setLastResult(result);
    setScreen('answered');
  }, []);

  const handleError = useCallback((message: string) => setError(message), []);

  const {
    isConnected,
    gameState,
    currentQuestion,
    currentAnswer,
    podium,
    playerId,
    playerScore,
    joinAsPlayer,
    submitAnswer,
  } = useQuizSocket({
    roomCode: normalizedRoomCode,
    isHost: false,
    initialSessionToken: stored?.sessionToken,
    onPlayerJoined: handlePlayerJoined,
    onGameStarted: startQuestion,
    onNewQuestion: startQuestion,
    onAnswerRevealed: handleAnswerRevealed,
    onGameFinished: handleGameFinished,
    onAnswerSubmitted: handleAnswerSubmitted,
    onError: handleError,
  });

  // Rejoindre dès la connexion établie.
  useEffect(() => {
    if (isConnected && pseudo && screen === 'joining') {
      joinAsPlayer(pseudo);
    }
  }, [isConnected, pseudo, screen, joinAsPlayer]);

  // Synchronise l'écran avec l'état serveur (robustesse reconnexion en cours de partie).
  useEffect(() => {
    if (gameState === 'playing' && (screen === 'waiting' || screen === 'joining') && currentQuestion) {
      setScreen('question');
      setSelectedIndex(null);
      setLastResult(null);
      startTimeRef.current = Date.now();
    } else if (gameState === 'showing_answer' && screen !== 'result' && screen !== 'podium') {
      setScreen('result');
    } else if (gameState === 'finished' && screen !== 'podium') {
      setScreen('podium');
    }
  }, [gameState, screen, currentQuestion]);

  // Indicateur de reconnexion (tant que le hook n'a pas abandonné).
  useEffect(() => {
    if (!isConnected && gameState !== 'error' && screen !== 'joining' && screen !== 'podium') {
      setIsReconnecting(true);
    } else if (isConnected && isReconnecting) {
      setIsReconnecting(false);
    }
  }, [isConnected, gameState, screen, isReconnecting]);

  const connectionFailed = gameState === 'error' && screen !== 'podium';

  const handleSelect = (index: number) => {
    if (selectedIndex !== null) return;
    setSelectedIndex(index);
    const elapsed = Date.now() - startTimeRef.current;
    submitAnswer(index, elapsed);
  };

  const isTrueFalse = currentQuestion?.question_type === 'truefalse';
  const playerRank = podium.find((p) => p.id === playerId)?.rank;

  if (!normalizedRoomCode || !pseudo) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-dark-900">
      <LogoMIA size="small" />

      {/* Overlay de reconnexion (plein écran), tant que le hook n'a pas abandonné */}
      <AnimatePresence>
        {isReconnecting && !connectionFailed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-dark-900/95 flex flex-col items-center justify-center"
          >
            <WifiOff className="w-16 h-16 text-yellow-400 mb-4" />
            <h2 className="font-display text-2xl font-bold mb-2">Reconnexion...</h2>
            <p className="text-dark-400">Veuillez patienter</p>
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin mt-4" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header sticky : avatar + pseudo + score (sans chrono) */}
      <div className="sticky top-0 z-10 bg-dark-900/95 backdrop-blur-sm border-b border-dark-800 px-4 py-3">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary-500/30 flex items-center justify-center">
              {pseudo.charAt(0).toUpperCase()}
            </div>
            <span className="font-medium">{pseudo}</span>
            {!isConnected && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Déconnecté" />
            )}
          </div>
          <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-primary-500/20">
            <Trophy className="w-4 h-4 text-primary-400" />
            <span className="font-bold text-primary-400">{playerScore}</span>
          </div>
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        {connectionFailed ? (
          <div className="text-center">
            <WifiOff className="w-14 h-14 text-red-400 mx-auto mb-4" />
            <h2 className="text-2xl font-display font-bold mb-2">Connexion perdue</h2>
            <p className="text-dark-400 mb-6">Impossible de rejoindre la partie.</p>
            <button onClick={() => window.location.reload()} className="btn-primary">Réessayer</button>
          </div>
        ) : (
        <AnimatePresence mode="wait">
          {/* Connexion en cours */}
          {screen === 'joining' && (
            <motion.div key="joining" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-center">
              <Loader2 className="w-12 h-12 text-primary-400 animate-spin mx-auto mb-4" />
              <p className="text-dark-400">Connexion à la partie...</p>
              {error && <p className="text-red-400 mt-4">{error}</p>}
            </motion.div>
          )}

          {/* Salle d'attente : "Vous êtes connecté !" */}
          {screen === 'waiting' && (
            <motion.div key="waiting" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="text-center">
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="w-24 h-24 rounded-full bg-primary-500/20 flex items-center justify-center mx-auto mb-6"
              >
                <CheckCircle className="w-12 h-12 text-primary-400" />
              </motion.div>
              <h2 className="font-display text-2xl font-bold mb-2">Vous êtes connecté !</h2>
              <p className="text-dark-400 mb-4">En attente que l'animateur lance le quiz ⚽</p>
              <div className="inline-block px-4 py-2 bg-dark-800 rounded-lg">
                <span className="text-dark-400">Partie : </span>
                <span className="font-mono font-bold gradient-text">{normalizedRoomCode}</span>
              </div>
            </motion.div>
          )}

          {/* Question : choix de réponse */}
          {screen === 'question' && currentQuestion && (
            <motion.div key="question" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-lg">
              <div className="text-center mb-6">
                <span className="text-dark-400">Question </span>
                <span className="font-bold gradient-text">{currentQuestion.question_number}</span>
                <span className="text-dark-400"> / {currentQuestion.total_questions}</span>
              </div>
              <h2 className="text-center text-xl font-semibold mb-8">{currentQuestion.question_text}</h2>
              <div className="grid grid-cols-1 gap-3">
                {currentQuestion.choices.map((choice, index) => (
                  <motion.button
                    key={index}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleSelect(index)}
                    disabled={selectedIndex !== null}
                    className={`flex items-center gap-3 w-full px-5 py-4 rounded-2xl border-2 text-left text-lg font-medium transition-all disabled:opacity-60 ${
                      selectedIndex === index
                        ? 'border-primary-500 bg-primary-500/20'
                        : 'border-dark-700 bg-dark-800 [@media(hover:hover)]:hover:border-primary-500/60 active:border-primary-500/60'
                    }`}
                  >
                    {!isTrueFalse && (
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center font-bold">
                        {LETTERS[index]}
                      </span>
                    )}
                    <span>{choice}</span>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Réponse envoyée : feedback immédiat (+points) puis attente */}
          {screen === 'answered' && (
            <motion.div key="answered" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }}
              className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', damping: 10, stiffness: 200 }}
                className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 ${
                  lastResult?.is_correct ? 'bg-green-500/20' : 'bg-red-500/20'
                }`}
              >
                {lastResult?.is_correct ? (
                  <CheckCircle className="w-12 h-12 text-green-400" />
                ) : (
                  <XCircle className="w-12 h-12 text-red-400" />
                )}
              </motion.div>

              {lastResult && (
                <>
                  <h2 className="font-display text-2xl font-bold mb-2">
                    {lastResult.is_correct ? 'Bonne réponse !' : 'Mauvaise réponse'}
                  </h2>
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className={`text-4xl font-bold mb-4 ${lastResult.is_correct ? 'text-green-400' : 'text-red-400'}`}
                  >
                    +{lastResult.points_earned}
                  </motion.div>
                </>
              )}

              <motion.p
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="text-dark-400 text-lg"
              >
                Attente du résultat...
              </motion.p>
            </motion.div>
          )}

          {/* Révélation : bonne réponse + anecdote (currentAnswer peut être null
              si reconnexion pile pendant la révélation → état neutre) */}
          {screen === 'result' && (
            <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-lg text-center">
              {!currentAnswer ? (
                <>
                  <Loader2 className="w-10 h-10 animate-spin text-primary-400 mx-auto mb-4" />
                  <p className="text-dark-400">Révélation en cours…</p>
                </>
              ) : (
                <>
                  <h2 className="font-display text-2xl font-bold mb-4">
                    Bonne réponse :{' '}
                    <span className="gradient-text">{currentAnswer.correct_choice}</span>
                  </h2>
                  {currentAnswer.anecdote && (
                    <div className="card p-4 mb-6 text-left text-dark-300">
                      💡 {currentAnswer.anecdote}
                    </div>
                  )}
                  <motion.p
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="text-dark-400"
                  >
                    En attente de la prochaine question...
                  </motion.p>
                </>
              )}
            </motion.div>
          )}

          {/* Podium final : classement perso + top 5 */}
          {screen === 'podium' && (
            <motion.div key="podium" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-lg text-center">
              <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
              <h1 className="font-display text-3xl font-bold mb-2">Partie terminée !</h1>

              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} className="card p-6 mb-8">
                {/* Le rang n'est affiché que s'il est connu (évite "#undefined"
                    si on se reconnecte dans une partie déjà terminée, podium vide). */}
                {playerRank ? (
                  <>
                    <div className="flex items-center justify-center gap-4 mb-4">
                      {playerRank === 1 && <Crown className="w-10 h-10 text-yellow-400" />}
                      {playerRank === 2 && <Medal className="w-10 h-10 text-gray-400" />}
                      {playerRank === 3 && <Award className="w-10 h-10 text-orange-400" />}
                      {playerRank > 3 && (
                        <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center font-bold text-xl">
                          {playerRank}
                        </div>
                      )}
                    </div>
                    <p className="text-dark-400 mb-2">Votre classement</p>
                    <p className="text-4xl font-bold gradient-text mb-2">#{playerRank}</p>
                  </>
                ) : null}
                <p className="text-2xl font-bold text-primary-400">{playerScore} points</p>
              </motion.div>

              <div className="space-y-2 mb-8">
                {podium.slice(0, 5).map((player) => (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      player.id === playerId
                        ? 'bg-primary-500/20 border border-primary-500/50'
                        : 'bg-dark-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {player.rank === 1 && <Crown className="w-5 h-5 text-yellow-400" />}
                      {player.rank === 2 && <Medal className="w-5 h-5 text-gray-400" />}
                      {player.rank === 3 && <Award className="w-5 h-5 text-orange-400" />}
                      {player.rank > 3 && (
                        <span className="w-5 h-5 flex items-center justify-center text-dark-400">{player.rank}</span>
                      )}
                      <span className={player.id === playerId ? 'font-bold' : ''}>{player.pseudo}</span>
                    </div>
                    <span className="font-bold">{player.score}</span>
                  </div>
                ))}
              </div>

              <button onClick={() => navigate('/')} className="btn-primary">Retour à l'accueil</button>
            </motion.div>
          )}
        </AnimatePresence>
        )}
      </div>

      {/* Toast d'erreur (bas d'écran) */}
      <AnimatePresence>
        {error && screen !== 'joining' && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto bg-red-500/90 text-white px-4 py-3 rounded-lg shadow-lg text-center"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
