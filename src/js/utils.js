/**
 * Kleine Helfer, die von allen Modulen genutzt werden.
 */
export const $ = (selector, ctx = document) => ctx.querySelector(selector);
export const $$ = (selector, ctx = document) => [...ctx.querySelectorAll(selector)];

/** Nutzer:innen, die im Betriebssystem "Bewegung reduzieren" aktiviert haben. */
export const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
