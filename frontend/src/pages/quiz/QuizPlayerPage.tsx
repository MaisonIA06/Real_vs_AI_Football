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

  return (
    <div className="min-h-screen flex flex-col px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <LogoMIA size="small" />
        <div className="text-right">
          <p className="text-xs text-dark-400">{pseudo}</p>
          <p className="text-lg font-bold gradient-text">{playerScore} pts</p>
        </div>
      </div>

      {isReconnecting && !connectionFailed && (
        <div className="flex items-center gap-2 justify-center text-amber-400 text-sm mb-3">
          <WifiOff className="w-4 h-4" /> Reconnexion…
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full">
        {/* État terminal : la reconnexion a échoué (3 tentatives). */}
        {connectionFailed ? (
          <div className="text-center">
            <WifiOff className="w-14 h-14 text-red-400 mx-auto mb-4" />
            <h2 className="text-2xl font-display font-bold mb-2">Connexion perdue</h2>
            <p className="text-dark-400 mb-6">Impossible de rejoindre la partie.</p>
            <button onClick={() => window.location.reload()} className="btn-primary">Réessayer</button>
          </div>
        ) : (
        <AnimatePresence mode="wait">
          {/* Connexion / lobby */}
          {(screen === 'joining' || screen === 'waiting') && (
            <motion.div key="waiting" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary-400 mx-auto mb-4" />
              <h2 className="text-2xl font-display font-bold mb-2">
                {screen === 'joining' ? 'Connexion…' : 'En attente du début'}
              </h2>
              <p className="text-dark-400">L'animateur va lancer le quiz ⚽</p>
              {error && <p className="text-red-400 text-sm mt-4">{error}</p>}
            </motion.div>
          )}

          {/* Question : choix de réponse */}
          {screen === 'question' && currentQuestion && (
            <motion.div key="question" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="w-full">
              <p className="text-center text-dark-400 text-sm mb-1">
                Question {currentQuestion.question_number}/{currentQuestion.total_questions}
              </p>
              <h2 className="text-center text-xl font-semibold mb-6">{currentQuestion.question_text}</h2>
              <div className="grid grid-cols-1 gap-3">
                {currentQuestion.choices.map((choice, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelect(index)}
                    disabled={selectedIndex !== null}
                    className={`flex items-center gap-3 w-full px-5 py-4 rounded-2xl border-2 text-left text-lg font-medium transition-all active:scale-[0.98] disabled:opacity-60 ${
                      selectedIndex === index
                        ? 'border-primary-500 bg-primary-500/20'
                        : 'border-dark-700 bg-dark-800 hover:border-primary-500/60'
                    }`}
                  >
                    {!isTrueFalse && (
                      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center font-bold">
                        {LETTERS[index]}
                      </span>
                    )}
                    <span>{choice}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Réponse envoyée, en attente de la révélation */}
          {screen === 'answered' && (
            <motion.div key="answered" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="text-center">
              <CheckCircle className="w-14 h-14 text-primary-400 mx-auto mb-4" />
              <h2 className="text-2xl font-display font-bold mb-2">Réponse envoyée !</h2>
              <p className="text-dark-400">En attente des autres joueurs…</p>
            </motion.div>
          )}

          {/* Révélation de la bonne réponse. currentAnswer peut être null si on
              s'est reconnecté pile pendant la révélation (non rejouée au join) :
              on affiche alors un état neutre plutôt qu'un écran blanc. */}
          {screen === 'result' && (
            <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="w-full text-center">
              {!currentAnswer ? (
                <>
                  <Loader2 className="w-10 h-10 animate-spin text-primary-400 mx-auto mb-4" />
                  <p className="text-dark-400">Révélation en cours…</p>
                </>
              ) : (() => {
                // Source de vérité = confirmation serveur (lastResult), pas le clic
                // local : si la réponse n'a pas été enregistrée, ne pas afficher de
                // fausse victoire.
                const confirmed = lastResult !== null;
                const wasCorrect = lastResult?.is_correct === true;
                return (
                  <>
                    {confirmed ? (
                      wasCorrect ? (
                        <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-3" />
                      ) : (
                        <XCircle className="w-16 h-16 text-red-400 mx-auto mb-3" />
                      )
                    ) : (
                      <XCircle className="w-16 h-16 text-dark-500 mx-auto mb-3" />
                    )}
                    <h2 className="text-2xl font-display font-bold mb-1">
                      {confirmed ? (wasCorrect ? 'Bravo ! 🎉' : 'Raté !') : 'Pas de réponse'}
                    </h2>
                    {confirmed && wasCorrect && (
                      <p className="text-green-400 font-semibold mb-2">+{lastResult!.points_earned} pts</p>
                    )}
                    <p className="text-dark-300 mb-4">
                      Bonne réponse : <span className="font-semibold text-white">{currentAnswer.correct_choice}</span>
                    </p>
                    {currentAnswer.anecdote && (
                      <div className="card p-4 text-left text-sm text-dark-300">
                        💡 {currentAnswer.anecdote}
                      </div>
                    )}
                  </>
                );
              })()}
            </motion.div>
          )}

          {/* Podium final */}
          {screen === 'podium' && (
            <motion.div key="podium" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="w-full text-center">
              <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
              <h2 className="text-3xl font-display font-bold mb-1 gradient-text">Terminé !</h2>
              <p className="text-dark-300 mb-6">Score final : <span className="font-bold text-white">{playerScore} pts</span></p>
              <div className="space-y-2">
                {podium.slice(0, 5).map((p) => {
                  const isMe = p.id === playerId;
                  const icon = p.rank === 1 ? <Crown className="w-5 h-5 text-yellow-400" />
                    : p.rank === 2 ? <Medal className="w-5 h-5 text-gray-300" />
                    : p.rank === 3 ? <Award className="w-5 h-5 text-amber-600" />
                    : <span className="w-5 text-center text-dark-400">{p.rank}</span>;
                  return (
                    <div key={p.id}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl ${isMe ? 'bg-primary-500/20 border border-primary-500' : 'bg-dark-800'}`}>
                      <span className="flex items-center gap-3">{icon}<span className="font-medium">{p.pseudo}</span></span>
                      <span className="font-bold">{p.score} pts</span>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => navigate('/')} className="btn-primary mt-8">Retour à l'accueil</button>
            </motion.div>
          )}
        </AnimatePresence>
        )}
      </div>
    </div>
  );
}
