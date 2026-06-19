import { useEffect, useRef, useState, useCallback } from 'react';

// L'image de question peut être renvoyée en URL relative (/media/quiz/..) ;
// on la rend absolue contre l'origine courante par sécurité.
const makeAbsoluteUrl = (url: string | undefined | null): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  const path = url.startsWith('/') ? url : `/${url}`;
  return `${window.location.protocol}//${window.location.host}${path}`;
};

export interface QuizPlayer {
  id: number;
  pseudo: string;
  score: number;
}

export interface QuizQuestionData {
  question_id: number;
  question_number: number;
  total_questions: number;
  question_text: string;
  image?: string;
  question_type: 'mcq' | 'truefalse';
  choices: string[];
  // Jamais envoyé pendant la question : correct_index/anecdote sont absents ici.
}

export interface QuizAnswerData {
  question_id: number;
  correct_index: number;
  correct_choice: string;
  anecdote: string;
  player_results: {
    pseudo: string;
    is_correct: boolean;
    points_earned: number;
    response_time_ms: number;
  }[];
}

export interface QuizPodiumPlayer {
  rank: number;
  id: number;
  pseudo: string;
  score: number;
}

export interface QuizAnswerResult {
  is_correct: boolean;
  points_earned: number;
  total_score: number;
}

type GameState = 'connecting' | 'waiting' | 'playing' | 'showing_answer' | 'finished' | 'error';

interface UseQuizSocketOptions {
  roomCode: string;
  isHost?: boolean;
  hostToken?: string;
  initialSessionToken?: string;
  onPlayersUpdated?: (players: QuizPlayer[]) => void;
  onGameStarted?: (question: QuizQuestionData) => void;
  onNewQuestion?: (question: QuizQuestionData) => void;
  onAnswerRevealed?: (answer: QuizAnswerData) => void;
  onPlayerAnswered?: (playerId: number, pseudo: string) => void;
  onAllAnswered?: () => void;
  onGameFinished?: (podium: QuizPodiumPlayer[]) => void;
  onError?: (message: string) => void;
  onAnswerSubmitted?: (result: QuizAnswerResult) => void;
  onPlayerJoined?: (playerId: number, pseudo: string, sessionToken?: string) => void;
}

