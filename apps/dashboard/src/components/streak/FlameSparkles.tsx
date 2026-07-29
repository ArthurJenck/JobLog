import { motion, AnimatePresence } from 'framer-motion';
import { Sparkle } from 'lucide-react';

const SPARKLES = [
  { style: { top: '-5px', left: '-5px' }, size: 7, delay: 0 },
  { style: { top: '-2px', right: '-7px' }, size: 6, delay: 0.4 },
  { style: { bottom: '-4px', right: '-3px' }, size: 5, delay: 0.85 },
  { style: { bottom: '0px', left: '-7px' }, size: 5, delay: 1.2 },
];

export function FlameSparkles({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <div className="pointer-events-none absolute inset-0">
          {SPARKLES.map((s, i) => (
            <motion.span
              key={i}
              className="absolute text-amber-300"
              style={s.style}
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: [0, 1, 0], scale: [0.3, 1, 0.3], rotate: [0, 90] }}
              exit={{ opacity: 0, scale: 0 }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                repeatDelay: 0.8,
                delay: s.delay,
                ease: 'easeInOut',
              }}
            >
              <Sparkle size={s.size} fill="currentColor" />
            </motion.span>
          ))}
        </div>
      )}
    </AnimatePresence>
  );
}
