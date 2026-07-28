import { useEffect, useRef } from 'react';
import { celebrate } from '@/lib/confetti';
import { playComplete } from '@/lib/sound';

export function useAllDoneCelebration(allDone: boolean, onComplete?: () => void) {
  const wasAllDone = useRef(false);

  useEffect(() => {
    if (allDone && !wasAllDone.current) {
      celebrate();
      playComplete();
      onComplete?.();
    }
    wasAllDone.current = allDone;
  }, [allDone, onComplete]);
}
