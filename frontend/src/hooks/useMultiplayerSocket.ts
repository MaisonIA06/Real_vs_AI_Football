import { useEffect, useRef, useState, useCallback } from 'react';

// Helper to convert relative URLs to absolute URLs
const makeAbsoluteUrl = (url: string | undefined | null): string | undefined => {
  if (!url) return undefined;
  
  // If already absolute, return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  
  // Build absolute URL from current location (host includes port)
  const protocol = window.location.protocol;
  const host = window.location.host;
  
  // Ensure URL starts with /
  const path = url.startsWith('/') ? url : `/${url}`;
  
  return `${protocol}//${host}${path}`;
};

// Transform question data to use absolute URLs
const transformQuestionUrls = (question: QuestionData | null): QuestionData | null => {
  if (!question) return null;
  
  return {
    ...question,
    left_media: makeAbsoluteUrl(question.left_media),
    right_media: makeAbsoluteUrl(question.right_media),
    audio_media: makeAbsoluteUrl(question.audio_media),
  };
};

export interface Player {
  id: number;
  pseudo: string;
  score: number;
}

export interface QuestionData {
  pair_id: number;
  question_number: number;
  total_questions: number;
  media_type: 'image' | 'video' | 'audio';
  category: string;
  difficulty: string;
  left_media?: string;
  right_media?: string;
  audio_media?: string;
}

export interface AnswerData {
  pair_id: number;
  ai_position: 'left' | 'right' | 'real' | 'ai';
  hint: string;
  player_results: {
    pseudo: string;
    is_correct: boolean;
    points_earned: number;
    response_time_ms: number;
  }[];
}

export interface PodiumPlayer {
  rank: number;
  id: number;
  pseudo: string;
  score: number;
}

export interface AnswerResult {
  is_correct: boolean;
  points_earned: number;
  total_score: number;
}

type GameState = 'connecting' | 'waiting' | 'playing' | 'showing_answer' | 'finished' | 'error';

interface UseMultiplayerSocketOptions {
  roomCode: string;
  isHost?: boolean;
  hostToken?: string;
  /** Token de session joueur (restauré depuis localStorage lors d'un refresh). */
  initialSessionToken?: string;
  onPlayersUpdated?: (players: Player[]) => void;
  onGameStarted?: (question: QuestionData) => void;
  onNewQuestion?: (question: QuestionData) => void;
  onAnswerRevealed?: (answer: AnswerData) => void;
  onPlayerAnswered?: (playerId: number, pseudo: string) => void;
  onAllAnswered?: () => void;
  onGameFinished?: (podium: PodiumPlayer[]) => void;
  onError?: (message: string) => void;
  onAnswerSubmitted?: (result: AnswerResult) => void;
  onPlayerJoined?: (playerId: number, pseudo: string, sessionToken?: string) => void;
}

