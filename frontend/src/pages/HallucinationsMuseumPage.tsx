import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ChevronLeft, 
  ChevronRight, 
  Info, 
  Eye,  
  Layers, 
  X
} from 'lucide-react';
import LogoMIA from '../components/LogoMIA';

interface Exhibit {
  id: number;
  title: string;
  subtitle: string;
  image: string;
  hallucination: string;
  explanation: string;
  tip: string;
  imagePlaceholder: string;
}

const exhibits: Exhibit[] = [
  {
    id: 1,
    title: "L'Anatomie Impossible",
    subtitle: "Le syndrome du 6ème doigt",
    image: "/l'anatomie impossible.png",
    hallucination: "Les mains, les dents et les membres fusionnés sont les points faibles historiques des modèles génératifs.",
    explanation: "L'IA ne comprend pas la structure squelettique ou biologique. Elle 'sait' que des doigts apparaissent souvent près d'une main, mais elle ne compte pas. Pour elle, une main est une texture complexe de formes oblongues.",
    tip: "Comptez toujours les doigts et vérifiez l'articulation des membres. Regardez si les dents sont trop nombreuses ou fusionnées.",
    imagePlaceholder: "🖐️"
  },
  {
    id: 2,
    title: "Le Texte Fantôme",
    subtitle: "L'écriture de l'espace",
    image: "/le texte fantôme.png",
    hallucination: "Les glyphes qui ressemblent à du texte mais ne veulent rien dire, ou des lettres qui mutent.",
    explanation: "Les modèles d'IA traitent le texte comme des motifs visuels et non comme des symboles sémantiques. Ils reproduisent l'esthétique d'une police de caractères sans en comprendre la grammaire ou l'alphabet.",
    tip: "Essayez de lire les panneaux, les étiquettes ou les logos en arrière-plan. Si c'est illisible ou dans une langue inexistante, c'est une IA.",
    imagePlaceholder: "📝"
  },
  {
    id: 3,
    title: "Reflets Incohérents",
    subtitle: "Le miroir brisé",
    image: "/reflets incohérents.png",
    hallucination: "Des reflets dans les yeux ou sur l'eau qui ne correspondent pas à la scène environnante.",
    explanation: "L'IA génère les pixels par probabilité locale. Elle peut créer un magnifique paysage et un reflet d'eau, mais elle oublie souvent de lier mathématiquement la symétrie entre l'objet et son reflet.",
    tip: "Regardez les pupilles : le reflet de la source de lumière doit être identique des deux côtés. Vérifiez si les ombres tombent dans la même direction.",
    imagePlaceholder: "🪞"
  },
  {
    id: 4,
    title: "La Fusion des Objets",
    subtitle: "L'erreur de segmentation",
    image: "/La Fusion des objets.png",
    hallucination: "Un vêtement qui devient de la peau, ou un sac à main qui sort directement du bras d'une personne.",
    explanation: "Ce qu'on appelle la 'segmentation' est difficile pour l'IA. Elle a du mal à définir où s'arrête un objet et où commence un autre, surtout quand les couleurs sont similaires.",
    tip: "Suivez les lignes de contour des objets. Cherchez les endroits où deux textures différentes semblent se mélanger de façon organique mais illogique.",
    imagePlaceholder: "🌀"
  },
  {
    id: 5,
    title: "Lissage de Porcelaine",
    subtitle: "La vallée de l'étrange",
    image: "/lissage de porcelaine.png",
    hallucination: "Des visages trop parfaits, sans pores, sans rides, avec une texture rappelant le plastique ou la cire.",
    explanation: "Pour réduire le 'bruit' visuel, les IA ont tendance à sur-lisser les surfaces. Cela donne cet aspect 'filtre beauté' extrême qui supprime les micro-détails de la peau humaine réelle.",
    tip: "Zoomez sur la peau. L'absence de pores, de petits duvets, ou de légères imperfections asymétriques est un signe majeur de génération artificielle.",
    imagePlaceholder: "✨"
  }
];

