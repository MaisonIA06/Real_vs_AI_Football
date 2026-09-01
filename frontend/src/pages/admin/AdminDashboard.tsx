import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Image,
  FolderOpen,
  Users,
  Trophy,
  GraduationCap,
  Trash2,
  Filter,
} from 'lucide-react';
import { adminApi, Category, DashboardStats, GameSettingsAdmin } from '../../services/api';
import AdminLayout from '../../components/admin/AdminLayout';


export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['admin-stats'],
    queryFn: () => adminApi.getStats().then((res) => res.data),
  });

  const { data: settings } = useQuery<GameSettingsAdmin>({
    queryKey: ['admin-settings'],
    queryFn: () => adminApi.getSettings().then((res) => res.data),
  });

  const { data: categories } = useQuery<Category[]>({
    queryKey: ['admin-categories'],
    queryFn: () => adminApi.getCategories().then((res) => res.data),
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (activeCategory: number | null) => adminApi.updateSettings(activeCategory),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
  });

  const handleActiveCategoryChange = (value: string) => {
    updateSettingsMutation.mutate(value === '' ? null : Number(value));
  };

  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: number) => adminApi.deleteSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
    },
  });

  const handleDeleteSession = (sessionId: number, pseudo: string) => {
    if (window.confirm(`Êtes-vous sûr de vouloir supprimer la session de "${pseudo}" ?`)) {
      deleteSessionMutation.mutate(sessionId);
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-12 h-12 border-4 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  const statsCards = [
    {
      title: 'Catégories',
      value: stats?.total_categories || 0,
      icon: FolderOpen,
      color: 'text-primary-400',
      bgColor: 'bg-primary-500/20',
      link: '/admin/categories',
    },
    {
      title: 'Paires de médias',
      value: stats?.total_pairs || 0,
      icon: Image,
      color: 'text-accent-400',
      bgColor: 'bg-accent-500/20',
      link: '/admin/pairs',
    },
    {
      title: 'Sessions jouées',
      value: stats?.completed_sessions || 0,
      icon: Users,
      color: 'text-green-400',
      bgColor: 'bg-green-500/20',
      link: '/leaderboard',
    },
  ];

  return (
    <AdminLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="font-display text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-dark-400">Vue d'ensemble de Real vs AI</p>
        </div>

        {/* Catégorie active du jeu */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card"
        >
          <h3 className="font-display text-lg font-semibold mb-1 flex items-center gap-2">
            <Filter className="w-5 h-5 text-accent-400" />
            Catégorie du jeu
          </h3>
          <p className="text-sm text-dark-400 mb-4">
            Restreint les parties (solo et mode classe) aux paires d'une seule
            catégorie. « Toutes les catégories » = tirage classique.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={settings?.active_category ?? ''}
              onChange={(e) => handleActiveCategoryChange(e.target.value)}
              disabled={updateSettingsMutation.isPending}
              className="input-styled"
            >
              <option value="">Toutes les catégories</option>
              {categories?.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {updateSettingsMutation.isPending ? (
              <span className="text-sm text-dark-400">Enregistrement…</span>
            ) : settings?.active_category ? (
              <span className="text-sm text-accent-400">
                Parties limitées à « {settings.active_category_name} »
              </span>
            ) : (
              <span className="text-sm text-dark-400">Aucune restriction</span>
            )}
            {updateSettingsMutation.isError && (
              <span className="text-sm text-red-400">
                Échec de l'enregistrement — réessayez.
              </span>
            )}
          </div>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statsCards.map((stat, index) => {
            const CardContent = (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`card ${stat.link ? 'cursor-pointer hover:bg-dark-700 transition-colors' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl ${stat.bgColor} flex items-center justify-center`}>
                    <stat.icon className={`w-6 h-6 ${stat.color}`} />
                  </div>
                  <div>
                    <div className="text-3xl font-bold">{stat.value}</div>
                    <div className="text-sm text-dark-400">{stat.title}</div>
                  </div>
                </div>
              </motion.div>
            );

            return stat.link ? (
              <Link key={stat.title} to={stat.link}>
                {CardContent}
              </Link>
            ) : (
              <div key={stat.title}>{CardContent}</div>
            );
          })}
        </div>

        {/* Taux de réussite par audience */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Taux de réussite Scolaire */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="card"
          >
            <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
              <GraduationCap className="w-5 h-5 text-primary-400" />
              Taux de réussite - Scolaire
            </h3>
            <div className="flex items-end gap-2 mb-2">
              <div className="text-5xl font-bold text-primary-400">
                {stats?.school_stats?.success_rate || 0}%
              </div>
            </div>
            <div className="space-y-1 text-sm text-dark-400">
              <p>{stats?.school_stats?.total_sessions || 0} sessions</p>
              <p>{stats?.school_stats?.correct_answers || 0} / {stats?.school_stats?.total_answers || 0} bonnes réponses</p>
            </div>
            {/* Barre de progression */}
            <div className="mt-4 h-3 bg-dark-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-primary-500 to-primary-400 rounded-full transition-all duration-500"
                style={{ width: `${stats?.school_stats?.success_rate || 0}%` }}
              />
            </div>
          </motion.div>

          {/* Taux de réussite Grand Public */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="card"
          >
            <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-accent-400" />
              Taux de réussite - Grand Public
            </h3>
            <div className="flex items-end gap-2 mb-2">
              <div className="text-5xl font-bold text-accent-400">
                {stats?.public_stats?.success_rate || 0}%
              </div>
            </div>
            <div className="space-y-1 text-sm text-dark-400">
              <p>{stats?.public_stats?.total_sessions || 0} sessions</p>
              <p>{stats?.public_stats?.correct_answers || 0} / {stats?.public_stats?.total_answers || 0} bonnes réponses</p>
            </div>
            {/* Barre de progression */}
            <div className="mt-4 h-3 bg-dark-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-accent-500 to-accent-400 rounded-full transition-all duration-500"
                style={{ width: `${stats?.public_stats?.success_rate || 0}%` }}
              />
            </div>
          </motion.div>
        </div>

        {/* Recent Sessions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="card"
        >
          <h3 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            Sessions récentes
          </h3>
          {stats?.recent_sessions && stats.recent_sessions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="table-admin">
                <thead>
                  <tr>
                    <th>Pseudo</th>
                    <th>Type</th>
                    <th>Score</th>
                    <th>Streak Max</th>
                    <th>Date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent_sessions.map((session: any, index: number) => (
                    <tr key={index}>
                      <td className="font-semibold">{session.pseudo || 'Anonyme'}</td>
                      <td>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          session.audience_type === 'school' 
                            ? 'bg-primary-500/20 text-primary-400' 
                            : 'bg-accent-500/20 text-accent-400'
                        }`}>
                          {session.audience_type === 'school' ? 'Scolaire' : 'Grand Public'}
                        </span>
                      </td>
                      <td className="gradient-text font-bold">{session.score}</td>
                      <td>{session.streak_max}</td>
                      <td className="text-dark-400">
                        {new Date(session.created_at).toLocaleDateString('fr-FR')}
                      </td>
                      <td>
                        <button
                          onClick={() => handleDeleteSession(session.id, session.pseudo || 'Anonyme')}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Supprimer cette session"
                          disabled={deleteSessionMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-dark-400 text-center py-8">Aucune session récente</p>
          )}
        </motion.div>
      </div>
    </AdminLayout>
  );
}

