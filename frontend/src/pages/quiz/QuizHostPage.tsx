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
    onGameFinished: handleGameFinished,
  });

  const isTrueFalse = currentQuestion?.question_type === 'truefalse';
  const answeredCount = answeredPlayers.size;

  return (
    <div className="min-h-screen flex flex-col px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <LogoMIA size="small" />
        {roomCode && (
          <div className="text-right">
            <p className="text-xs text-dark-400">Code de la partie</p>
            <p className="text-2xl font-mono font-bold tracking-widest gradient-text">{roomCode}</p>
          </div>
        )}
      </div>

      <div className="flex-1 flex flex-col items-center justify-center w-full max-w-5xl mx-auto">
        <AnimatePresence mode="wait">
          {/* LOBBY : QR + liste des joueurs */}
          {screen === 'lobby' && (
            <motion.div key="lobby" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="w-full grid md:grid-cols-2 gap-8 items-center">
              <div className="text-center">
                <h1 className="font-display text-4xl font-bold mb-2"><span className="gradient-text">Quiz Foot ⚽</span></h1>
                <p className="text-dark-400 mb-6">Scannez le QR code pour rejoindre</p>
                {joinUrl && (
                  <div className="inline-block bg-white p-4 rounded-2xl">
                    <QRCodeSVG value={joinUrl} size={240} />
                  </div>
                )}
                <p className="text-dark-500 text-sm mt-4">{questionCount} questions</p>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Users className="w-6 h-6 text-primary-400" />
                  <h2 className="text-xl font-semibold">{players.length} joueur{players.length > 1 ? 's' : ''}</h2>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-6 min-h-[3rem]">
                  {players.map((p) => (
                    <motion.div key={p.id} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                      className="px-3 py-2 bg-dark-800 rounded-lg text-center truncate">{p.pseudo}</motion.div>
                  ))}
                  {players.length === 0 && <p className="text-dark-500 col-span-2">En attente de joueurs…</p>}
                </div>
                <button onClick={startGame} disabled={players.length === 0}
                  className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  <Play className="w-5 h-5" /> Démarrer le quiz
                </button>
              </div>
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
    </div>
  );
}
