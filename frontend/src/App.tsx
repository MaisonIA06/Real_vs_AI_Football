import { Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import GamePage from './pages/GamePage';
import ResultPage from './pages/ResultPage';
import LeaderboardPage from './pages/LeaderboardPage';
import HallucinationsMuseumPage from './pages/HallucinationsMuseumPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminMediaPairs from './pages/admin/AdminMediaPairs';
import AdminCategories from './pages/admin/AdminCategories';
import RequireAdminAuth from './components/admin/RequireAdminAuth';

// Multiplayer / Live mode pages
import MultiplayerHostPage from './pages/multiplayer/MultiplayerHostPage';
import MultiplayerJoinPage from './pages/multiplayer/MultiplayerJoinPage';
import MultiplayerPlayerPage from './pages/multiplayer/MultiplayerPlayerPage';

// Quiz Foot (mode live event) pages
import QuizHostPage from './pages/quiz/QuizHostPage';
import QuizJoinPage from './pages/quiz/QuizJoinPage';
import QuizPlayerPage from './pages/quiz/QuizPlayerPage';

function App() {
  return (
    <div className="min-h-screen bg-animated">
      <Routes>
        {/* Game routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/game/:sessionKey" element={<GamePage />} />
        <Route path="/result/:sessionKey" element={<ResultPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/museum" element={<HallucinationsMuseumPage />} />

        {/* Multiplayer / Live mode routes */}
        <Route path="/multiplayer/host" element={<MultiplayerHostPage />} />
        <Route path="/multiplayer/join/:roomCode?" element={<MultiplayerJoinPage />} />
        <Route path="/multiplayer/play/:roomCode" element={<MultiplayerPlayerPage />} />

        {/* Quiz Foot (mode live event) routes */}
        <Route path="/quiz/host" element={<QuizHostPage />} />
        <Route path="/quiz/join/:roomCode?" element={<QuizJoinPage />} />
        <Route path="/quiz/play/:roomCode" element={<QuizPlayerPage />} />

        {/* Admin routes (protégées par auth applicative) */}
        <Route path="/admin" element={<RequireAdminAuth><AdminDashboard /></RequireAdminAuth>} />
        <Route path="/admin/pairs" element={<RequireAdminAuth><AdminMediaPairs /></RequireAdminAuth>} />
        <Route path="/admin/categories" element={<RequireAdminAuth><AdminCategories /></RequireAdminAuth>} />
      </Routes>
    </div>
  );
}

export default App;
