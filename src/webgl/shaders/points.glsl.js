/** Shader des Partikelfelds (additiv geblendete, flackernde Punkte). */

export const pointsVertex = /* glsl */ `
uniform float uTime;
uniform float uPixelRatio;
uniform float uSize;
attribute float aScale;
attribute float aPhase;
varying float vAlpha;
varying float vMix;
void main(){
  vec3 p = position;
  p.y += sin(uTime * 0.25 + aPhase * 6.28) * 0.12;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * aScale * uPixelRatio * (1.0 / -mv.z);
  vAlpha = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 1.3 + aPhase * 40.0));
  vMix = aPhase;
}
`;
export const pointsFragment = /* glsl */ `
uniform float uOpacity;
varying float vAlpha;
varying float vMix;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  vec3 c = mix(vec3(0.78, 0.86, 0.95), vec3(0.95, 0.97, 1.0), vMix);
  gl_FragColor = vec4(c, a * a * vAlpha * uOpacity);
}
`;
