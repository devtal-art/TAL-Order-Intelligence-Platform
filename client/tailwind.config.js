/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  // Preflight is OFF: this app already ships its own global reset and design
  // tokens (src/styles/base.css), applied to every screen, not just the
  // dashboard. Tailwind is being introduced scoped to the dashboard redesign
  // only — letting Preflight run would re-reset element defaults (buttons,
  // tables, headings, etc.) across every other page that was never part of
  // this task.
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      // Reuse the existing design tokens (src/styles/base.css) instead of a
      // parallel Tailwind palette, so `bg-accent`/`text-ink`/etc. stay in
      // sync with the rest of the app and dark-mode-style token changes
      // (if any, later) don't need a second place to update.
      colors: {
        accent: 'var(--accent)',
        'accent-hover': 'var(--accent-hover)',
        'accent-soft': 'var(--accent-soft)',
        'accent-border': 'var(--accent-border)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        muted: 'var(--muted)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        success: 'var(--success)',
        'success-strong': 'var(--success-strong)',
        'success-soft': 'var(--success-soft)',
        'success-border': 'var(--success-border)',
        warn: 'var(--warn)',
        'warn-icon': 'var(--warn-icon)',
        'warn-soft': 'var(--warn-soft)',
        'warn-border': 'var(--warn-border)',
        danger: 'var(--danger)',
        'danger-strong': 'var(--danger-strong)',
        'danger-soft': 'var(--danger-soft)',
        'danger-border': 'var(--danger-border)',
      },
      fontFamily: {
        ui: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Schibsted Grotesk', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SF Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        xs: 'var(--shadow-xs)',
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        lg: 'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
};
