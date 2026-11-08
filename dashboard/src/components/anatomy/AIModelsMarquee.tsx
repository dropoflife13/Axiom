'use client';

import React from 'react';

interface AIModel {
  name: string;
  provider: string;
  badge: string;
  color: string;
  accent: string;
  icon: React.ReactNode;
}

const AI_MODELS_ROW_1: AIModel[] = [
  {
    name: 'Nemotron 3 Ultra',
    provider: 'NVIDIA',
    badge: '550B · FLAGSHIP',
    color: '#76b900',
    accent: 'rgba(118, 185, 0, 0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="#76b900" width="18" height="18" aria-hidden="true">
        <path d="M9.75 6.25c-2.45 0-4.45 2-4.45 4.45 0 1.95 1.25 3.6 3 4.2v-1.5c-1-.5-1.7-1.5-1.7-2.7 0-1.65 1.35-3 3-3 .9 0 1.7.4 2.2 1.1l1.1-1.1c-.8-1-2-1.45-3.15-1.45zm0-3c-4.1 0-7.45 3.35-7.45 7.45 0 3.3 2.15 6.1 5.15 7.1v-1.6c-2.2-.9-3.7-3-3.7-5.5 0-3.25 2.65-5.9 5.9-5.9 1.8 0 3.4.8 4.45 2.1l1.15-1.15C13.8 4.1 11.9 3.25 9.75 3.25zm0-3.25C4.35 0 0 4.35 0 9.75c0 4.5 3.1 8.3 7.3 9.4v-1.6c-3.35-1.05-5.75-4.15-5.75-7.8 0-4.55 3.7-8.25 8.25-8.25 2.5 0 4.7 1.1 6.2 2.85l1.2-1.2C15.35 1.25 12.7 0 9.75 0zm6.5 9.75c0 3.55-2.9 6.45-6.45 6.45v1.5c4.4 0 7.95-3.55 7.95-7.95s-3.55-7.95-7.95-7.95v1.5c3.55 0 6.45 2.9 6.45 6.45z" />
      </svg>
    ),
  },
  {
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    badge: '200K · REASONING',
    color: '#d97706',
    accent: 'rgba(217, 119, 6, 0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="#d97706" width="18" height="18" aria-hidden="true">
        <path d="M13.827 3.5h3.696L24 20.5h-3.696l-1.575-3.682H11.75L13.827 3.5zm3.178 10.364L15.674 8.73l-1.332 5.134h2.663zM3.696 20.5H0L6.477 3.5h3.696L3.696 20.5z" />
      </svg>
    ),
  },
  {
    name: 'GPT-4o & o1',
    provider: 'OpenAI',
    badge: '128K · OMNI',
    color: '#10a37f',
    accent: 'rgba(16, 163, 127, 0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="#10a37f" width="18" height="18" aria-hidden="true">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 8.79a4.475 4.475 0 0 1 2.362-1.983V12.4a.79.79 0 0 0 .394.678l5.84 3.37-2.02 1.168a.078.078 0 0 1-.072 0L4.01 14.838A4.503 4.503 0 0 1 2.34 8.79zm16.037 3.565L12.534 8.98l2.02-1.168a.078.078 0 0 1 .072 0l4.834 2.79a4.498 4.498 0 0 1-.68 8.077v-5.597a.79.79 0 0 0-.395-.678zm2.023-4.526l-.142-.085-4.783-2.76a.77.77 0 0 0-.78 0L8.855 8.353V6.021a.08.08 0 0 1 .033-.062l4.84-2.792a4.504 4.504 0 0 1 6.672 4.662zm-9.864 5.485L7.697 11.69l4.84-2.793 2.84 1.639v5.586l-4.84 2.794z" />
      </svg>
    ),
  },
  {
    name: 'Llama 3.3',
    provider: 'Meta',
    badge: '70B · OPEN CORE',
    color: '#38bdf8',
    accent: 'rgba(56, 189, 248, 0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="#38bdf8" width="18" height="18" aria-hidden="true">
        <path d="M12 2C6.477 2 2 6.477 2 12c0 2.228.729 4.288 1.96 5.955C4.858 16.48 6.477 15.2 8.3 14.5c.34-.13.7-.22 1.07-.28-.56-.63-.97-1.42-1.19-2.31C7.62 9.7 8.65 7.6 10.5 7.08c1.85-.52 3.8.35 4.54 2.05.37.84.42 1.77.14 2.65-.24.75-.68 1.4-1.25 1.89.37.06.73.15 1.07.28 1.823.7 3.442 1.98 4.34 3.455C21.271 16.288 22 14.228 22 12c0-5.523-4.477-10-10-10z" />
      </svg>
    ),
  },
  {
    name: 'Gemini 1.5 Pro',
    provider: 'Google',
    badge: '2M CONTEXT',
    color: '#4285f4',
    accent: 'rgba(66, 133, 244, 0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="#4285f4" width="18" height="18" aria-hidden="true">
        <path d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12z" />
      </svg>
    ),
  },
  {
    name: 'DeepSeek-V3',
    provider: 'DeepSeek',
    badge: '671B MoE',
    color: '#3b82f6',
    accent: 'rgba(59, 130, 246, 0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="#3b82f6" width="18" height="18" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v-.07zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.4z" />
      </svg>
    ),
  },
];

