import * as THREE from "three";

export function shortPersonName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Unknown";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export type GlowNodeParts = {
  group: THREE.Group;
  core: THREE.Mesh;
  glow: THREE.Mesh;
  halo: THREE.Mesh;
};

export function createGlowNode(
  color: string,
  emissiveIntensity: number,
  radius: number,
  isAmbient: boolean,
): GlowNodeParts {
  const group = new THREE.Group();
  const coreColor = new THREE.Color(color);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 20),
    new THREE.MeshBasicMaterial({
      color: coreColor,
      transparent: true,
      opacity: isAmbient ? 0.35 : 0.98,
      depthWrite: !isAmbient,
    }),
  );
  core.scale.setScalar(radius);
  group.add(core);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 16),
    new THREE.MeshBasicMaterial({
      color: coreColor,
      transparent: true,
      opacity: isAmbient ? 0.06 : 0.1 + emissiveIntensity * 0.02,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.scale.setScalar(radius * (isAmbient ? 1.8 : 2.4));
  group.add(glow);

  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(1, 12, 12),
    new THREE.MeshBasicMaterial({
      color: coreColor,
      transparent: true,
      opacity: isAmbient ? 0.03 : 0.04,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  halo.scale.setScalar(radius * (isAmbient ? 2.8 : 3.8));
  group.add(halo);

  return { group, core, glow, halo };
}

/** @deprecated use createGlowNode */
export function createNodeMesh(
  color: string,
  emissiveIntensity: number,
  radius: number,
): THREE.Mesh {
  return createGlowNode(color, emissiveIntensity, radius, false).core;
}

export function updateGlowNode(
  parts: GlowNodeParts,
  color: string,
  emissiveIntensity: number,
  radius: number,
  isAmbient: boolean,
): void {
  const c = new THREE.Color(color);
  parts.core.scale.setScalar(radius);
  parts.glow.scale.setScalar(radius * (isAmbient ? 1.8 : 2.4));
  parts.halo.scale.setScalar(radius * (isAmbient ? 2.8 : 3.8));

  (parts.core.material as THREE.MeshBasicMaterial).color.copy(c);
  (parts.core.material as THREE.MeshBasicMaterial).opacity = isAmbient ? 0.35 : 0.98;

  const glowMat = parts.glow.material as THREE.MeshBasicMaterial;
  glowMat.color.copy(c);
  glowMat.opacity = isAmbient ? 0.06 : 0.1 + emissiveIntensity * 0.02;

  const haloMat = parts.halo.material as THREE.MeshBasicMaterial;
  haloMat.color.copy(c);
  haloMat.opacity = isAmbient ? 0.03 : 0.04;
}

export function updateNodeMesh(
  mesh: THREE.Mesh,
  color: THREE.Color,
  emissiveIntensity: number,
  radius: number,
): void {
  mesh.scale.setScalar(radius);
  const material = mesh.material as THREE.MeshBasicMaterial;
  material.color.copy(color);
  material.opacity = 0.98;
}

function makeBokehTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(255,220,180,0.55)");
  grad.addColorStop(0.35, "rgba(255,180,120,0.18)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function makeGreenBokehTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(140,220,160,0.45)");
  grad.addColorStop(0.4, "rgba(80,180,120,0.12)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

export function decorateSwarmScene(scene: THREE.Scene): {
  tick: (t: number) => void;
  dispose: () => void;
} {
  scene.fog = new THREE.FogExp2(0x040408, 0.0042);

  const orangeTex = makeBokehTexture();
  const greenTex = makeGreenBokehTexture();
  const bokehSprites: THREE.Sprite[] = [];

  const bokehSpecs = [
    { tex: orangeTex, x: -120, y: 40, z: -80, scale: 70, drift: 0.0004 },
    { tex: orangeTex, x: 80, y: -30, z: -60, scale: 55, drift: 0.0003 },
    { tex: greenTex, x: -40, y: -50, z: -90, scale: 65, drift: 0.00035 },
  ];

  for (const spec of bokehSpecs) {
    const mat = new THREE.SpriteMaterial({
      map: spec.tex,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(spec.x, spec.y, spec.z);
    sprite.scale.setScalar(spec.scale);
    (sprite.userData as { drift: number; baseY: number }).drift = spec.drift;
    (sprite.userData as { drift: number; baseY: number }).baseY = spec.y;
    scene.add(sprite);
    bokehSprites.push(sprite);
  }

  const beamCanvas = document.createElement("canvas");
  beamCanvas.width = 512;
  beamCanvas.height = 64;
  const bctx = beamCanvas.getContext("2d")!;
  const beamGrad = bctx.createLinearGradient(0, 0, 512, 0);
  beamGrad.addColorStop(0, "rgba(255,120,60,0)");
  beamGrad.addColorStop(0.15, "rgba(255,160,80,0.15)");
  beamGrad.addColorStop(0.45, "rgba(255,220,120,0.35)");
  beamGrad.addColorStop(0.55, "rgba(180,255,160,0.28)");
  beamGrad.addColorStop(0.7, "rgba(120,220,255,0.35)");
  beamGrad.addColorStop(1, "rgba(255,255,255,0)");
  bctx.fillStyle = beamGrad;
  bctx.fillRect(0, 20, 512, 24);
  bctx.fillStyle = "rgba(255,255,255,0.6)";
  bctx.fillRect(240, 28, 8, 8);

  const beamTex = new THREE.CanvasTexture(beamCanvas);
  beamTex.needsUpdate = true;
  const beamMat = new THREE.MeshBasicMaterial({
    map: beamTex,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(220, 12), beamMat);
  beam.position.set(-20, 8, -15);
  beam.rotation.y = 0.08;
  scene.add(beam);

  const keyLight = new THREE.PointLight(0xffeedd, 0.65, 400);
  keyLight.position.set(15, 10, 30);
  scene.add(keyLight);

  const fillGreen = new THREE.PointLight(0x88cc99, 0.25, 350);
  fillGreen.position.set(-60, -20, 40);
  scene.add(fillGreen);

  scene.add(new THREE.AmbientLight(0x1a1820, 0.22));

  return {
    tick(t: number) {
      for (const sprite of bokehSprites) {
        const ud = sprite.userData as { drift: number; baseY: number };
        sprite.position.y = ud.baseY + Math.sin(t * ud.drift * 1000) * 2;
        const mat = sprite.material as THREE.SpriteMaterial;
        mat.opacity = 0.14 + Math.sin(t * 0.0008 + ud.baseY) * 0.05;
      }
      beamMat.opacity = 0.22 + Math.sin(t * 0.0015) * 0.04;
    },
    dispose() {
      for (const sprite of bokehSprites) {
        scene.remove(sprite);
        (sprite.material as THREE.SpriteMaterial).dispose();
      }
      scene.remove(beam);
      beamMat.dispose();
      beamTex.dispose();
      scene.remove(keyLight);
      scene.remove(fillGreen);
      orangeTex.dispose();
      greenTex.dispose();
    },
  };
}
