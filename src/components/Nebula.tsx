"use client";

import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo } from "react";

const fragment = /* glsl */ `
precision highp float;
uniform float u_time;
uniform vec2 u_res;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453123); }
float noise(in vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i);
  float b = hash(i+vec2(1.0,0.0));
  float c = hash(i+vec2(0.0,1.0));
  float d = hash(i+vec2(1.0,1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a, b, u.x) + (c - a)*u.y*(1.0-u.x) + (d - b)*u.x*u.y;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  uv = uv * 2.0 - 1.0;
  uv.x *= u_res.x / u_res.y;

  float t = u_time * 0.05;
  vec2 p = uv * 1.5;

  float n = 0.0;
  n += 0.6 * noise(p + t);
  n += 0.3 * noise(p * 2.0 - t*1.2);
  n += 0.1 * noise(p * 4.0 + t*0.8);

  vec3 col = mix(vec3(0.09,0.72,0.84), vec3(0.38,0.51,0.99), smoothstep(0.2,0.8,n));
  col = mix(col, vec3(0.63,0.55,0.98), smoothstep(0.5,0.95,n));
  col *= 0.35 + 0.75*n;

  gl_FragColor = vec4(col, 0.55);
}
`;

// Child component inside <Canvas/> where R3F hooks are valid
function NebulaPlane() {
  const uniforms = useMemo(() => ({
    u_time: { value: 0 },
    u_res:  { value: new THREE.Vector2(1,1) }
  }), []);

  useFrame((state) => {
    uniforms.u_time.value = state.clock.elapsedTime;
    const { width, height } = state.size;
    uniforms.u_res.value.set(width, height);
  });

  return (
    <mesh>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial uniforms={uniforms} fragmentShader={fragment} transparent />
    </mesh>
  );
}

export default function Nebula() {
  return (
    <Canvas orthographic camera={{ position: [0,0,1], zoom: 1 }}>
      <NebulaPlane />
    </Canvas>
  );
}