const AI_MODELS_ROW_2: AIModel[] = [
  {
    name: 'Qwen 3.8 & 2.5',
    provider: 'Alibaba Cloud',
    badge: '27B · 32B CODER',
    color: '#a855f7',
    accent: 'rgba(168, 85, 247, 0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="#a855f7" width="18" height="18" aria-hidden="true">
        <path d="M12 1.5L3 6.75v10.5L12 22.5l9-5.25V6.75L12 1.5zm0 2.6l6.75 3.94v7.88L12 19.86l-6.75-3.94V8.04L12 4.1zM7.5 9.75l4.5-2.62 4.5 2.62v4.5l-4.5 2.62-4.5-2.62v-4.5z" />
      </svg>
    ),
  },
  {
    name: 'Codestral 2501',
    provider: 'Mistral AI',
    badge: '256K · INFILL',
    color: '#f97316',
    accent: 'rgba(249, 115, 22, 0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="#f97316" width="18" height="18" aria-hidden="true">
        <path d="M3 3h3.6v3.6H3zm14.4 0H21v3.6h-3.6zM3 6.6h7.2v3.6H3zm10.8 0H21v3.6h-7.2zM3 10.2h18v3.6H3zm3.6 3.6h10.8v3.6H6.6zm3.6 3.6h3.6V21h-3.6z" />
      </svg>
    ),
  },
  {
    name: 'Gemma 4 31B',
    provider: 'Google DeepMind',
    badge: '31B · BASELINE',
    color: '#8ab4f8',
    accent: 'rgba(138, 180, 248, 0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="#8ab4f8" width="18" height="18" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm-1 15h-2v-6h2zm0-8h-2V7h2z" />
      </svg>
    ),
  },
  {
    name: 'Groq LPU',
    provider: 'Groq',
    badge: '750 TOK/S',
    color: '#f55036',
    accent: 'rgba(245, 80, 54, 0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="#f55036" width="18" height="18" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V13h2.5a.5.5 0 0 0 .35-.85L11.35 7.65a.5.5 0 0 0-.85.35V11H8a.5.5 0 0 0-.35.85l4.5 4.5a.5.5 0 0 0 .85-.42z" />
      </svg>
    ),
  },
  {
    name: 'Command R+',
    provider: 'Cohere',
    badge: '128K · RAG CORE',
    color: '#14b8a6',
    accent: 'rgba(20, 184, 166, 0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="#14b8a6" width="18" height="18" aria-hidden="true">
        <path d="M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.24L19.2 8 12 12 4.8 8 12 4.24zM4.5 9.53l6.5 3.61v7.22l-6.5-3.61V9.53zm8.5 10.83v-7.22l6.5-3.61v7.22l-6.5 3.61z" />
      </svg>
    ),
  },
  {
    name: 'OpenRouter',
    provider: 'Unified Gateway',
    badge: '300+ MODELS',
    color: '#6366f1',
    accent: 'rgba(99, 102, 241, 0.15)',
    icon: (
      <svg viewBox="0 0 24 24" fill="#6366f1" width="18" height="18" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V13h2.5a.5.5 0 0 0 .35-.85L11.35 7.65a.5.5 0 0 0-.85.35V11H8a.5.5 0 0 0-.35.85l4.5 4.5a.5.5 0 0 0 .85-.42z" />
      </svg>
    ),
  },
];

export function AIModelsMarquee() {
  // Seamless loop by duplicating items
  const row1Loop = [...AI_MODELS_ROW_1, ...AI_MODELS_ROW_1];
  const row2Loop = [...AI_MODELS_ROW_2, ...AI_MODELS_ROW_2];

  return (
    <div className="aim-marquee-container" aria-label="AI Models & Provider Ecosystem Marquee">
      {/* Track 1: Top Tier Flagships (Moving Left) */}
      <div className="aim-marquee-row">
        <div className="aim-marquee-track aim-marquee-track--left">
          {row1Loop.map((model, idx) => (
            <div
              key={`m1-${idx}`}
              className="aim-pill"
              style={{ '--brand-color': model.color, '--brand-accent': model.accent } as React.CSSProperties}
            >
              <span className="aim-pill-icon">{model.icon}</span>
              <div className="aim-pill-text">
                <span className="aim-pill-name">{model.name}</span>
                <span className="aim-pill-provider">{model.provider}</span>
              </div>
              <span className="aim-pill-badge">{model.badge}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Track 2: Specialized & Inference Engines (Moving Right) */}
      <div className="aim-marquee-row">
        <div className="aim-marquee-track aim-marquee-track--right">
          {row2Loop.map((model, idx) => (
            <div
              key={`m2-${idx}`}
              className="aim-pill"
              style={{ '--brand-color': model.color, '--brand-accent': model.accent } as React.CSSProperties}
            >
              <span className="aim-pill-icon">{model.icon}</span>
              <div className="aim-pill-text">
                <span className="aim-pill-name">{model.name}</span>
                <span className="aim-pill-provider">{model.provider}</span>
              </div>
              <span className="aim-pill-badge">{model.badge}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
