import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Delete, Space, ArrowBigUp } from 'lucide-react';

interface VirtualKeyboardProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  maxLength?: number;
  submitLabel?: string;
  submitDisabled?: boolean;
}

const ROWS_LOWER = [
  ['a', 'z', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['q', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'm'],
  ['SHIFT', 'w', 'x', 'c', 'v', 'b', 'n', 'BACKSPACE'],
  ['123', 'SPACE', 'SUBMIT'],
];

const ROWS_UPPER = [
  ['A', 'Z', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['Q', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M'],
  ['SHIFT', 'W', 'X', 'C', 'V', 'B', 'N', 'BACKSPACE'],
  ['123', 'SPACE', 'SUBMIT'],
];

const ROWS_NUMBERS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['-', '_', '.', ',', '!', '?', '@', '#', '&', '+'],
  ['ABC', 'BACKSPACE'],
  ['SPACE', 'SUBMIT'],
];

export default function VirtualKeyboard({
  value,
  onChange,
  onSubmit,
  maxLength = 50,
  submitLabel = 'Valider',
  submitDisabled = false,
}: VirtualKeyboardProps) {
  const [isUpper, setIsUpper] = useState(true);
  const [isNumbers, setIsNumbers] = useState(false);

  const rows = isNumbers ? ROWS_NUMBERS : isUpper ? ROWS_UPPER : ROWS_LOWER;

  const handleKey = (key: string) => {
    switch (key) {
      case 'SHIFT':
        setIsUpper((prev) => !prev);
        break;
      case 'BACKSPACE':
        onChange(value.slice(0, -1));
        break;
      case 'SPACE':
        if (value.length < maxLength) onChange(value + ' ');
        break;
      case 'SUBMIT':
        onSubmit();
        break;
      case '123':
        setIsNumbers(true);
        break;
      case 'ABC':
        setIsNumbers(false);
        break;
      default:
        if (value.length < maxLength) {
          onChange(value + key);
          if (isUpper && !isNumbers) setIsUpper(false);
        }
        break;
    }
  };

  const getKeyWidth = (key: string) => {
    switch (key) {
      case 'SPACE':
        return 'flex-[3]';
      case 'SUBMIT':
        return 'flex-[2]';
      case 'SHIFT':
      case 'BACKSPACE':
      case 'ABC':
      case '123':
        return 'flex-[1.5]';
      default:
        return 'flex-1';
    }
  };

  const renderKey = (key: string) => {
    const isSpecial = ['SHIFT', 'BACKSPACE', 'SPACE', 'SUBMIT', '123', 'ABC'].includes(key);
    const isSubmit = key === 'SUBMIT';

    let content: React.ReactNode = key;
    if (key === 'BACKSPACE') content = <Delete className="w-5 h-5 mx-auto" />;
    if (key === 'SPACE') content = <Space className="w-5 h-5 mx-auto" />;
    if (key === 'SHIFT') content = <ArrowBigUp className={`w-5 h-5 mx-auto ${isUpper && !isNumbers ? 'text-primary-400' : ''}`} />;
    if (key === 'SUBMIT') content = submitLabel;

    return (
      <motion.button
        key={key}
        whileTap={{ scale: 0.9 }}
        onClick={() => handleKey(key)}
        disabled={isSubmit && submitDisabled}
        className={`
          ${getKeyWidth(key)}
          h-14 rounded-xl font-semibold text-lg
          flex items-center justify-center
          transition-colors duration-150
          touch-action-manipulation
          ${isSubmit
            ? 'bg-gradient-to-r from-primary-500 to-accent-500 text-white disabled:opacity-40'
            : isSpecial
              ? 'bg-dark-600 text-dark-200'
              : 'bg-dark-700 text-white'
          }
          active:brightness-125
        `}
      >
        {content}
      </motion.button>
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="w-full max-w-2xl mx-auto mt-4"
      >
        <div className="flex flex-col gap-2 p-3 rounded-2xl bg-dark-900/80 border border-dark-700 backdrop-blur-sm">
          {rows.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-1.5 justify-center">
              {row.map((key) => renderKey(key))}
            </div>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
