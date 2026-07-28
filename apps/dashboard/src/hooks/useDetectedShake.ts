import { useEffect, useRef } from 'react';
import { useAnimationControls } from 'framer-motion';

export function useDetectedShake(detected: boolean) {
  const controls = useAnimationControls();
  const wasDetected = useRef(detected);

  useEffect(() => {
    if (detected && !wasDetected.current) {
      controls.start({ x: [0, -3, 3, -3, 3, 0], transition: { duration: 0.4, ease: 'easeInOut' } });
    }
    wasDetected.current = detected;
  }, [detected, controls]);

  return controls;
}
