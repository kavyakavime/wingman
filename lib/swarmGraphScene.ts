import * as THREE from "three";

export function shortPersonName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "Unknown";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function createNodeMesh(
  color: string,
  emissiveIntensity: number,
  radius: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 32),
    new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity,
      roughness: 0.15,
      metalness: 0.2,
    }),
  );
  mesh.scale.setScalar(radius);
  return mesh;
}

export function updateNodeMesh(
  mesh: THREE.Mesh,
  color: THREE.Color,
  emissiveIntensity: number,
  radius: number,
): void {
  mesh.scale.setScalar(radius);
  const material = mesh.material as THREE.MeshStandardMaterial;
  material.color.copy(color);
  material.emissive.copy(color);
  material.emissiveIntensity = emissiveIntensity;
}
