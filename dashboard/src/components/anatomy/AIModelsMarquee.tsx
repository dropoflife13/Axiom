'use client';

import React from 'react';

interface AIModelIcon {
  name: string;
  provider: string;
  color: string;
  icon: React.ReactNode;
}

// ---------------------------------------------------------------------------
// TRACK 1: 18 UNIQUE FRONTIER FOUNDATION & REASONING MODELS
// ---------------------------------------------------------------------------
const ROW_1_ICONS: AIModelIcon[] = [
  {
    name: 'NVIDIA Nemotron',
    provider: 'NVIDIA',
    color: '#76b900',
    icon: (
      <svg viewBox="0 0 24 24" fill="#76b900" width="36" height="36" aria-label="NVIDIA Nemotron">
        <path d="M9.75 6.25c-2.45 0-4.45 2-4.45 4.45 0 1.95 1.25 3.6 3 4.2v-1.5c-1-.5-1.7-1.5-1.7-2.7 0-1.65 1.35-3 3-3 .9 0 1.7.4 2.2 1.1l1.1-1.1c-.8-1-2-1.45-3.15-1.45zm0-3c-4.1 0-7.45 3.35-7.45 7.45 0 3.3 2.15 6.1 5.15 7.1v-1.6c-2.2-.9-3.7-3-3.7-5.5 0-3.25 2.65-5.9 5.9-5.9 1.8 0 3.4.8 4.45 2.1l1.15-1.15C13.8 4.1 11.9 3.25 9.75 3.25zm0-3.25C4.35 0 0 4.35 0 9.75c0 4.5 3.1 8.3 7.3 9.4v-1.6c-3.35-1.05-5.75-4.15-5.75-7.8 0-4.55 3.7-8.25 8.25-8.25 2.5 0 4.7 1.1 6.2 2.85l1.2-1.2C15.35 1.25 12.7 0 9.75 0zm6.5 9.75c0 3.55-2.9 6.45-6.45 6.45v1.5c4.4 0 7.95-3.55 7.95-7.95s-3.55-7.95-7.95-7.95v1.5c3.55 0 6.45 2.9 6.45 6.45z" />
      </svg>
    ),
  },
  {
    name: 'Anthropic Claude',
    provider: 'Anthropic',
    color: '#d97706',
    icon: (
      <svg viewBox="0 0 24 24" fill="#d97706" width="36" height="36" aria-label="Anthropic Claude">
        <path d="M13.827 3.5h3.696L24 20.5h-3.696l-1.575-3.682H11.75L13.827 3.5zm3.178 10.364L15.674 8.73l-1.332 5.134h2.663zM3.696 20.5H0L6.477 3.5h3.696L3.696 20.5z" />
      </svg>
    ),
  },
  {
    name: 'OpenAI GPT-4o & o1',
    provider: 'OpenAI',
    color: '#10a37f',
    icon: (
      <svg viewBox="0 0 24 24" fill="#10a37f" width="36" height="36" aria-label="OpenAI">
        <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 8.79a4.475 4.475 0 0 1 2.362-1.983V12.4a.79.79 0 0 0 .394.678l5.84 3.37-2.02 1.168a.078.078 0 0 1-.072 0L4.01 14.838A4.503 4.503 0 0 1 2.34 8.79zm16.037 3.565L12.534 8.98l2.02-1.168a.078.078 0 0 1 .072 0l4.834 2.79a4.498 4.498 0 0 1-.68 8.077v-5.597a.79.79 0 0 0-.395-.678zm2.023-4.526l-.142-.085-4.783-2.76a.77.77 0 0 0-.78 0L8.855 8.353V6.021a.08.08 0 0 1 .033-.062l4.84-2.792a4.504 4.504 0 0 1 6.672 4.662zm-9.864 5.485L7.697 11.69l4.84-2.793 2.84 1.639v5.586l-4.84 2.794z" />
      </svg>
    ),
  },
  {
    name: 'Meta Llama 3.3',
    provider: 'Meta',
    color: '#38bdf8',
    icon: (
      <svg viewBox="0 0 24 24" fill="#38bdf8" width="36" height="36" aria-label="Meta Llama 3.3">
        <path d="M12 2C6.477 2 2 6.477 2 12c0 2.228.729 4.288 1.96 5.955C4.858 16.48 6.477 15.2 8.3 14.5c.34-.13.7-.22 1.07-.28-.56-.63-.97-1.42-1.19-2.31C7.62 9.7 8.65 7.6 10.5 7.08c1.85-.52 3.8.35 4.54 2.05.37.84.42 1.77.14 2.65-.24.75-.68 1.4-1.25 1.89.37.06.73.15 1.07.28 1.823.7 3.442 1.98 4.34 3.455C21.271 16.288 22 14.228 22 12c0-5.523-4.477-10-10-10z" />
      </svg>
    ),
  },
  {
    name: 'Google Gemini',
    provider: 'Google DeepMind',
    color: '#4285f4',
    icon: (
      <svg viewBox="0 0 24 24" fill="#4285f4" width="36" height="36" aria-label="Google Gemini">
        <path d="M12 0C12 6.627 6.627 12 0 12c6.627 0 12 5.373 12 12 0-6.627 5.373-12 12-12-6.627 0-12-5.373-12-12z" />
      </svg>
    ),
  },
  {
    name: 'DeepSeek V3 / R1',
    provider: 'DeepSeek AI',
    color: '#3b82f6',
    icon: (
      <svg viewBox="0 0 24 24" fill="#3b82f6" width="36" height="36" aria-label="DeepSeek V3 / R1">
        <path d="M12 2.5c-4.8 0-8.8 3.5-9.6 8.2C1.6 15 5 19.5 9.5 21.2c.8.3 1.5.1 2-.4l2-2.1c.3-.3.8-.4 1.2-.2 2.2 1 4.7.7 6.6-.7 1.8-1.4 2.7-3.7 2.3-6-1-4.8-5.3-8.8-10.4-9.3-.4 0-.8 0-1.2 0zm5.2 6.5c.7 0 1.3.6 1.3 1.3s-.6 1.3-1.3 1.3-1.3-.6-1.3-1.3.6-1.3 1.3-1.3zm-6.7 4.2c2.1 0 4.1.8 5.6 2.2l-.9.9c-1.2-1.1-2.9-1.8-4.7-1.8-1.8 0-3.4.6-4.7 1.8l-.9-.9c1.5-1.4 3.5-2.2 5.6-2.2z" />
      </svg>
    ),
  },
  {
    name: 'Zhipu GLM-5.3',
    provider: 'Zhipu AI',
    color: '#2dd4bf',
    icon: (
      <svg viewBox="0 0 24 24" fill="#2dd4bf" width="36" height="36" aria-label="Zhipu GLM-5.3">
        <path d="M12 2a10 10 0 0 0-8.66 15l2.6-1.5A7 7 0 1 1 12 19v3a10 10 0 1 0 0-20zm0 5a5 5 0 0 0-4.33 7.5l2.6-1.5A2 2 0 1 1 12 14v3a5 5 0 1 0 0-10z" />
      </svg>
    ),
  },
  {
    name: 'xAI Grok',
    provider: 'xAI',
    color: '#f8fafc',
    icon: (
      <svg viewBox="0 0 24 24" fill="#f8fafc" width="36" height="36" aria-label="xAI Grok">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    name: 'Microsoft Copilot',
    provider: 'Microsoft',
    color: '#00a4ef',
    icon: (
      <svg viewBox="0 0 24 24" fill="#00a4ef" width="36" height="36" aria-label="Microsoft Copilot">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 14.93V19h-2v-2.07c-2.8-.48-4.93-2.61-5.41-5.41H3v-2h2.59c.48-2.8 2.61-4.93 5.41-5.41V2h2v2.09c2.8.48 4.93 2.61 5.41 5.41H21v2h-2.59c-.48 2.8-2.61 4.93-5.41 5.43zM12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z" />
      </svg>
    ),
  },
  {
    name: 'Apple Intelligence',
    provider: 'Apple',
    color: '#ec4899',
    icon: (
      <svg viewBox="0 0 24 24" fill="#ec4899" width="36" height="36" aria-label="Apple Intelligence">
        <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8.009 8.009 0 0 1-8 8zm0-13a5 5 0 1 0 5 5 5.006 5.006 0 0 0-5-5zm0 8a3 3 0 1 1 3-3 3 3 0 0 1-3 3z" />
      </svg>
    ),
  },
  {
    name: 'Perplexity AI',
    provider: 'Perplexity',
    color: '#14b8a6',
    icon: (
      <svg viewBox="0 0 24 24" fill="#14b8a6" width="36" height="36" aria-label="Perplexity AI">
        <path d="M12 2L4 7v10l8 5 8-5V7l-8-5zm0 2.5l6 3.75v3.25l-6-3.75-6 3.75V8.25l6-3.75zM6 15.25v-2.5l6 3.75v5l-6-3.75v-2.5zm12 0l-6 3.75v-5l6-3.75v5z" />
      </svg>
    ),
  },
  {
    name: 'Amazon Bedrock Nova',
    provider: 'AWS',
    color: '#f59e0b',
    icon: (
      <svg viewBox="0 0 24 24" fill="#f59e0b" width="36" height="36" aria-label="Amazon Bedrock Nova">
        <path d="M12 1.5l2.6 6.7 6.9 1.5-5.2 4.6 1.6 6.9L12 17.5l-5.9 3.7 1.6-6.9-5.2-4.6 6.9-1.5z" />
      </svg>
    ),
  },
  {
    name: 'Mistral AI Large',
    provider: 'Mistral AI',
    color: '#ff7000',
    icon: (
      <svg viewBox="0 0 24 24" fill="#ff7000" width="36" height="36" aria-label="Mistral AI Large">
        <path d="M3 4h4v3H3zm14 0h4v3h-4zm-7 4h4v3h-4zm-7 4h4v3H3zm7 0h4v3h-4zm7 0h4v3h-4zm-14 4h4v4H3zm7 0h4v4h-4zm7 0h4v4h-4z" />
      </svg>
    ),
  },
  {
    name: 'Cohere Command R+',
    provider: 'Cohere',
    color: '#059669',
    icon: (
      <svg viewBox="0 0 24 24" fill="#059669" width="36" height="36" aria-label="Cohere Command R+">
        <path d="M12 2a10 10 0 1 0 10 10A10.011 10.011 0 0 0 12 2zm1 14.5h-2v-4h-2v-2h4v6zm0-8h-2V6.5h2V8.5z" />
        <path d="M7 12a5 5 0 0 1 8.54-3.54l1.41-1.41A7 7 0 1 0 12 19v-2a5 5 0 0 1-5-5z" opacity="0.6" />
      </svg>
    ),
  },
  {
    name: '01.AI Yi-Lightning',
    provider: '01.AI',
    color: '#0ea5e9',
    icon: (
      <svg viewBox="0 0 24 24" fill="#0ea5e9" width="36" height="36" aria-label="01.AI Yi-Lightning">
        <path d="M13 2L3 14h8l-2 8 12-13h-8l2-7z" />
      </svg>
    ),
  },
  {
    name: 'Moonshot AI Kimi',
    provider: 'Moonshot AI',
    color: '#818cf8',
    icon: (
      <svg viewBox="0 0 24 24" fill="#818cf8" width="36" height="36" aria-label="Moonshot AI Kimi">
        <path d="M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8A9.006 9.006 0 0 0 12 3zm4.5 1.5l.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3.9-1.8z" />
      </svg>
    ),
  },
  {
    name: 'Baichuan AI',
    provider: 'Baichuan',
    color: '#ef4444',
    icon: (
      <svg viewBox="0 0 24 24" fill="#ef4444" width="36" height="36" aria-label="Baichuan AI">
        <path d="M12 2C8 6 4 10 4 14.5a8 8 0 0 0 16 0C20 10 16 6 12 2zm0 18a5.5 5.5 0 0 1-5.5-5.5c0-3 2.5-6 5.5-9 3 3 5.5 6 5.5 9A5.5 5.5 0 0 1 12 20zm-1-8a3 3 0 0 0-3 3 1 1 0 0 0 2 0 1 1 0 0 1 1-1 1 1 0 0 0 0-2z" />
      </svg>
    ),
  },
  {
    name: 'Reka AI Core',
    provider: 'Reka AI',
    color: '#a855f7',
    icon: (
      <svg viewBox="0 0 24 24" fill="#a855f7" width="36" height="36" aria-label="Reka AI Core">
        <path d="M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.24L18.76 8 12 11.76 5.24 8 12 4.24zM5 9.47l6 3.33v6.73l-6-3.33V9.47zm14 6.73l-6 3.33v-6.73l6-3.33v6.73z" />
      </svg>
    ),
  },
];

// ---------------------------------------------------------------------------
// TRACK 2: 18 UNIQUE ACCELERATORS, RUNTIMES & SPECIALIZED MODELS
// ---------------------------------------------------------------------------
const ROW_2_ICONS: AIModelIcon[] = [
  {
    name: 'Alibaba Qwen 3.8',
    provider: 'Alibaba Cloud',
    color: '#a855f7',
    icon: (
      <svg viewBox="0 0 24 24" fill="#a855f7" width="36" height="36" aria-label="Alibaba Qwen 3.8">
        <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2zm0 2.5L5.34 8.5v7L12 19.5l6.66-4v-7L12 4.5zM12 7l4.33 2.5v5L12 17l-4.33-2.5v-5L12 7z" />
      </svg>
    ),
  },
  {
    name: 'Mistral Codestral',
    provider: 'Mistral AI',
    color: '#f97316',
    icon: (
      <svg viewBox="0 0 24 24" fill="#f97316" width="36" height="36" aria-label="Mistral Codestral">
        <path d="M8.5 5.5l-5 5 5 5 1.5-1.5-3.5-3.5 3.5-3.5-1.5-1.5zm7 0l-1.5 1.5 3.5 3.5-3.5 3.5 1.5 1.5 5-5-5-5zM13 3l-4 18h2l4-18h-2z" />
      </svg>
    ),
  },
  {
    name: 'Google Gemma 2',
    provider: 'Google DeepMind',
    color: '#6366f1',
    icon: (
      <svg viewBox="0 0 24 24" fill="#6366f1" width="36" height="36" aria-label="Google Gemma 2">
        <path d="M12 2L4 8l3 13h10l3-13-8-6zm0 2.4l5.3 4H6.7L12 4.4zm-6.2 5.6h12.4l-2.1 9.2H7.9L5.8 10z" />
      </svg>
    ),
  },
  {
    name: 'Groq LPU',
    provider: 'Groq',
    color: '#f55036',
    icon: (
      <svg viewBox="0 0 24 24" fill="#f55036" width="36" height="36" aria-label="Groq LPU">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-12h4v2h-4zm0 3h5v2h-5zm0 3h3v2h-3z" />
      </svg>
    ),
  },
  {
    name: 'Cerebras CS-3',
    provider: 'Cerebras Systems',
    color: '#eab308',
    icon: (
      <svg viewBox="0 0 24 24" fill="#eab308" width="36" height="36" aria-label="Cerebras CS-3">
        <path d="M4 4h4v4H4V4zm6 0h4v4h-4V4zm6 0h4v4h-4V4zM4 10h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4zM4 16h4v4H4v-4zm6 0h4v4h-4v-4zm6 0h4v4h-4v-4z" />
      </svg>
    ),
  },
  {
    name: 'Hugging Face',
    provider: 'Hugging Face',
    color: '#ffd21e',
    icon: (
      <svg viewBox="0 0 24 24" fill="#ffd21e" width="36" height="36" aria-label="Hugging Face">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-3.5 7c.83 0 1.5.67 1.5 1.5S9.33 12 8.5 12 7 11.33 7 10.5 7.67 9 8.5 9zm7 0c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5zm-3.5 9.5c-2.33 0-4.31-1.46-5.11-3.5h10.22c-.8 2.04-2.78 3.5-5.11 3.5z" />
      </svg>
    ),
  },
  {
    name: 'Together AI',
    provider: 'Together AI',
    color: '#c084fc',
    icon: (
      <svg viewBox="0 0 24 24" fill="#c084fc" width="36" height="36" aria-label="Together AI">
        <path d="M8.5 5A6.5 6.5 0 0 0 2 11.5 6.5 6.5 0 0 0 8.5 18a6.47 6.47 0 0 0 3.5-1.02A6.47 6.47 0 0 0 15.5 18 6.5 6.5 0 0 0 22 11.5 6.5 6.5 0 0 0 15.5 5a6.47 6.47 0 0 0-3.5 1.02A6.47 6.47 0 0 0 8.5 5zm0 2.5c1.4 0 2.65.65 3.47 1.66A6.44 6.44 0 0 0 10 11.5c0 .82.16 1.6.45 2.32A4.01 4.01 0 0 1 8.5 15.5 4 4 0 0 1 4.5 11.5 4 4 0 0 1 8.5 7.5zm7 0a4 4 0 0 1 4 4 4 4 0 0 1-4 4 4.01 4.01 0 0 1-1.95-1.68c.29-.72.45-1.5.45-2.32 0-.82-.16-1.6-.47-2.34A4.01 4.01 0 0 1 15.5 7.5z" />
      </svg>
    ),
  },
  {
    name: 'Fireworks AI',
    provider: 'Fireworks AI',
    color: '#f43f5e',
    icon: (
      <svg viewBox="0 0 24 24" width="36" height="36" aria-label="Fireworks AI">
        <path d="M12 2v4m0 12v4M2 12h4m12 0h4m-3.05-6.95l-2.83 2.83m-8.24 8.24l-2.83 2.83m0-13.9l2.83 2.83m8.24 8.24l2.83 2.83" stroke="#f43f5e" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <circle cx="12" cy="12" r="3" fill="#f43f5e" />
      </svg>
    ),
  },
  {
    name: 'Stability AI',
    provider: 'Stability AI',
    color: '#fb7185',
    icon: (
      <svg viewBox="0 0 24 24" fill="#fb7185" width="36" height="36" aria-label="Stability AI">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 3.08a8.03 8.03 0 0 1 5.92 5.92L14.7 13.5 13 8.08V5.08zM5.08 11A8.03 8.03 0 0 1 11 5.08V8.1L9.3 13.5 5.08 11zm5.92 7.92A8.03 8.03 0 0 1 5.08 13L9.3 10.5 11 15.9v3.02zm2 0V15.9l1.7-5.4 4.22 2.5a8.03 8.03 0 0 1-5.92 5.92z" />
      </svg>
    ),
  },
  {
    name: 'Replicate',
    provider: 'Replicate',
    color: '#06b6d4',
    icon: (
      <svg viewBox="0 0 24 24" fill="#06b6d4" width="36" height="36" aria-label="Replicate">
        <path d="M3 5h18v3H3V5zm0 5h14v3H3v-3zm0 5h10v3H3v-3z" />
      </svg>
    ),
  },
  {
    name: 'Ollama Local',
    provider: 'Ollama',
    color: '#cbd5e1',
    icon: (
      <svg viewBox="0 0 24 24" fill="#cbd5e1" width="36" height="36" aria-label="Ollama Local">
        <path d="M8 3a3 3 0 0 0-3 3v2a3 3 0 0 0 1.2 2.4L5 17h3l.8-4.5A4 4 0 0 0 12 14a4 4 0 0 0 3.2-1.5L16 17h3l-1.2-6.6A3 3 0 0 0 19 8V6a3 3 0 0 0-3-3h-1a3 3 0 0 0-3 3v1h-2V6a3 3 0 0 0-3-3H8zm1 3a1 1 0 0 1 1-1h1v3H9V6zm6-1a1 1 0 0 1 1 1v2h-1V6a1 1 0 0 1 0-1z" />
      </svg>
    ),
  },
  {
    name: 'vLLM Engine',
    provider: 'vLLM Project',
    color: '#38bdf8',
    icon: (
      <svg viewBox="0 0 24 24" fill="#38bdf8" width="36" height="36" aria-label="vLLM Engine">
        <path d="M3 4l7 16h4l7-16h-4l-5 12-5-12H3zm6 3l3 7.5L15 7h2.5l-4.5 11h-2L6.5 7H9z" />
      </svg>
    ),
  },
  {
    name: 'TensorRT-LLM',
    provider: 'NVIDIA',
    color: '#84cc16',
    icon: (
      <svg viewBox="0 0 24 24" fill="#84cc16" width="36" height="36" aria-label="TensorRT-LLM">
        <path d="M12 2L2 12l10 10 10-10L12 2zm0 4.5l5.5 5.5-5.5 5.5-5.5-5.5L12 6.5zM12 9l-3 3 3 3 3-3-3-3z" />
      </svg>
    ),
  },
  {
    name: 'SGLang Engine',
    provider: 'LMSYS',
    color: '#10b981',
    icon: (
      <svg viewBox="0 0 24 24" fill="#10b981" width="36" height="36" aria-label="SGLang Engine">
        <path d="M4 4h4v4H4V4zm12 0h4v4h-4V4zM4 16h4v4H4v-4zm12 0h4v4h-4v-4z" />
        <path d="M8 6h8M6 8v8m12-8v8M8 18h8m-4-10v8" stroke="#10b981" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="12" cy="12" r="2.5" fill="#10b981" />
      </svg>
    ),
  },
  {
    name: 'OpenRouter',
    provider: 'OpenRouter',
    color: '#818cf8',
    icon: (
      <svg viewBox="0 0 24 24" fill="#818cf8" width="36" height="36" aria-label="OpenRouter">
        <circle cx="12" cy="12" r="3.5" />
        <circle cx="4" cy="12" r="2" />
        <circle cx="20" cy="12" r="2" />
        <circle cx="12" cy="4" r="2" />
        <circle cx="12" cy="20" r="2" />
        <path d="M6 12h2.5m7 0H18M12 6v2.5m0 7V18" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: 'Anyscale Ray',
    provider: 'Anyscale',
    color: '#0284c7',
    icon: (
      <svg viewBox="0 0 24 24" fill="#0284c7" width="36" height="36" aria-label="Anyscale Ray">
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1M5.6 18.4l2.1-2.1m8.6-8.6l2.1-2.1" stroke="#0284c7" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    name: 'Modal Labs',
    provider: 'Modal',
    color: '#22c55e',
    icon: (
      <svg viewBox="0 0 24 24" fill="#22c55e" width="36" height="36" aria-label="Modal Labs">
        <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3H4V6zm0 5h16v3H4v-3zm0 5h16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3z" />
      </svg>
    ),
  },
  {
    name: 'Baseten',
    provider: 'Baseten',
    color: '#fb923c',
    icon: (
      <svg viewBox="0 0 24 24" fill="#fb923c" width="36" height="36" aria-label="Baseten">
        <path d="M6 4h4a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6V4zm0 8h5a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6v-8zm3-5v3h1a1.5 1.5 0 0 0 0-3H9zm0 8v3h2a1.5 1.5 0 0 0 0-3H9z" />
      </svg>
    ),
  },
];

export function AIModelsMarquee() {
  return (
    <div className="aim-pure-container" aria-label="AI Model Logos Marquee">
      {/* Track 1: Moving Left (Continuous, Gapless, Infinite Loop) */}
      <div className="aim-pure-row">
        <div className="aim-pure-marquee aim-pure-marquee--left">
          <div className="aim-pure-group">
            {ROW_1_ICONS.map((item, idx) => (
              <span
                key={`r1-g1-${idx}`}
                className="aim-pure-icon"
                title={`${item.name} (${item.provider})`}
                style={{ '--icon-color': item.color } as React.CSSProperties}
              >
                {item.icon}
              </span>
            ))}
          </div>
          <div className="aim-pure-group" aria-hidden="true">
            {ROW_1_ICONS.map((item, idx) => (
              <span
                key={`r1-g2-${idx}`}
                className="aim-pure-icon"
                title={`${item.name} (${item.provider})`}
                style={{ '--icon-color': item.color } as React.CSSProperties}
              >
                {item.icon}
              </span>
            ))}
          </div>
          <div className="aim-pure-group" aria-hidden="true">
            {ROW_1_ICONS.map((item, idx) => (
              <span
                key={`r1-g3-${idx}`}
                className="aim-pure-icon"
                title={`${item.name} (${item.provider})`}
                style={{ '--icon-color': item.color } as React.CSSProperties}
              >
                {item.icon}
              </span>
            ))}
          </div>
          <div className="aim-pure-group" aria-hidden="true">
            {ROW_1_ICONS.map((item, idx) => (
              <span
                key={`r1-g4-${idx}`}
                className="aim-pure-icon"
                title={`${item.name} (${item.provider})`}
                style={{ '--icon-color': item.color } as React.CSSProperties}
              >
                {item.icon}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Track 2: Moving Right (Continuous, Gapless, Infinite Loop) */}
      <div className="aim-pure-row">
        <div className="aim-pure-marquee aim-pure-marquee--right">
          <div className="aim-pure-group">
            {ROW_2_ICONS.map((item, idx) => (
              <span
                key={`r2-g1-${idx}`}
                className="aim-pure-icon"
                title={`${item.name} (${item.provider})`}
                style={{ '--icon-color': item.color } as React.CSSProperties}
              >
                {item.icon}
              </span>
            ))}
          </div>
          <div className="aim-pure-group" aria-hidden="true">
            {ROW_2_ICONS.map((item, idx) => (
              <span
                key={`r2-g2-${idx}`}
                className="aim-pure-icon"
                title={`${item.name} (${item.provider})`}
                style={{ '--icon-color': item.color } as React.CSSProperties}
              >
                {item.icon}
              </span>
            ))}
          </div>
          <div className="aim-pure-group" aria-hidden="true">
            {ROW_2_ICONS.map((item, idx) => (
              <span
                key={`r2-g3-${idx}`}
                className="aim-pure-icon"
                title={`${item.name} (${item.provider})`}
                style={{ '--icon-color': item.color } as React.CSSProperties}
              >
                {item.icon}
              </span>
            ))}
          </div>
          <div className="aim-pure-group" aria-hidden="true">
            {ROW_2_ICONS.map((item, idx) => (
              <span
                key={`r2-g4-${idx}`}
                className="aim-pure-icon"
                title={`${item.name} (${item.provider})`}
                style={{ '--icon-color': item.color } as React.CSSProperties}
              >
                {item.icon}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
