'use client';

// ─── Logo resmi SAPA Smart AI — Kab. Aceh Tengah (inline, tanpa network) ───
// Motif: punggung gunung Gayo (dua puncak + fajar emas), riak Danau Laut
// Tawar, biji kopi arabika. File statis identik: public/brand/logo-mark.svg.
// id gradient memakai useId agar aman dirender berkali-kali dalam satu halaman.

import { useId } from 'react';

export function LogoMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const gid = `lgmBg-${uid}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Logo SAPA Smart AI Aceh Tengah"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10221A" />
          <stop offset="0.55" stopColor="#1B4332" />
          <stop offset="1" stopColor="#244B38" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill={`url(#${gid})`} />
      <circle cx="43" cy="19" r="8.5" fill="#D4A853" />
      <circle cx="43" cy="19" r="8.5" fill="none" stroke="#8A6E1D" strokeOpacity="0.35" strokeWidth="1" />
      <path d="M6 46 L22 18 L34 46 Z" fill="#1E3A2C" />
      <path d="M22 18 L34 46 L27 46 L19 26 Z" fill="#27513D" opacity="0.85" />
      <path d="M22 46 L39 14 L56 46 Z" fill="#2D6A4F" />
      <path d="M39 14 L56 46 L48 46 L36 22 Z" fill="#35785A" opacity="0.8" />
      <path d="M39 14 L43.4 22 L39 20 L34.6 22 Z" fill="#D4A853" />
      <path d="M10 50 q4 -3 8 0 t8 0" fill="none" stroke="#9BC7B8" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M28 53.5 q4 -3 8 0 t8 0 t8 0" fill="none" stroke="#7FB5A8" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M14 57 q4 -3 8 0 t8 0 t8 0" fill="none" stroke="#D4A853" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />
      <g transform="translate(48 52) rotate(28)">
        <ellipse rx="4.2" ry="3" fill="#D4A853" />
        <path d="M0 -2.8 Q 1.6 0 0 2.8" fill="none" stroke="#8A6E1D" strokeWidth="1.1" strokeLinecap="round" />
      </g>
    </svg>
  );
}
