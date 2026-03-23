import * as THREE from "three";
import { Potree, PointCloudOctree } from "potree-core";

export interface PotreeViewer {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  potree: Potree;
  pointClouds: PointCloudOctree[];
  clock: THREE.Clock;
  controls: OrbitState;
}

interface OrbitState {
  target: THREE.Vector3;
  spherical: THREE.Spherical;
  isDragging: boolean;
  isPanning: boolean;
  lastMouse: { x: number; y: number };
  zoomSpeed: number;
  rotateSpeed: number;
  panSpeed: number;
  update(camera: THREE.PerspectiveCamera): void;
  dispose(): void;
}

function createOrbitControls(
  camera: THREE.PerspectiveCamera,
  domElement: HTMLElement
): OrbitState {
  const target = new THREE.Vector3(0, 0, 0);
  const offset = new THREE.Vector3();
  offset.copy(camera.position).sub(target);

  const spherical = new THREE.Spherical();
  spherical.setFromVector3(offset);

  const state: OrbitState = {
    target,
    spherical,
    isDragging: false,
    isPanning: false,
    lastMouse: { x: 0, y: 0 },
    zoomSpeed: 1.0,
    rotateSpeed: 0.005,
    panSpeed: 0.002,
    update(cam: THREE.PerspectiveCamera) {
      // Clamp phi to avoid flipping
      state.spherical.phi = Math.max(0.01, Math.min(Math.PI - 0.01, state.spherical.phi));
      state.spherical.radius = Math.max(0.1, state.spherical.radius);

      const off = new THREE.Vector3().setFromSpherical(state.spherical);
      cam.position.copy(state.target).add(off);
      cam.lookAt(state.target);
    },
    dispose() {
      domElement.removeEventListener("mousedown", onMouseDown);
      domElement.removeEventListener("mousemove", onMouseMove);
      domElement.removeEventListener("mouseup", onMouseUp);
      domElement.removeEventListener("wheel", onWheel);
      domElement.removeEventListener("contextmenu", onContextMenu);
    },
  };

  function onMouseDown(e: MouseEvent) {
    if (e.button === 0) {
      state.isDragging = true;
    } else if (e.button === 2) {
      state.isPanning = true;
    }
    state.lastMouse.x = e.clientX;
    state.lastMouse.y = e.clientY;
  }

  function onMouseMove(e: MouseEvent) {
    const dx = e.clientX - state.lastMouse.x;
    const dy = e.clientY - state.lastMouse.y;
    state.lastMouse.x = e.clientX;
    state.lastMouse.y = e.clientY;

    if (state.isDragging) {
      state.spherical.theta -= dx * state.rotateSpeed;
      state.spherical.phi -= dy * state.rotateSpeed;
    }

    if (state.isPanning) {
      const cam = camera;
      const right = new THREE.Vector3();
      const up = new THREE.Vector3();
      cam.getWorldDirection(new THREE.Vector3());
      right.setFromMatrixColumn(cam.matrixWorld, 0);
      up.setFromMatrixColumn(cam.matrixWorld, 1);

      const panOffset = right
        .multiplyScalar(-dx * state.panSpeed * state.spherical.radius)
        .add(up.multiplyScalar(dy * state.panSpeed * state.spherical.radius));

      state.target.add(panOffset);
    }
  }

  function onMouseUp() {
    state.isDragging = false;
    state.isPanning = false;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    state.spherical.radius *= Math.pow(factor, state.zoomSpeed);
  }

  function onContextMenu(e: Event) {
    e.preventDefault();
  }

  domElement.addEventListener("mousedown", onMouseDown);
  domElement.addEventListener("mousemove", onMouseMove);
  domElement.addEventListener("mouseup", onMouseUp);
  domElement.addEventListener("wheel", onWheel, { passive: false });
  domElement.addEventListener("contextmenu", onContextMenu);

  return state;
}

export function createViewer(container: HTMLDivElement): PotreeViewer {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    10000
  );
  camera.position.set(0, 10, 20);

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const potree = new Potree();
  potree.pointBudget = 2_000_000;

  const controls = createOrbitControls(camera, renderer.domElement);
  controls.update(camera);

  // Add some ambient light so point colors are visible
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambientLight);

  return {
    scene,
    camera,
    renderer,
    potree,
    pointClouds: [],
    clock: new THREE.Clock(),
    controls,
  };
}

export async function loadPointCloud(
  viewer: PotreeViewer,
  baseUrl: string
): Promise<PointCloudOctree> {
  const pco = await viewer.potree.loadPointCloud(
    "metadata.json",
    `${baseUrl}`
  );

  // Center camera on bounding box
  const box = pco.boundingBox;
  const center = new THREE.Vector3();
  box.getCenter(center);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);

  viewer.controls.target.copy(center);
  viewer.controls.spherical.radius = maxDim * 1.5;
  viewer.controls.update(viewer.camera);

  viewer.scene.add(pco);
  viewer.pointClouds.push(pco);

  return pco;
}
