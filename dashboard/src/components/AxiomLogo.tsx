'use client';

interface AxiomLogoProps {
  size?: number;
  variant?: 'mono' | 'duo';
  title?: string;
}

export function AxiomLogo({ size = 32, variant = 'mono', title = 'Axiom' }: AxiomLogoProps) {
  const stroke = variant === 'duo' ? '#a855f7' : 'currentColor';
  const node = variant === 'duo' ? '#22d3ee' : 'currentColor';
  const titleId = title ? `axiom-logo-${size}-${variant}` : undefined;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-labelledby={titleId}
      focusable="false"
    >
      {title && <title id={titleId}>{title}</title>}
      <path d="M12.15 5.55a12 12 0 1 0 15.43 7.72" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      <path d="M12.15 5.55V2.8h7.7v2.75" stroke={stroke} strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" />
      <circle cx="25.2" cy="12.2" r="2.05" fill={node} />
    </svg>
  );
}
