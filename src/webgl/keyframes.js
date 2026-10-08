/**
 * Choreografie des Gebirges pro Sektion (Attribut data-scene im HTML).
 * x, y Position als Anteil der halben Sichtbreite/-höhe, s Skalierung,
 * amp Reliefstärke, snow Schneegrenze (höher = mehr Schnee), spin Drehung,
 * alpha Sichtbarkeit (0 = ausgeblendet hinter Fotos).
 */
export const KEYS = {
  desktop: {
    hero:      { x: 0.0, y: -2.3, s: 1.05, amp: 1.05, snow: 0.35, spin: 0.0, alpha: 1 },
    touren:    { x: 0.55, y: -0.15, s: 0.75, amp: 1.10, snow: 0.55, spin: 0.4, alpha: 0.9 },
    warum:     { x: -0.5, y: -0.35, s: 0.8, amp: 0.95, snow: 0.30, spin: 0.8, alpha: 0.9 },
    galerie:   { x: 0.0, y: 0.1, s: 0.5, amp: 1.0, snow: 0.5, spin: 1.2, alpha: 0 },
    ablauf:    { x: 0.5, y: -0.55, s: 0.85, amp: 1.0, snow: 0.6, spin: 1.6, alpha: 0.85 },
    stimmen:   { x: -0.45, y: -0.5, s: 0.8, amp: 0.9, snow: 0.45, spin: 2.0, alpha: 0.85 },
    kontakt:   { x: 0.0, y: -0.85, s: 1.05, amp: 1.15, snow: 0.7, spin: 2.4, alpha: 1 },
  },
  mobile: {
    hero:      { x: 0.0, y: -2.3, s: 1.1, amp: 1.0, snow: 0.35, spin: 0.0, alpha: 0.95 },
    touren:    { x: 0.3, y: -0.6, s: 0.9, amp: 1.1, snow: 0.55, spin: 0.4, alpha: 0.8 },
    warum:     { x: -0.3, y: -0.65, s: 0.9, amp: 0.95, snow: 0.3, spin: 0.8, alpha: 0.8 },
    galerie:   { x: 0.0, y: 0.0, s: 0.5, amp: 1.0, snow: 0.5, spin: 1.2, alpha: 0 },
    ablauf:    { x: 0.3, y: -0.7, s: 0.9, amp: 1.0, snow: 0.6, spin: 1.6, alpha: 0.75 },
    stimmen:   { x: -0.3, y: -0.7, s: 0.9, amp: 0.9, snow: 0.45, spin: 2.0, alpha: 0.75 },
    kontakt:   { x: 0.0, y: -0.75, s: 1.1, amp: 1.1, snow: 0.7, spin: 2.4, alpha: 1 },
  },
};
export const PROPS = ['x', 'y', 's', 'amp', 'snow', 'spin', 'alpha'];
