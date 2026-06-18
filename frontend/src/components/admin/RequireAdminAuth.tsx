import { ReactNode, useState, FormEvent } from 'react';
import { Lock, LogIn } from 'lucide-react';
import { adminApi } from '../../services/api';

/**
 * Porte d'authentification pour l'espace admin.
 * Tant que l'utilisateur n'est pas connecté (token DRF absent), les pages admin
 * ne sont PAS montées — on affiche le formulaire de login à la place. Cela évite
 * que les pages déclenchent leurs requêtes (qui seraient refusées par IsAdminUser).
 */
export default function RequireAdminAuth({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState(adminApi.isAuthenticated());

  if (authed) {
    return <>{children}</>;
  }

  return <AdminLogin onSuccess={() => setAuthed(true)} />;
}

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await adminApi.login(username, password);
      onSuccess();
    } catch {
      setError('Identifiants invalides ou compte non administrateur.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-dark-900 border border-dark-700 rounded-2xl p-8 space-y-6"
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
            <Lock className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display font-bold text-lg">Administration</h1>
            <p className="text-sm text-dark-400">Connexion requise</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-dark-400 mb-1" htmlFor="admin-username">
              Identifiant
            </label>
            <input
              id="admin-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 focus:border-primary-500 outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm text-dark-400 mb-1" htmlFor="admin-password">
              Mot de passe
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl bg-dark-800 border border-dark-700 focus:border-primary-500 outline-none transition-colors"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-60 font-bold transition-all"
        >
          <LogIn className="w-5 h-5" />
          {loading ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}