export default function HallucinationsMuseumPage() {
  const navigate = useNavigate();
  const [currentIndex, setCurrentIndex] = useState(0);

  const next = () => setCurrentIndex((prev) => (prev + 1) % exhibits.length);
  const prev = () => setCurrentIndex((prev) => (prev - 1 + exhibits.length) % exhibits.length);

  const currentExhibit = exhibits[currentIndex];

  return (
    <div className="min-h-screen bg-dark-950 text-white flex flex-col overflow-hidden">
      {/* Background Effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary-900/20 rounded-full blur-[120px]" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-accent-900/20 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 p-6 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/')}
            className="p-3 active:bg-white/10 rounded-full transition-colors"
          >
            <ChevronLeft className="w-7 h-7" />
          </button>
          <div>
            <h1 className="text-xl font-display font-bold tracking-wider uppercase text-dark-300">
              Le Musée des <span className="text-white">Hallucinations</span>
            </h1>
            <p className="text-xs text-dark-500 font-mono">Archive Secrète #00{currentExhibit.id}</p>
          </div>
        </div>
        <LogoMIA size="small" />
      </header>

      {/* Main Gallery Area */}
      <main className="flex-1 relative z-10 flex flex-col items-center justify-center p-4 md:p-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentExhibit.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-12 items-center"
          >
            {/* Visual Part */}
            <div className="relative group">
              <div className="aspect-[4/5] md:aspect-square bg-dark-900 rounded-3xl border border-white/5 flex items-center justify-center text-9xl shadow-2xl overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-dark-950/50 to-transparent" />
                <motion.span
                  initial={{ scale: 0.5, rotate: -10 }}
                  animate={{ scale: 1, rotate: 0 }}
                  className="relative z-10"
                >
                  <img src={currentExhibit.image} alt={currentExhibit.title} className="w-full h-full object-cover" />
                </motion.span>
                
                {/* Floating Labels */}
                <div className="absolute top-6 left-6 flex flex-col gap-2">
                  <span className="px-3 py-1 bg-white/10 backdrop-blur-md rounded-full text-[10px] font-mono border border-white/10 uppercase tracking-widest">
                    Détection d'erreur
                  </span>
                </div>
              </div>
              
              {/* Exhibit Info Overlay (Mobile friendly) */}
              <div className="mt-6 lg:hidden">
                <h2 className="text-3xl font-display font-bold mb-2">{currentExhibit.title}</h2>
                <p className="text-primary-400 font-medium mb-4">{currentExhibit.subtitle}</p>
              </div>
            </div>

            {/* Content Part */}
            <div className="flex flex-col gap-6">
              <div className="hidden lg:block">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                >
                  <h2 className="text-5xl font-display font-bold mb-2">{currentExhibit.title}</h2>
                  <p className="text-xl text-primary-400 font-medium mb-8">{currentExhibit.subtitle}</p>
                </motion.div>
              </div>

              <div className="space-y-6">
                <section>
                  <h3 className="flex items-center gap-2 text-dark-400 text-sm font-bold uppercase tracking-widest mb-3">
                    <Info className="w-4 h-4" /> L'Hallucination
                  </h3>
                  <p className="text-lg text-dark-200 leading-relaxed">
                    {currentExhibit.hallucination}
                  </p>
                </section>

                <section>
                  <h3 className="flex items-center gap-2 text-dark-400 text-sm font-bold uppercase tracking-widest mb-3">
                    <Layers className="w-4 h-4" /> Explication technique
                  </h3>
                  <p className="text-dark-400 leading-relaxed italic">
                    {currentExhibit.explanation}
                  </p>
                </section>

                <motion.div 
                  className="bg-primary-500/10 border border-primary-500/20 p-6 rounded-2xl"
                  whileTap={{ scale: 0.98 }}
                >
                  <h3 className="text-primary-400 text-sm font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Eye className="w-4 h-4" /> Conseil d'expert
                  </h3>
                  <p className="text-primary-100 font-medium">
                    {currentExhibit.tip}
                  </p>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer Navigation */}
      <footer className="relative z-10 p-8 flex flex-col md:flex-row items-center justify-between gap-8 border-t border-white/5 bg-dark-950/90">
        <div className="flex items-center gap-6">
          <div className="flex gap-2">
            {exhibits.map((_, i) => (
              <div 
                key={i}
                className={`h-2 transition-all duration-500 rounded-full ${
                  i === currentIndex ? 'w-10 bg-primary-500' : 'w-3 bg-dark-700'
                }`}
              />
            ))}
          </div>
          <span className="text-sm font-mono text-dark-500">
            {currentIndex + 1} / {exhibits.length}
          </span>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={prev}
            className="p-5 rounded-2xl bg-dark-900 border border-white/5 active:bg-dark-800 transition-all active:scale-95"
          >
            <ChevronLeft className="w-7 h-7" />
          </button>
          <button 
            onClick={next}
            className="px-10 py-5 rounded-2xl bg-primary-600 active:bg-primary-500 font-bold text-lg flex items-center gap-3 transition-all active:scale-95 shadow-lg shadow-primary-900/20"
          >
            Suivant <ChevronRight className="w-6 h-6" />
          </button>
        </div>

        <button 
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-dark-500 active:text-white transition-colors p-3"
        >
          <X className="w-5 h-5" />
          <span className="text-base font-medium">Fermer la galerie</span>
        </button>
      </footer>
    </div>
  );
}

