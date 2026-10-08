/* Prozedurales Terrain: fBm-versetztes Gitter, Vertex-Displacement, Lambert-Shading. */
export const terrainVertex = /* glsl */ `
uniform float uTime, uAmp, uSnow, uIntro, uHover;
uniform vec2 uPointer;
varying float vH;
varying vec3 vNormal;
varying vec3 vWorld;

vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}
vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}
float snoise(vec2 v){
  const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);
  vec2 i=floor(v+dot(v,C.yy));
  vec2 x0=v-i+dot(i,C.xx);
  vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);
  vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1;
  i=mod289(i);
  vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));
  vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);
  m=m*m; m=m*m;
  vec3 x=2.0*fract(p*C.www)-1.0;
  vec3 h=abs(x)-0.5;
  vec3 ox=floor(x+0.5);
  vec3 a0=x-ox;
  m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);
  vec3 g; g.x=a0.x*x0.x+h.x*x0.y; g.yz=a0.yz*x12.xz+h.yz*x12.yw;
  return 130.0*dot(m,g);
}
float fbm(vec2 p){
  float a=0.5,f=0.0;
  for(int i=0;i<4;i++){f+=a*snoise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5;}
  return f;
}
float ridged(vec2 p){
  float a=0.5,f=0.0;
  for(int i=0;i<3;i++){float n=1.0-abs(snoise(p)); f+=a*n*n; p=p*2.1+vec2(4.1,2.3); a*=0.5;}
  return f;
}
float heightAt(vec2 p){
  float h=fbm(p*0.30)*0.45+ridged(p*0.42)*0.75;
  float d=length(p-vec2(0.3,0.4));
  h+=exp(-d*d*0.32)*1.55;                       // Hauptgipfel
  h+=exp(-dot(p-vec2(-2.8,-0.6),p-vec2(-2.8,-0.6))*0.45)*0.8;
  h+=exp(-dot(p-vec2(3.2,-0.2),p-vec2(3.2,-0.2))*0.5)*0.65;
  h-=smoothstep(2.0,5.0,p.y)*0.6;               // vorne flacher (Talboden)
  return h;
}
void main(){
  vec2 p=position.xz;
  float h=heightAt(p)*uAmp;
  // Maus: sanfte "Wolkenschatten"-Hebung an der Zeigerposition
  h+=exp(-length(p-uPointer*vec2(4.0,2.5))*1.4)*0.08*uHover*uAmp;
  vec3 pos=vec3(position.x,h,position.z);
  vH=h/max(uAmp,0.001);
  vec4 world=modelMatrix*vec4(pos,1.0);
  vWorld=world.xyz;
  vNormal=vec3(0.0,1.0,0.0);
  gl_Position=projectionMatrix*viewMatrix*world;
  gl_Position.y-=(1.0-uIntro)*1.5;
}
`;

export const terrainFragment = /* glsl */ `
uniform float uSnow, uAlpha;
varying float vH;
varying vec3 vNormal;
varying vec3 vWorld;
void main(){
  vec3 n=normalize(cross(dFdx(vWorld),dFdy(vWorld)));   // Flächennormale -> Low-Poly-Facetten
  if(n.y<0.0) n=-n;
  vec3 rock=mix(vec3(0.10,0.14,0.19),vec3(0.27,0.33,0.40),clamp(vH*0.7+0.1,0.0,1.0));
  float slope=1.0-n.y;
  float snowMask=smoothstep(0.62,0.95,vH*0.75+uSnow*0.35-slope*0.55);
  vec3 col=mix(rock,vec3(0.88,0.93,0.97),snowMask);
  vec3 light=normalize(vec3(-0.6,0.65,0.45));
  float diff=max(dot(n,light),0.0);
  col*=0.32+0.85*diff;
  col+=vec3(0.45,0.6,0.75)*0.08*(1.0-diff);              // kaltes Himmelslicht in Schattenseiten
  float depth=clamp((-vWorld.z+1.0)*0.08,0.0,0.5);
  col=mix(col,vec3(0.30,0.39,0.50),depth);
  float edge=smoothstep(7.0,5.2,abs(vWorld.x))*smoothstep(5.0,3.4,vWorld.z);
  gl_FragColor=vec4(col,uAlpha*edge);
}
`;
