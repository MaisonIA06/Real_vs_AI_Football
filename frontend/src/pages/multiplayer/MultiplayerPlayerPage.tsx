import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  Clock,
  Trophy,
  Loader2,
  Crown,
  Medal,
  Award,
  WifiOff,
} from 'lucide-react';
import { useMultiplayerSocket, QuestionData, AnswerData, PodiumPlayer, AnswerResult } from '../../hooks/useMultiplayerSocket';
import { useLiveSession, useSessionRedirect } from '../../hooks/useLiveSession';
import LogoMIA from '../../components/LogoMIA';

type PlayerScreen = 'joining' | 'waiting' | 'question' | 'answered' | 'result' | 'podium';

export default function MultiplayerPlayerPage() {
  const { roomCode } = useParams<{ roomCode: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  
  // Get pseudo from location state or restored session
  const locationPseudo = (location.state as { pseudo?: string; restored?: boolean })?.pseudo || '';
  const isRestored = (location.state as { restored?: boolean })?.restored || false;
  
  // Normalize room code to uppercase
  const normalizedRoomCode = roomCode?.toUpperCase() || '';

  // Session persistence hook
  const {
    session,
    isLoading: sessionLoading,
    hasActiveSession,
    saveSession,
    updateSession,
    endSession,
    clearSession,
  } = useLiveSession({
    blockNavigation: true,
    allowedPaths: ['/multiplayer/play', '/multiplayer/join'],
  });

  // Determine pseudo: use session if restored, otherwise use location state
  const pseudo = session?.pseudo || locationPseudo;

  const [screen, setScreen] = useState<PlayerScreen>('joining');
  const [hasAnswered, setHasAnswered] = useState(false);
  const [lastResult, setLastResult] = useState<AnswerResult | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [timerActive, setTimerActive] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Redirect if no pseudo and no session
  useEffect(() => {
    if (sessionLoading) return;
    
    if (!pseudo && !hasActiveSession) {
      navigate(`/multiplayer/join/${normalizedRoomCode}`);
    }
  }, [pseudo, hasActiveSession, normalizedRoomCode, navigate, sessionLoading]);

  // Callbacks
  const handlePlayerJoined = useCallback((playerId: number, playerPseudo: string, sessionToken?: string) => {
    setScreen('waiting');
    setError(null);
    setIsReconnecting(false);

    // Save session for reconnection. Le token n'est renvoyé que lors du premier join
    // (création du joueur côté serveur). Sur une reconnexion, on conserve le token
    // précédemment stocké.
    if (pseudo && normalizedRoomCode) {
      if (sessionToken) {
        saveSession({
          roomCode: normalizedRoomCode,
          pseudo: pseudo,
          sessionToken,
          playerId: playerId,
        });
      } else if (session) {
        updateSession({ playerId });
      }
    }
  }, [pseudo, normalizedRoomCode, saveSession, session, updateSession]);

  const handleGameStarted = useCallback((question: QuestionData) => {
    console.log('[Player] handleGameStarted called, question:', question);
    setScreen('question');
    setHasAnswered(false);
    setLastResult(null);
    setTimeLeft(30);
    setTimerActive(true);
    startTimeRef.current = Date.now();
    console.log('[Player] Screen set to question, timer started');
  }, []);

  const handleNewQuestion = useCallback((question: QuestionData) => {
    setScreen('question');
    setHasAnswered(false);
    setLastResult(null);
    setTimeLeft(30);
    setTimerActive(true);
    startTimeRef.current = Date.now();
  }, []);

  const handleAnswerRevealed = useCallback((answer: AnswerData) => {
    setScreen('result');
    setTimerActive(false);
  }, []);

  const handleGameFinished = useCallback((podium: PodiumPlayer[]) => {
    setScreen('podium');
    setTimerActive(false);
    // Mark session as inactive when game finishes
    endSession();
  }, [endSession]);

  const handleAnswerSubmitted = useCallback((result: AnswerResult) => {
    setLastResult(result);
    setHasAnswered(true);
    setScreen('answered');
    setTimerActive(false);
  }, []);

  const handleError = useCallback((message: string) => {
    setError(message);
  }, []);

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
  } = useMultiplayerSocket({
    roomCode: normalizedRoomCode,
    isHost: false,
    initialSessionToken: session?.sessionToken || undefined,
    onPlayerJoined: handlePlayerJoined,
    onGameStarted: handleGameStarted,
    onNewQuestion: handleNewQuestion,
    onAnswerRevealed: handleAnswerRevealed,
    onGameFinished: handleGameFinished,
    onAnswerSubmitted: handleAnswerSubmitted,
    onError: handleError,
  });

  // Handle reconnection state
  useEffect(() => {
    if (!isConnected && hasActiveSession && screen !== 'joining') {
      setIsReconnecting(true);
    } else if (isConnected && isReconnecting) {
      setIsReconnecting(false);
    }
  }, [isConnected, hasActiveSession, screen, isReconnecting]);

  // Join when connected (and have pseudo)
  useEffect(() => {
    if (isConnected && pseudo && (screen === 'joining' || isRestored)) {
      console.log('[Player] Auto-joining with pseudo:', pseudo);
      joinAsPlayer(pseudo);
    }
  }, [isConnected, pseudo, screen, isRestored, joinAsPlayer]);

  // Sync screen state with gameState from hook (fallback synchronization)
  useEffect(() => {
    console.log('[Player] gameState changed:', gameState, 'current screen:', screen, 'currentQuestion:', currentQuestion ? 'yes' : 'no');
    
    if (gameState === 'playing' && (screen === 'waiting' || screen === 'joining') && currentQuestion) {
      console.log('[Player] Syncing screen to question from gameState');
      setScreen('question');
      setHasAnswered(false);
      setLastResult(null);
      setTimeLeft(30);
      setTimerActive(true);
      startTimeRef.current = Date.now();
    } else if (gameState === 'showing_answer' && screen !== 'result' && screen !== 'podium') {
      setScreen('result');
      setTimerActive(false);
    } else if (gameState === 'finished' && screen !== 'podium') {
      setScreen('podium');
      setTimerActive(false);
    }
  }, [gameState, screen, currentQuestion]);

  // Timer countdown
  useEffect(() => {
    if (!timerActive || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [timerActive, timeLeft]);

  const handleAnswer = (choice: 'left' | 'right' | 'real' | 'ai') => {
    console.log('[Player] handleAnswer called, choice:', choice, 'hasAnswered:', hasAnswered);
    
    if (hasAnswered) {
      console.log('[Player] Already answered, ignoring');
      return;
    }

    const responseTime = Date.now() - startTimeRef.current;
    console.log('[Player] Submitting answer, responseTime:', responseTime);
    submitAnswer(choice, responseTime);
  };

  // Find player rank in podium
  const playerRank = podium.find(p => p.id === playerId)?.rank;

  // Loading state
  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-900">
        <Loader2 className="w-12 h-12 text-primary-400 animate-spin" />
      </div>
    );
  }

  if (!normalizedRoomCode || !pseudo) {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-dark-900">
      <LogoMIA size="small" />

      {/* Reconnection Overlay */}
      <AnimatePresence>
        {isReconnecting && (
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

      {/* Header - Always visible on mobile */}
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

          <div className="flex items-center gap-3">
            {(screen === 'question' || screen === 'answered') && (
              <div className={`flex items-center gap-1 px-3 py-1 rounded-full ${
                timeLeft <= 10 ? 'bg-red-500/20 text-red-400' : 'bg-dark-800'
              }`}>
                <Clock className="w-4 h-4" />
                <span className="font-bold">{timeLeft}s</span>
              </div>
            )}

            <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-primary-500/20">
              <Trophy className="w-4 h-4 text-primary-400" />
              <span className="font-bold text-primary-400">{playerScore}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <AnimatePresence mode="wait">
          {/* Joining Screen */}
          {screen === 'joining' && (
            <motion.div
              key="joining"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center"
            >
              <Loader2 className="w-12 h-12 text-primary-400 animate-spin mx-auto mb-4" />
              <p className="text-dark-400">Connexion à la partie...</p>
              {error && (
                <p className="text-red-400 mt-4">{error}</p>
              )}
            </motion.div>
          )}

          {/* Waiting Screen */}
          {screen === 'waiting' && (
            <motion.div
              key="waiting"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="text-center"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="w-24 h-24 rounded-full bg-primary-500/20 flex items-center justify-center mx-auto mb-6"
              >
                <CheckCircle className="w-12 h-12 text-primary-400" />
              </motion.div>
              <h2 className="font-display text-2xl font-bold mb-2">
                Vous êtes connecté !
              </h2>
              <p className="text-dark-400 mb-4">
                En attente que l'hôte lance la partie...
              </p>
              <div className="inline-block px-4 py-2 bg-dark-800 rounded-lg">
                <span className="text-dark-400">Room : </span>
                <span className="font-mono font-bold gradient-text">{normalizedRoomCode}</span>
              </div>
              
              {/* Session indicator */}
              {hasActiveSession && (
                <p className="mt-4 text-xs text-dark-500">
                  Session sauvegardée - Vous serez reconnecté automatiquement
                </p>
              )}
            </motion.div>
          )}

          {/* Question Screen */}
          {screen === 'question' && currentQuestion && (
            <motion.div
              key="question"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-lg"
            >
              {/* Progress */}
              <div className="text-center mb-6">
                <span className="text-dark-400">Question </span>
                <span className="font-bold gradient-text">{currentQuestion.question_number}</span>
                <span className="text-dark-400"> / {currentQuestion.total_questions}</span>
              </div>

              {/* Question */}
              <h2 className="text-xl md:text-2xl font-display font-bold text-center mb-8">
                {currentQuestion.media_type === 'audio' ? (
                  <>Est-ce <span className="gradient-text">réel</span> ou <span className="gradient-text">IA</span> ?</>
                ) : (
                  <>Laquelle est <span className="gradient-text">IA</span> ?</>
                )}
              </h2>

              {/* Answer Buttons */}
              {currentQuestion.media_type === 'audio' ? (
                <div className="grid grid-cols-2 gap-4">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleAnswer('real')}
                    disabled={hasAnswered}
                    className="aspect-square rounded-2xl bg-gradient-to-br from-green-500/20 to-green-600/20 border-2 border-green-500/50 flex flex-col items-center justify-center gap-2 text-green-400 font-bold text-xl disabled:opacity-50 active:from-green-500/30 active:to-green-600/30"
                  >
                    <span className="text-4xl">🎵</span>
                    RÉEL
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleAnswer('ai')}
                    disabled={hasAnswered}
                    className="aspect-square rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-600/20 border-2 border-purple-500/50 flex flex-col items-center justify-center gap-2 text-purple-400 font-bold text-xl disabled:opacity-50 active:from-purple-500/30 active:to-purple-600/30"
                  >
                    <span className="text-4xl">🤖</span>
                    IA
                  </motion.button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleAnswer('left')}
                    disabled={hasAnswered}
                    className="aspect-square rounded-2xl bg-gradient-to-br from-primary-500/20 to-primary-600/20 border-2 border-primary-500/50 flex flex-col items-center justify-center gap-2 text-primary-400 font-bold text-4xl disabled:opacity-50 active:from-primary-500/30 active:to-primary-600/30"
                  >
                    A
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleAnswer('right')}
                    disabled={hasAnswered}
                    className="aspect-square rounded-2xl bg-gradient-to-br from-accent-500/20 to-accent-600/20 border-2 border-accent-500/50 flex flex-col items-center justify-center gap-2 text-accent-400 font-bold text-4xl disabled:opacity-50 active:from-accent-500/30 active:to-accent-600/30"
                  >
                    B
                  </motion.button>
                </div>
              )}

              {/* Category */}
              <div className="mt-6 text-center">
                <span className="px-3 py-1 rounded-full bg-dark-800 text-dark-400 text-sm">
                  {currentQuestion.category}
                </span>
              </div>
            </motion.div>
          )}

          {/* Answered Screen - "Attente du résultat..." */}
          {screen === 'answered' && (
            <motion.div
              key="answered"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="text-center"
            >
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
                    className={`text-4xl font-bold mb-4 ${
                      lastResult.is_correct ? 'text-green-400' : 'text-red-400'
                    }`}
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

          {/* Result Screen */}
          {screen === 'result' && currentAnswer && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center w-full max-w-lg"
            >
              <h2 className="font-display text-2xl font-bold mb-6">
                La bonne réponse était{' '}
                <span className="gradient-text">
                  {currentQuestion?.media_type === 'audio'
                    ? currentAnswer.ai_position === 'ai' ? 'IA' : 'Réel'
                    : currentAnswer.ai_position === 'left' ? 'A' : 'B'}
                </span>
              </h2>

              {currentAnswer.hint && (
                <div className="card p-4 mb-6">
                  <p className="text-dark-300 italic">{currentAnswer.hint}</p>
                </div>
              )}

              <motion.p 
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="text-dark-400"
              >
                En attente de la prochaine question...
              </motion.p>
            </motion.div>
          )}

          {/* Podium Screen */}
          {screen === 'podium' && (
            <motion.div
              key="podium"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center w-full max-w-lg"
            >
              <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-4" />
              <h1 className="font-display text-3xl font-bold mb-2">
                Partie terminée !
              </h1>

              {/* Player's Result */}
              <motion.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="card p-6 mb-8"
              >
                <div className="flex items-center justify-center gap-4 mb-4">
                  {playerRank === 1 && <Crown className="w-10 h-10 text-yellow-400" />}
                  {playerRank === 2 && <Medal className="w-10 h-10 text-gray-400" />}
                  {playerRank === 3 && <Award className="w-10 h-10 text-orange-400" />}
                  {playerRank && playerRank > 3 && (
                    <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center font-bold text-xl">
                      {playerRank}
                    </div>
                  )}
                </div>

                <p className="text-dark-400 mb-2">Votre classement</p>
                <p className="text-4xl font-bold gradient-text mb-2">
                  #{playerRank}
                </p>
                <p className="text-2xl font-bold text-primary-400">
                  {playerScore} points
                </p>
              </motion.div>

              {/* Top 5 */}
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
                        <span className="w-5 h-5 flex items-center justify-center text-dark-400">
                          {player.rank}
                        </span>
                      )}
                      <span className={player.id === playerId ? 'font-bold' : ''}>
                        {player.pseudo}
                      </span>
                    </div>
                    <span className="font-bold">{player.score}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto bg-red-500/90 text-white px-4 py-3 rounded-lg shadow-lg"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
