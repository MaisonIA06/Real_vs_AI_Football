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
    title: "Ombres & Lumière",
    subtitle: "Le soleil à deux endroits",
    image: "/ombres-lumiere.png",
    hallucination: "Des ombres qui partent dans des directions différentes, ou un personnage éclairé comme s'il y avait deux soleils.",
    explanation: "L'IA assemble une image jolie sans tenir de « plan » cohérent de la lumière. Chaque ombre est crédible prise seule, mais l'ensemble ne tient pas physiquement. C'est l'un des indices les plus fiables en 2026.",
    tip: "Repérez la source de lumière, puis vérifiez que toutes les ombres vont dans le même sens. Une ombre absente, ou un objet posé sans ombre au sol, est très suspect.",
    imagePlaceholder: "🔦"
  },
  {
    id: 2,
    title: "Le Décor qui Déraille",
    subtitle: "Net devant, n'importe quoi derrière",
    image: "/arriere-plan.png",
    hallucination: "Le sujet principal est parfait, mais derrière lui les objets se déforment, l'architecture devient impossible et les passants ont des visages flous ou dédoublés.",
    explanation: "L'IA concentre ses efforts sur le sujet central. Plus on s'éloigne au second plan, moins elle « fait attention » : les lignes ondulent, les fenêtres ne s'alignent plus, les silhouettes fondent.",
    tip: "Ne regardez pas que le sujet : fouillez l'arrière-plan. Lignes droites qui gondolent, escaliers qui ne mènent nulle part, visages de foule identiques ou flous = signal d'alerte.",
    imagePlaceholder: "🏙️"
  },
  {
    id: 3,
    title: "Le Copier-Coller Invisible",
    subtitle: "Les motifs qui se répètent",
    image: "/details-repetes.png",
    hallucination: "Des visages qui se ressemblent trop dans une foule, des briques, fenêtres ou pavés identiques, des motifs de tissu parfaitement réguliers.",
    explanation: "Pour remplir une zone, l'IA réutilise des motifs très similaires. Le réel a toujours de petites variations ; l'IA, elle, tombe vite dans la répétition trop nette.",
    tip: "Cherchez les éléments qui se dupliquent : deux passants au même visage, une rangée de fenêtres trop identiques, un motif qui ne suit pas les plis du tissu.",
    imagePlaceholder: "🧩"
  },
  {
    id: 4,
    title: "Les Accessoires Fantômes",
    subtitle: "Ce qui ne tient pas ensemble",
    image: "/accessoires.png",
    hallucination: "Des branches de lunettes qui traversent le visage, des boucles d'oreilles dépareillées, un collier ou une bretelle qui disparaît puis réapparaît, une fermeture éclair qui ne mène nulle part.",
    explanation: "Les petits objets qui relient deux points (lunettes, bijoux, sangles, boutons) demandent une cohérence d'un bout à l'autre. L'IA gère mal ce « suivi » et les fait se fondre ou disparaître.",
    tip: "Suivez chaque accessoire du regard d'un bout à l'autre : la branche de lunettes va-t-elle jusqu'à l'oreille ? Les deux boucles d'oreilles sont-elles assorties ? La sangle est-elle continue ?",
    imagePlaceholder: "👓"
  },
  {
    id: 5,
    title: "Trop Beau pour Être Vrai",
    subtitle: "L'absence de défaut est le défaut",
    image: "/trop-parfait.png",
    hallucination: "Un éclairage de studio idéal, une peau sans pores, un flou d'arrière-plan crémeux, des couleurs ultra-saturées : une image « parfaite » sur toute la ligne.",
    explanation: "Les IA visent l'esthétique la plus léchée possible. Résultat : une perfection un peu artificielle, sans le grain, les imperfections et le hasard d'une vraie photo.",
    tip: "Méfiez-vous des images trop léchées. Une vraie photo a presque toujours un petit défaut : grain, reflet parasite, cadrage imparfait, peau réelle.",
    imagePlaceholder: "✨"
  },
  {
    id: 6,
    title: "Ce qui ne Colle Pas",
    subtitle: "Le détail logique impossible",
    image: "/incoherences-logiques.png",
    hallucination: "Un reflet qui ne correspond pas, un petit panneau en charabia, une horloge dont l'heure n'a aucun sens, une main qui tient un objet… qui n'existe pas vraiment.",
    explanation: "L'IA imite l'apparence du monde sans en comprendre les règles. Tant qu'on regarde vite, c'est crédible ; dès qu'on raisonne, des absurdités apparaissent.",
    tip: "Prenez deux secondes pour « raisonner » l'image : ce reflet est-il logique ? Ce texte veut-il dire quelque chose ? Cette ombre correspond-elle à un objet réel ?",
    imagePlaceholder: "🔍"
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

