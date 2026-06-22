import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { HelpCircle, Layers, ArrowRight } from 'lucide-react';
import LogoMIA from '../components/LogoMIA';

export default function EventFootPage() {
  const navigate = useNavigate();

  const steps = [
    {
      n: 1,
      icon: HelpCircle,
      title: 'Quiz Foot',
      desc: '10 questions de culture football (QCM & Vrai/Faux), image à l’appui.',
      cta: 'Lancer le Quiz Foot',
      onClick: () => navigate('/quiz/host'),
    },
    {
      n: 2,
      icon: Layers,
      title: 'Real vs AI — Sélection Foot',
      desc: 'Mode classe avec une sélection préchoisie de 10 médias, dans l’ordre de l’event.',
      cta: 'Lancer Real vs AI (Foot)',
      onClick: () => navigate('/multiplayer/host?preset=foot'),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-500/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }} />
      </div>

      <LogoMIA size="medium" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 w-full max-w-2xl"
      >
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-2 text-center">
          <span className="gradient-text">Event Foot ⚽</span>
        </h1>
        <p className="text-dark-400 text-center mb-10">
          Déroulé de l’animation, dans l’ordre
        </p>

        <div className="space-y-5">
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.15 }}
              className="card p-6 flex items-center gap-5"
            >
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-primary-500/20 flex items-center justify-center font-display text-xl font-bold text-primary-400">
                {s.n}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <s.icon className="w-5 h-5 text-primary-400" />
                  {s.title}
                </h2>
                <p className="text-dark-400 text-sm mt-1">{s.desc}</p>
              </div>
              <button
                onClick={s.onClick}
                className="btn-primary flex-shrink-0 inline-flex items-center gap-2"
              >
                {s.cta}
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <button
            onClick={() => navigate('/')}
            className="text-dark-400 hover:text-primary-400 transition-colors p-3"
          >
            ← Retour à l’accueil
          </button>
        </div>
      </motion.div>
    </div>
  );
}
