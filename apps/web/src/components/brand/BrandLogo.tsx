'use client';

import React from 'react';

export const BRAND_NAME = 'ChambaPulse';
export const BRAND_TAGLINE = 'Prácticas Perú';

export interface BrandMarkProps {
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<BrandMarkProps['size']>, string> = {
  xs: 'h-5 w-5',
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
};

/**
 * Custom ChambaPulse geometric vector emblem:
 * Andean Chakana stepped cross paired with a Peruvian crimson & cobalt compass needle.
 */
export function BrandMark({ size = 'md', className = '' }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={`${SIZE_CLASSES[size]} shrink-0 ${className}`.trim()}
    >
      <rect width="64" height="64" rx="16" fill="#FFFFFF" />
      <rect
        x="3"
        y="3"
        width="58"
        height="58"
        rx="14"
        stroke="#2563EB"
        strokeWidth="5"
      />
      <path
        d="M25 13H32V51H25V44H19V38H13V26H19V20H25V13Z"
        fill="#2563EB"
      />
      <path
        d="M32 13H39V20H45V26H51V38H45V44H39V51H32V13Z"
        fill="#0F172A"
      />
      <path
        d="M47.5 16.5L36.8 36.2L16.5 47.5L27.2 27.8L47.5 16.5Z"
        fill="#FFFFFF"
      />
      <path
        d="M45.5 18.5L35.4 35.1L28.9 28.6L45.5 18.5Z"
        fill="#DC2626"
      />
      <path
        d="M18.5 45.5L28.9 28.6L35.4 35.1L18.5 45.5Z"
        fill="#1E3A8A"
      />
      <circle
        cx="32"
        cy="32"
        r="3"
        fill="#FFFFFF"
        stroke="#0F172A"
        strokeWidth="1.5"
      />
    </svg>
  );
}
