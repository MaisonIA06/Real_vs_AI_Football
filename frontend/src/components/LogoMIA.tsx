import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

interface LogoMIAProps {
  size?: 'small' | 'medium' | 'large';
}

export default function LogoMIA({ size = 'medium' }: LogoMIAProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [clickCount, setClickCount] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const isStudentMode = location.pathname.startsWith('/multiplayer/');

  const sizeClasses = {
    small: 'h-12 md:h-16',
    medium: 'h-16 md:h-20',
    large: 'h-20 md:h-24',
  };

  useEffect(() => {
    if (clickCount > 0) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        setClickCount(0);
      }, 2000);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [clickCount]);

  const handleClick = () => {
    if (isStudentMode) return;

    const newCount = clickCount + 1;
    setClickCount(newCount);

    if (newCount >= 10) {
      navigate('/admin');
      setClickCount(0);
    }
  };

  return (
    <div className="fixed bottom-4 left-4 z-20">
      <img
        src="/MIA_Couleur-01.png"
        alt="La Maison de l'IA"
        onClick={handleClick}
        className={`${sizeClasses[size]} w-auto opacity-80 ${isStudentMode ? '' : 'hover:opacity-100 cursor-pointer'} transition-opacity`}
        title="La Maison de l'IA"
      />
    </div>
  );
}

