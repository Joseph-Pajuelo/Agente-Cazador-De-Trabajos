'use client';

import React from 'react';
import { getBrand } from '@/lib/domain/companies';

interface CompanyMonogramProps {
  brandKey?: string | null;
  companyName?: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const PASTEL_PALETTE = [
  { bg: '#EFF6FF', text: '#1E3A8A', border: '#BFDBFE' }, // Navy / Blue
  { bg: '#ECFDF5', text: '#065F46', border: '#A7F3D0' }, // Emerald
  { bg: '#FEF3C7', text: '#92400E', border: '#FDE68A' }, // Amber
  { bg: '#F5F3FF', text: '#5B21B6', border: '#DDD6FE' }, // Purple
  { bg: '#FFF1F2', text: '#9F1239', border: '#FECDD3' }, // Rose
  { bg: '#F0FDFA', text: '#115E59', border: '#99F6E4' }, // Teal
  { bg: '#F8FAFC', text: '#334155', border: '#CBD5E1' }, // Slate
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function extractInitials(name?: string | null): string {
  if (!name) return 'JH';
  const cleaned = name
    .replace(/(?:S\.?A\.?C?\.?|S\.?A\.?|E\.?I\.?R\.?L\.?|Per[uú]|Lima)/gi, '')
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  if (words.length === 1 && words[0].length >= 2) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (name[0] || 'J').toUpperCase();
}

export function CompanyMonogram({
  brandKey,
  companyName,
  size = 'md',
  className = '',
}: CompanyMonogramProps) {
  const brand = React.useMemo(() => getBrand(brandKey), [brandKey]);

  const initials = React.useMemo(() => {
    if (brand?.code) {
      return brand.code.length <= 4 ? brand.code : brand.code.slice(0, 3);
    }
    return extractInitials(companyName);
  }, [brand, companyName]);

  const styleConfig = React.useMemo(() => {
    if (brand?.color && brand?.tint) {
      return {
        backgroundColor: brand.tint,
        color: brand.color,
        borderColor: brand.color + '33', // 20% opacity border
      };
    }
    const index = hashString(companyName || 'default') % PASTEL_PALETTE.length;
    const item = PASTEL_PALETTE[index];
    return {
      backgroundColor: item.bg,
      color: item.text,
      borderColor: item.border,
    };
  }, [brand, companyName]);

  const sizeClasses = {
    sm: 'h-9 w-9 text-[11px] rounded-lg',
    md: 'h-11 w-11 text-xs font-bold rounded-xl',
    lg: 'h-14 w-14 text-sm font-extrabold rounded-2xl',
  }[size];

  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center border font-bold uppercase tracking-wider select-none shadow-2xs transition-transform ${sizeClasses} ${className}`}
      style={styleConfig}
      aria-hidden="true"
    >
      <span>{initials}</span>
    </div>
  );
}
