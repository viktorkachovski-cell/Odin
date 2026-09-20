/**
 * Publishes the shared design tokens as CSS custom properties so the stylesheet
 * and the future native client read the same values from one source.
 */

import type { ColorToken } from '@odin/design-tokens';
import { darkColors, lightColors, radius, spacing, typography } from '@odin/design-tokens';

function kebab(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

/** Both palettes share the token set; the literal hex types are irrelevant here. */
function applyColors(target: HTMLElement, palette: Readonly<Record<ColorToken, string>>): void {
  for (const [name, value] of Object.entries(palette)) {
    target.style.setProperty(`--color-${kebab(name)}`, value);
  }
}

export function applyTheme(root: HTMLElement = document.documentElement): void {
  for (const [name, value] of Object.entries(spacing)) {
    root.style.setProperty(`--space-${name}`, `${value}px`);
  }
  for (const [name, value] of Object.entries(radius)) {
    root.style.setProperty(`--radius-${name}`, `${value}px`);
  }
  for (const [name, value] of Object.entries(typography.size)) {
    root.style.setProperty(`--font-size-${name}`, `${value}px`);
  }
  for (const [name, value] of Object.entries(typography.weight)) {
    root.style.setProperty(`--font-weight-${name}`, String(value));
  }
  for (const [name, value] of Object.entries(typography.lineHeight)) {
    root.style.setProperty(`--line-height-${name}`, String(value));
  }
  root.style.setProperty('--font-family', typography.fontFamily);

  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  applyColors(root, prefersDark ? darkColors : lightColors);
  root.style.setProperty('color-scheme', prefersDark ? 'dark' : 'light');
}

/** Re-applies the palette when the OS theme changes mid-session. */
export function watchColorScheme(root: HTMLElement = document.documentElement): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined;
  }
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = (): void => {
    applyColors(root, query.matches ? darkColors : lightColors);
    root.style.setProperty('color-scheme', query.matches ? 'dark' : 'light');
  };
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
