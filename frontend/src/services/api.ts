import axios from 'axios';

// Utiliser une URL relative pour que l'API fonctionne depuis n'importe quel appareil
// (tablettes, téléphones, etc. sur le réseau local)
const getApiUrl = () => {
  // Si une URL est définie explicitement et n'est pas localhost, l'utiliser
  if (import.meta.env.VITE_API_URL && !import.meta.env.VITE_API_URL.includes('localhost')) {
    return import.meta.env.VITE_API_URL;
  }
  
  // En production ou via Nginx, une URL relative est préférable
  // car le frontend et l'API sont sur le même hôte/port
  return '/api';
};

const API_URL = getApiUrl();

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // Note: withCredentials désactivé car non nécessaire pour ce jeu
  // et peut causer des problèmes CORS sur les navigateurs mobiles (Safari/Chrome iOS)
  withCredentials: false,
});

// --- Authentification admin (DRF TokenAuthentication) ---
const ADMIN_TOKEN_KEY = 'admin_token';
export const getAdminToken = (): string | null => localStorage.getItem(ADMIN_TOKEN_KEY);
export const setAdminToken = (token: string) => localStorage.setItem(ADMIN_TOKEN_KEY, token);
export const clearAdminToken = () => localStorage.removeItem(ADMIN_TOKEN_KEY);

// Route admin protégée (nécessite le token), hors endpoint de login.
const isProtectedAdminUrl = (url: string) =>
  url.includes('/admin/') && !url.includes('/admin/auth/');

// Joindre le token UNIQUEMENT aux routes admin protégées. Les routes de jeu
// sont publiques : y envoyer un token invalide provoquerait un 401 inutile.
api.interceptors.request.use((config) => {
  if (isProtectedAdminUrl(config.url || '')) {
    const token = getAdminToken();
    if (token) {
      config.headers.set('Authorization', `Token ${token}`);
    }
  }
  return config;
});

// Si une requête admin est refusée (token invalide/absent), purger le token ET
// renvoyer vers la porte d'auth. L'état React ne réagit pas tout seul à la purge :
// sans cette redirection, l'utilisateur resterait coincé sur une page cassée.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error?.config?.url || '';
    const httpStatus = error?.response?.status;
    if (isProtectedAdminUrl(url) && (httpStatus === 401 || httpStatus === 403)) {
      clearAdminToken();
      if (window.location.pathname.startsWith('/admin')) {
        window.location.href = '/admin';
      }
    }
    return Promise.reject(error);
  }
);

// Types
export interface Category {
  id: number;
  name: string;
  description: string;
}

export interface MediaPair {
  id: number;
  category: Category;
  media_type: 'image' | 'video' | 'audio';
  difficulty: 'easy' | 'medium' | 'hard';
  left_media?: string;
  right_media?: string;
  audio_media?: string;
  real_position?: 'left' | 'right' | 'real' | 'ai';
  is_real?: boolean;
}

export interface GameSession {
  session_key: string;
  quiz_name: string;
  pairs: MediaPair[];
  total_pairs: number;
}

export interface AnswerResponse {
  is_correct: boolean;
  hint: string;
  ai_position: 'left' | 'right' | 'real' | 'ai';
  points_earned: number;
  current_streak: number;
  total_score: number;
  global_stats: {
    total_attempts: number;
    success_rate: number;
  };
  is_session_complete: boolean;
}

export interface GameResult {
  session_key: string;
  quiz_name: string;
  pseudo: string;
  score: number;
  streak_max: number;
  time_total_ms: number;
  is_completed: boolean;
  answers: {
    order: number;
    is_correct: boolean;
    response_time_ms: number;
    points_earned: number;
  }[];
}

export interface LeaderboardEntry {
  id: number;
  pseudo: string;
  score: number;
  streak_max: number;
  time_total_ms: number;
  quiz_name: string;
  created_at: string;
}

