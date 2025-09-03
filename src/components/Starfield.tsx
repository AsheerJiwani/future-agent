"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Points, PointMaterial } from "@react-three/drei";

export default function Starfield() {
  const positions = useMemo(() => {
    const count = 3000;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 50 * Math.random();
      const theta = Math.random() * Math.PI * 2;
      const u = Math.random() * 2 - 1; // cos(phi)
      const s = Math.sqrt(1 - u * u);
      arr[i * 3 + 0] = r * s * Math.cos(theta);
      arr[i * 3 + 1] = r * s * Math.sin(theta);
      arr[i * 3 + 2] = r * u;
    }
    return arr;
  }, []);

  return (
    <Canvas camera={{ position: [0, 0, 2.5], fov: 75 }}>
      <Points positions={positions} stride={3}>
        <PointMaterial size={0.02} sizeAttenuation depthWrite={false} transparent />
      </Points>
    </Canvas>
  );
}
