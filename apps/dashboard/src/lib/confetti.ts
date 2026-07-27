import confetti from 'canvas-confetti';

const GREEN_SHADES = ['#22c55e', '#4ade80', '#86efac', '#16a34a'];

export function burstAt(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const x = (rect.left + rect.width / 2) / window.innerWidth;
  const y = (rect.top + rect.height / 2) / window.innerHeight;

  confetti({
    particleCount: 24,
    spread: 55,
    startVelocity: 22,
    scalar: 0.7,
    gravity: 1.1,
    ticks: 120,
    origin: { x, y },
    colors: GREEN_SHADES,
  });
}

export function celebrate() {
  const duration = 1500;
  const end = Date.now() + duration;

  (function frame() {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 60,
      origin: { x: 0, y: 0.7 },
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 60,
      origin: { x: 1, y: 0.7 },
    });

    if (Date.now() < end) {
      requestAnimationFrame(frame);
    }
  })();

  confetti({
    particleCount: 150,
    spread: 100,
    startVelocity: 45,
    origin: { x: 0.5, y: 0.3 },
  });
}