export function useQuizSocket({
  roomCode,
  isHost = false,
  hostToken,
  initialSessionToken,
  onPlayersUpdated,
  onGameStarted,
  onNewQuestion,
  onAnswerRevealed,
  onPlayerAnswered,
  onAllAnswered,
  onGameFinished,
  onError,
  onAnswerSubmitted,
  onPlayerJoined,
}: UseQuizSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState>('connecting');
  const gameStateRef = useRef<GameState>('connecting');
  const [players, setPlayers] = useState<QuizPlayer[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<QuizQuestionData | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState<QuizAnswerData | null>(null);
  const [podium, setPodium] = useState<QuizPodiumPlayer[]>([]);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [playerScore, setPlayerScore] = useState(0);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;

  const storedPseudoRef = useRef<string | null>(null);
  const storedSessionTokenRef = useRef<string | null>(initialSessionToken ?? null);
  const hasJoinedRef = useRef(false);

  useEffect(() => {
    if (initialSessionToken && !storedSessionTokenRef.current) {
      storedSessionTokenRef.current = initialSessionToken;
    }
  }, [initialSessionToken]);

  const callbacksRef = useRef({
    onPlayersUpdated, onGameStarted, onNewQuestion, onAnswerRevealed,
    onPlayerAnswered, onAllAnswered, onGameFinished, onError,
    onAnswerSubmitted, onPlayerJoined,
  });

  useEffect(() => {
    gameStateRef.current = gameState;
    callbacksRef.current = {
      onPlayersUpdated, onGameStarted, onNewQuestion, onAnswerRevealed,
      onPlayerAnswered, onAllAnswered, onGameFinished, onError,
      onAnswerSubmitted, onPlayerJoined,
    };
  }, [gameState, onPlayersUpdated, onGameStarted, onNewQuestion, onAnswerRevealed, onPlayerAnswered, onAllAnswered, onGameFinished, onError, onAnswerSubmitted, onPlayerJoined]);

  const connect = useCallback(() => {
    if (!roomCode || roomCode.trim() === '') return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const normalizedRoomCode = roomCode.toUpperCase();
    const wsUrl = `${protocol}//${host}/ws/quiz/${normalizedRoomCode}/`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttempts.current = 0;

      if (isHost) {
        if (!hostToken) {
          setGameState('error');
          ws.close();
          return;
        }
        ws.send(JSON.stringify({ action: 'host.join', host_token: hostToken }));
        setGameState('waiting');
      } else if (storedPseudoRef.current && hasJoinedRef.current) {
        const payload: Record<string, unknown> = {
          action: 'player.join',
          pseudo: storedPseudoRef.current,
        };
        if (storedSessionTokenRef.current) {
          payload.session_token = storedSessionTokenRef.current;
        }
        ws.send(JSON.stringify(payload));
      } else {
        setGameState('waiting');
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (reconnectAttempts.current < maxReconnectAttempts && gameStateRef.current !== 'finished') {
        reconnectAttempts.current++;
        setTimeout(connect, 2000);
      } else {
        setGameState('error');
      }
    };

    ws.onerror = (error) => {
      console.error('Quiz WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const callbacks = callbacksRef.current;

        switch (data.type) {
          case 'host.joined':
            setPlayers(data.players || []);
            setGameState(data.status === 'playing' ? 'playing' : 'waiting');
            break;

          case 'player.joined':
            setPlayerId(data.player_id);
            if (data.session_token) {
              storedSessionTokenRef.current = data.session_token;
            }
            if (data.room_status === 'playing') setGameState('playing');
            else if (data.room_status === 'showing_answer') setGameState('showing_answer');
            else if (data.room_status === 'finished') setGameState('finished');
            else setGameState('waiting');
            callbacks.onPlayerJoined?.(data.player_id, data.pseudo, data.session_token);
            break;

          case 'players.updated':
            setPlayers(data.players || []);
            callbacks.onPlayersUpdated?.(data.players || []);
            break;

          case 'player.left':
            break;

          case 'game.started': {
            setGameState('playing');
            const q = { ...data.question, image: makeAbsoluteUrl(data.question?.image) };
            setCurrentQuestion(q);
            setCurrentAnswer(null);
            callbacks.onGameStarted?.(q);
            break;
          }

          case 'game.new_question': {
            setGameState('playing');
            const q = { ...data.question, image: makeAbsoluteUrl(data.question?.image) };
            setCurrentQuestion(q);
            setCurrentAnswer(null);
            callbacks.onNewQuestion?.(q);
            break;
          }

          case 'game.answer_revealed':
            setGameState('showing_answer');
            setCurrentAnswer(data.answer);
            callbacks.onAnswerRevealed?.(data.answer);
            break;

          case 'player.answered':
            callbacks.onPlayerAnswered?.(data.player_id, data.pseudo);
            break;

          case 'game.all_answered':
            callbacks.onAllAnswered?.();
            break;

          case 'game.finished':
            setGameState('finished');
            setPodium(data.podium || []);
            callbacks.onGameFinished?.(data.podium || []);
            break;

          case 'answer.submitted':
            setPlayerScore(data.total_score);
            callbacks.onAnswerSubmitted?.({
              is_correct: data.is_correct,
              points_earned: data.points_earned,
              total_score: data.total_score,
            });
            break;

          case 'error':
            callbacks.onError?.(data.message);
            break;
        }
      } catch (e) {
        console.error('Failed to parse quiz WebSocket message:', e);
      }
    };

    return () => ws.close();
  }, [roomCode, isHost]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      cleanup?.();
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  // Actions
  const joinAsPlayer = useCallback((pseudo: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      storedPseudoRef.current = pseudo;
      hasJoinedRef.current = true;
      const payload: Record<string, unknown> = { action: 'player.join', pseudo };
      if (storedSessionTokenRef.current) {
        payload.session_token = storedSessionTokenRef.current;
      }
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const startGame = useCallback(() => {
    wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ action: 'game.start' }));
  }, []);

  const nextQuestion = useCallback(() => {
    wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ action: 'game.next_question' }));
  }, []);

  const showAnswer = useCallback(() => {
    wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ action: 'game.show_answer' }));
  }, []);

  const submitAnswer = useCallback((selectedIndex: number, responseTimeMs: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'player.answer',
        selected_index: selectedIndex,
        response_time_ms: responseTimeMs,
      }));
    }
  }, []);

  const endGame = useCallback(() => {
    wsRef.current?.readyState === WebSocket.OPEN &&
      wsRef.current.send(JSON.stringify({ action: 'game.end' }));
  }, []);

  return {
    isConnected, gameState, players, currentQuestion, currentAnswer,
    podium, playerId, playerScore,
    joinAsPlayer, startGame, nextQuestion, showAnswer, submitAnswer, endGame,
  };
}
