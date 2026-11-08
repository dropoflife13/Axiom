'use client';

import * as React from 'react';

export interface AxiomLogoProps {
  size?: number;
  variant?: 'mark' | 'icon' | 'lockup' | 'mono' | 'duo';
  title?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function AxiomLogo({
  size = 32,
  variant = 'mark',
  title = 'Axiom',
  className,
  style,
}: AxiomLogoProps) {
  let src = '/brand/axiom-mark.svg';
  let width = size;
  let height = size;

  if (variant === 'icon') {
    src = '/brand/axiom-icon.svg';
  } else if (variant === 'lockup') {
    src = '/brand/axiom-wordmark.svg';
    width = Math.round(size * 3.125); // 800:256 aspect ratio
  }

  return (
    <img
      src={src}
      width={width}
      height={height}
      alt={title}
      className={className}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

export default AxiomLogo;