// Game API
export const gameApi = {
  startSession: (audienceType: 'school' | 'public' = 'public') =>
    api.post<GameSession>('/game/sessions/', { audience_type: audienceType }),

  submitAnswer: (sessionKey: string, pairId: number, choice: 'left' | 'right' | 'real' | 'ai', responseTimeMs: number) =>
    api.post<AnswerResponse>(`/game/sessions/${sessionKey}/answer/`, {
      pair_id: pairId,
      choice,
      response_time_ms: responseTimeMs,
    }),

  getResult: (sessionKey: string) =>
    api.get<GameResult>(`/game/sessions/${sessionKey}/result/`),

  submitPseudo: (sessionKey: string, pseudo: string) =>
    api.post(`/game/sessions/${sessionKey}/result/`, { pseudo }),

  getLeaderboard: (limit = 10) =>
    api.get<LeaderboardEntry[]>('/game/leaderboard/', {
      params: { limit },
    }),

  // Multiplayer / Live Mode
  createMultiplayerRoom: () =>
    api.post<MultiplayerRoom>('/game/multiplayer/rooms/', {}),

  getMultiplayerRoom: (roomCode: string) =>
    api.get<MultiplayerRoom>(`/game/multiplayer/rooms/${roomCode}/`),

  getLocalIP: () =>
    api.get<{ ip: string }>('/game/local-ip/'),

  // Quiz Foot (mode live event)
  createQuizRoom: () =>
    api.post<QuizRoom>('/quiz/rooms/', {}),

  getQuizRoom: (roomCode: string) =>
    api.get<QuizRoom>(`/quiz/rooms/${roomCode}/`),
};

// Types for Quiz Foot
export interface QuizRoom {
  id: number;
  room_code: string;
  host_token?: string; // Renvoyé uniquement à la création (POST), jamais dans le GET
  status: 'waiting' | 'playing' | 'showing_answer' | 'finished';
  question_count: number;
  created_at: string;
}

// Types for Multiplayer
export interface MultiplayerRoom {
  id: number;
  room_code: string;
  host_token?: string; // Renvoyé uniquement à la création (POST), jamais dans le GET
  status: 'waiting' | 'playing' | 'showing_answer' | 'finished';
  created_at: string;
}

// Admin API
export interface MediaPairAdmin {
  id: number;
  category: number;
  category_name: string;
  real_media?: string;
  ai_media?: string;
  audio_media?: string;
  is_real?: boolean;
  media_type: string;
  difficulty: string;
  hint: string;
  is_active: boolean;
  stats: {
    total_attempts: number;
    correct_answers: number;
    success_rate: number;
  };
  created_at: string;
}

export interface AudienceStats {
  success_rate: number;
  total_sessions: number;
  total_answers: number;
  correct_answers: number;
}

export interface DashboardStats {
  total_categories: number;
  total_pairs: number;
  total_sessions: number;
  completed_sessions: number;
  school_stats: AudienceStats;
  public_stats: AudienceStats;
  recent_sessions: {
    id: number;
    session_key: string;
    pseudo: string;
    score: number;
    streak_max: number;
    audience_type: 'school' | 'public';
    created_at: string;
  }[];
}

export const adminApi = {
  // Auth
  login: (username: string, password: string) =>
    api
      .post<{ token: string }>('/admin/auth/login/', { username, password })
      .then((res) => {
        setAdminToken(res.data.token);
        return res;
      }),
  logout: () => clearAdminToken(),
  isAuthenticated: () => !!getAdminToken(),

  // Categories
  getCategories: () => api.get<Category[]>('/admin/categories/'),
  createCategory: (data: Partial<Category>) => api.post<Category>('/admin/categories/', data),
  updateCategory: (id: number, data: Partial<Category>) => api.patch<Category>(`/admin/categories/${id}/`, data),
  deleteCategory: (id: number) => api.delete(`/admin/categories/${id}/`),

  // Media Pairs
  getMediaPairs: (params?: { category?: number; media_type?: string; difficulty?: string; is_active?: boolean }) =>
    api.get<MediaPairAdmin[]>('/admin/media-pairs/', { params }),
  createMediaPair: (formData: FormData) =>
    api.post<MediaPairAdmin>('/admin/media-pairs/', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  updateMediaPair: (id: number, formData: FormData) =>
    api.patch<MediaPairAdmin>(`/admin/media-pairs/${id}/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  deleteMediaPair: (id: number) => api.delete(`/admin/media-pairs/${id}/`),

  // Stats
  getStats: () => api.get<DashboardStats>('/admin/stats/'),

  // Sessions
  deleteSession: (sessionId: number) => api.delete(`/admin/sessions/${sessionId}/`),
};

export default api;
