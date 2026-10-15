import { useEffect, useState } from 'react';

const SLOTS = [56, 132, 208, 284];
const randomAddress = () => {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, '0')).join('');
  return `0x${hex.slice(0, 4)}…${hex.slice(-4)}`;
};

/** An agent paying out; every payment lands at a brand-new address. */
export function HeroVisual() {
  const [addresses, setAddresses] = useState(() => SLOTS.map(randomAddress));
  const [tick, setTick] = useState(0);
  const slot = tick % SLOTS.length;

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const t = setInterval(() => setTick((n) => n + 1), 1700);
    return () => clearInterval(t);
  }, []);

  // A fresh address appears just as the payment arrives.
  useEffect(() => {
    if (tick === 0) return;
    const t = setTimeout(
      () => setAddresses((prev) => prev.map((a, i) => (i === slot ? randomAddress() : a))),
      900,
    );
    return () => clearTimeout(t);
  }, [tick, slot]);

  const path = (y: number) => `M128 170 C 200 170, 214 ${y + 18}, 288 ${y + 18}`;

  return (
    <figure className="hero-visual" aria-label="An agent paying four different one-time addresses">
      <svg viewBox="0 0 440 340" role="img">
        <defs>
          <linearGradient id="hv-line" x1="0" x2="1">
            <stop offset="0" stopColor="var(--accent-2)" stopOpacity="0.15" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0.6" />
          </linearGradient>
          <radialGradient id="hv-glow">
            <stop offset="0" stopColor="var(--accent)" stopOpacity="0.9" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {SLOTS.map((y) => (
          <path key={y} d={path(y)} fill="none" stroke="url(#hv-line)" strokeWidth="1.5" strokeDasharray="3 5" />
        ))}

        {tick > 0 && (
          <g key={tick}>
            <circle r="10" fill="url(#hv-glow)">
              <animateMotion dur="0.9s" fill="freeze" path={path(SLOTS[slot])} keySplines="0.4 0 0.2 1" calcMode="spline" keyTimes="0;1" />
            </circle>
            <circle r="3.5" fill="var(--accent)">
              <animateMotion dur="0.9s" fill="freeze" path={path(SLOTS[slot])} keySplines="0.4 0 0.2 1" calcMode="spline" keyTimes="0;1" />
            </circle>
          </g>
        )}

        <g className="hv-agent">
          <rect x="24" y="146" width="104" height="48" rx="14" />
          <circle cx="50" cy="170" r="9" className="hv-agent-dot" />
          <text x="68" y="175">agent</text>
        </g>

        {SLOTS.map((y, i) => (
          <g key={y} className={`hv-addr ${i === slot && tick > 0 ? 'fresh' : ''}`}>
            <rect x="288" y={y} width="136" height="36" rx="10" />
            <text key={addresses[i]} x="356" y={y + 23} textAnchor="middle">
              {addresses[i]}
            </text>
          </g>
        ))}
      </svg>
      <figcaption>Every payment, a new address. Only the seller can link them.</figcaption>
    </figure>
  );
}
