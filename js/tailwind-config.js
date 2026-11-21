tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      spacing: {
        13: '3.25rem',
      },
      boxShadow: {
        'glow-cyan': '0 0 25px -4px rgba(2, 132, 199, 0.35)',
        'glow-orange': '0 0 25px -4px rgba(234, 88, 12, 0.35)',
        'glass': '0 8px 32px 0 rgba(15, 23, 42, 0.08)',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'pulse-subtle': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-glow': 'pulseGlow 2.5s ease-in-out infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { opacity: 1, filter: 'drop-shadow(0 0 8px rgba(2, 132, 199, 0.45))' },
          '50%': { opacity: 0.7, filter: 'drop-shadow(0 0 2px rgba(2, 132, 199, 0.15))' },
        },
      },
    },
  },
};
