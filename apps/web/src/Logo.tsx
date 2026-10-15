import { useId } from 'react';

/**
 * PANSA mark: a "P" whose bowl is an open orbit, with one detached point in the gap,
 * the one-time address that slips through. Same geometry as the exported logo files.
 */
export function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  const id = useId();
  return (
    <svg className={className} width={size} height={size} viewBox="28 14 76 92" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="42" y1="98" x2="90" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6366F1" />
          <stop offset="1" stopColor="#38BDF8" />
        </linearGradient>
      </defs>
      <path
        d="M42 98 V48 A24 24 0 1 1 79.77 67.66"
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="60.19" cy="71.29" r="6.76" fill="#A78BFA" />
    </svg>
  );
}

/** Custom monoline lettering: P Λ N S Λ. Uses currentColor. */
export function Wordmark({ height = 16, className }: { height?: number; className?: string }) {
  return (
    <svg className={className} height={height} viewBox="-3 -3 194 46" aria-label="PANSA" role="img">
      <g fill="none" stroke="currentColor" strokeWidth="5.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M0 40 V0 H12 A11 11 0 0 1 12 22 H0" />
        <path d="M37 40 L52 0 L67 40" />
        <path d="M80 40 V0 L106 40 V0" />
        <path d="M141.5 7 C139.5 2.6 135.8 0 130.6 0 C124.6 0 120.6 3.6 120.6 9.6 C120.6 21.4 141.6 18 141.6 30.2 C141.6 36.4 137.2 40 130.6 40 C125.2 40 121 37.4 119.4 33" />
        <path d="M155 40 L170 0 L185 40" />
      </g>
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={`logo-lockup ${className ?? ''}`}>
      <LogoMark size={26} />
      <Wordmark height={15} />
    </span>
  );
}