export function useMultiplayerSocket({
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
}: UseMultiplayerSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [gameState, setGameState] = useState<GameState>('connecting');
  const gameStateRef = useRef<GameState>('connecting');
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState<AnswerData | null>(null);
  const [podium, setPodium] = useState<PodiumPlayer[]>([]);
  const [playerId, setPlayerId] = useState<number | null>(null);
  const [playerScore, setPlayerScore] = useState(0);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 3;
  
  // Store pseudo for reconnection
  const storedPseudoRef = useRef<string | null>(null);
  const storedSessionTokenRef = useRef<string | null>(initialSessionToken ?? null);
  const hasJoinedRef = useRef(false);

  // Keep token ref in sync if the initial value arrives later (async load from localStorage)
  useEffect(() => {
    if (initialSessionToken && !storedSessionTokenRef.current) {
      storedSessionTokenRef.current = initialSessionToken;
    }
  }, [initialSessionToken]);

  // Refs for callbacks to avoid reconnection on callback change
  const callbacksRef = useRef({
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
  });

  // Keep refs in sync
  useEffect(() => {
    gameStateRef.current = gameState;
    callbacksRef.current = {
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
    };
  }, [gameState, onPlayersUpdated, onGameStarted, onNewQuestion, onAnswerRevealed, onPlayerAnswered, onAllAnswered, onGameFinished, onError, onAnswerSubmitted, onPlayerJoined]);

  const connect = useCallback(() => {
    // Don't connect if room code is empty
    if (!roomCode || roomCode.trim() === '') {
      console.log('Room code is empty, not connecting to WebSocket');
      return;
    }

    // Construct WebSocket URL based on current location
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host; // This includes the port if present
    // Normalize room code to uppercase
    const normalizedRoomCode = roomCode.toUpperCase();
    const wsUrl = `${protocol}//${host}/ws/multiplayer/${normalizedRoomCode}/`;

    console.log('Connecting to WebSocket:', wsUrl);

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      reconnectAttempts.current = 0;

      // If host, send host.join message (with host_token for auth)
      if (isHost) {
        if (!hostToken) {
          console.error('[WS] Cannot join as host without host_token');
          setGameState('error');
          ws.close();
          return;
        }
        ws.send(JSON.stringify({ action: 'host.join', host_token: hostToken }));
        setGameState('waiting');
      } else {
        // For players: if we have a stored pseudo (reconnection), rejoin automatically
        if (storedPseudoRef.current && hasJoinedRef.current) {
          console.log('[WS] Reconnecting with stored pseudo:', storedPseudoRef.current);
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
      }
    };

    ws.onclose = (event) => {
      console.log('WebSocket closed:', event.code, event.reason);
      setIsConnected(false);

      // Try to reconnect (use ref to avoid stale closure)
      if (reconnectAttempts.current < maxReconnectAttempts && gameStateRef.current !== 'finished') {
        reconnectAttempts.current++;
        console.log(`Reconnecting... attempt ${reconnectAttempts.current}`);
        setTimeout(connect, 2000);
      } else {
        setGameState('error');
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WS message:', data);

        // Use refs to avoid stale closures
        const callbacks = callbacksRef.current;

        switch (data.type) {
          case 'host.joined':
            setPlayers(data.players || []);
            setGameState(data.status === 'playing' ? 'playing' : 'waiting');
            break;

          case 'player.joined':
            console.log('[WS] Received player.joined, player_id:', data.player_id, 'room_status:', data.room_status);
            setPlayerId(data.player_id);
            // Mémoriser le session_token s'il est fourni (premier join uniquement).
            if (data.session_token) {
              storedSessionTokenRef.current = data.session_token;
            }
            // Update gameState based on room status (for reconnection)
            if (data.room_status === 'playing') {
              setGameState('playing');
            } else if (data.room_status === 'showing_answer') {
              setGameState('showing_answer');
            } else if (data.room_status === 'finished') {
              setGameState('finished');
            } else {
              setGameState('waiting');
            }
            if (callbacks.onPlayerJoined) {
              callbacks.onPlayerJoined(data.player_id, data.pseudo, data.session_token);
              console.log('[WS] onPlayerJoined callback executed');
            }
            break;

          case 'players.updated':
            setPlayers(data.players || []);
            callbacks.onPlayersUpdated?.(data.players || []);
            break;

          case 'player.left':
            // Player disconnected - will be reflected in players.updated
            break;

          case 'game.started': {
            console.log('[WS] Received game.started, updating state...');
            setGameState('playing');
            const transformedQuestion = transformQuestionUrls(data.question);
            setCurrentQuestion(transformedQuestion);
            setCurrentAnswer(null);
            console.log('[WS] Calling onGameStarted callback');
            if (callbacks.onGameStarted) {
              callbacks.onGameStarted(transformedQuestion!);
              console.log('[WS] onGameStarted callback executed');
            } else {
              console.warn('[WS] onGameStarted callback is not defined!');
            }
            break;
          }

          case 'game.new_question': {
            setGameState('playing');
            const transformedQuestion = transformQuestionUrls(data.question);
            setCurrentQuestion(transformedQuestion);
            setCurrentAnswer(null);
            callbacks.onNewQuestion?.(transformedQuestion!);
            break;
          }

          case 'game.answer_revealed':
            setGameState('showing_answer');
            setCurrentAnswer(data.answer);
            callbacks.onAnswerRevealed?.(data.answer);
            break;

          case 'player.answered':
            console.log('[WS] Received player.answered:', data.player_id, data.pseudo);
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
            console.error('Server error:', data.message);
            callbacks.onError?.(data.message);
            break;
        }
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    return () => {
      ws.close();
    };
  }, [roomCode, isHost]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      cleanup?.();
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Actions
  const joinAsPlayer = useCallback((pseudo: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Store pseudo for reconnection
      storedPseudoRef.current = pseudo;
      hasJoinedRef.current = true;
      console.log('[WS] Joining as player with pseudo:', pseudo);
      const payload: Record<string, unknown> = {
        action: 'player.join',
        pseudo,
      };
      // Si on a un token mémorisé (restauré d'un refresh), l'envoyer pour se ré-authentifier.
      if (storedSessionTokenRef.current) {
        payload.session_token = storedSessionTokenRef.current;
      }
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const startGame = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'game.start',
      }));
    }
  }, []);

  const nextQuestion = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'game.next_question',
      }));
    }
  }, []);

  const skipQuestion = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'game.skip',
      }));
    }
  }, []);

  const showAnswer = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'game.show_answer',
      }));
    }
  }, []);

  const submitAnswer = useCallback((choice: 'left' | 'right' | 'real' | 'ai', responseTimeMs: number) => {
    console.log('[WS] submitAnswer called, choice:', choice, 'time:', responseTimeMs);
    console.log('[WS] WebSocket state:', wsRef.current?.readyState, '(OPEN=1, CLOSED=3)');
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message = {
        action: 'player.answer',
        choice,
        response_time_ms: responseTimeMs,
      };
      console.log('[WS] Sending answer:', message);
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.error('[WS] Cannot submit answer - WebSocket not open!');
    }
  }, []);

  const endGame = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        action: 'game.end',
      }));
    }
  }, []);

  return {
    isConnected,
    gameState,
    players,
    currentQuestion,
    currentAnswer,
    podium,
    playerId,
    playerScore,
    // Actions
    joinAsPlayer,
    startGame,
    nextQuestion,
    skipQuestion,
    showAnswer,
    submitAnswer,
    endGame,
  };
}

