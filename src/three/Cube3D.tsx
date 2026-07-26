import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useCubeStore } from "../store/cubeStore";
import { AXIS_VECTOR, createSolvedCube } from "../cube/cubeModel";
import type { Move } from "../cube/cubeModel";
import { Cubie } from "./Cubie";
import { inferTurnAxis } from "./DragTurn";

const SPACING = 1.02;
const DRAG_THRESHOLD = 8;
const DRAG_TO_ANGLE = 0.018;
const SWIPE_VELOCITY_THRESHOLD = 0.5;
const VELOCITY_WINDOW_MS = 60;

function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  faceNormal: THREE.Vector3;
  cubieWorldPos: THREE.Vector3;
  result: Move | null;
  dragAxis2D: THREE.Vector2 | null;
  history: { x: number; y: number; t: number }[];
  velocityX: number;
  velocityY: number;
  camStart: THREE.Vector3;
  upStart: THREE.Vector3;
}

interface Cube3DProps {
  onDragStart: () => void;
  onDragEnd: () => void;
}

export function Cube3D({ onDragStart, onDragEnd }: Cube3DProps) {
  const layout = useMemo(() => createSolvedCube(), []);
  const refs = useRef(new Map<number, THREE.Group>());
  const drag = useRef<DragState | null>(null);
  const { camera, gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const previousTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = "none";

    function raycastStickers(event: PointerEvent) {
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(ndc, camera);

      const meshes: THREE.Object3D[] = [];
      refs.current.forEach((group) =>
        group.traverse((o) => {
          if ((o as THREE.Mesh).isMesh && o.userData.isSticker) meshes.push(o);
        })
      );

      return raycaster.intersectObjects(meshes, false);
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target !== canvas) return;
      if (drag.current) return;
      if (!useCubeStore.getState().canBeginManual()) return;

      const hits = raycastStickers(event);
      if (hits.length === 0 || !hits[0].face) return;

      const hitObj = hits[0].object;
      let group: THREE.Object3D | null = hitObj;
      while (group && group.userData.cubieId === undefined) group = group.parent;
      if (!group || group.userData.cubieId === undefined) return;

      const worldNormal = hits[0].face.normal.clone().transformDirection(hitObj.matrixWorld);
      const worldPos = new THREE.Vector3();
      (group as THREE.Group).getWorldPosition(worldPos);

      event.preventDefault();

      drag.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        faceNormal: worldNormal,
        cubieWorldPos: worldPos,
        result: null,
        dragAxis2D: null,
        history: [{ x: event.clientX, y: event.clientY, t: performance.now() }],
        velocityX: 0,
        velocityY: 0,
        camStart: camera.position.clone(),
        upStart: camera.up.clone(),
      };
    }

    function handlePointerMove(event: PointerEvent) {
      const d = drag.current;
      if (!d || event.pointerId !== d.pointerId) return;

      event.preventDefault();

      const now = performance.now();
      d.history.push({ x: event.clientX, y: event.clientY, t: now });
      while (d.history.length > 1 && now - d.history[0].t > VELOCITY_WINDOW_MS) {
        d.history.shift();
      }
      const oldest = d.history[0];
      const dt = Math.max(now - oldest.t, 1);
      d.velocityX = (event.clientX - oldest.x) / dt;
      d.velocityY = (event.clientY - oldest.y) / dt;

      const dx = event.clientX - d.startX;
      const dy = event.clientY - d.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (!d.result) {
        if (dist < DRAG_THRESHOLD) return;

        const turnAxis = inferTurnAxis(
          new THREE.Vector2(dx, dy),
          d.faceNormal,
          d.cubieWorldPos,
          camera
        );
        if (!turnAxis) return;

        onDragStart();
        camera.position.copy(d.camStart);
        camera.up.copy(d.upStart);

        const axisVec = AXIS_VECTOR[turnAxis.axis].clone();
        const camRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
        const camUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
        const moveVec = new THREE.Vector3().crossVectors(d.faceNormal, axisVec).normalize();
        const dragAxis2D = new THREE.Vector2(moveVec.dot(camRight), -moveVec.dot(camUp));
        const aligned = dragAxis2D.dot(new THREE.Vector2(dx, dy)) >= 0;
        const direction = (aligned ? -1 : 1) as 1 | -1;
        if (!aligned) dragAxis2D.negate();

        d.result = { axis: turnAxis.axis, layers: [turnAxis.layer], direction };
        d.dragAxis2D = dragAxis2D;

        useCubeStore.getState().beginManual(d.result);
        return;
      }

      if (!d.dragAxis2D) return;

      const dragVec = new THREE.Vector2(dx, dy);
      const projectedPixels = dragVec.dot(d.dragAxis2D.clone().normalize());
      const angle = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, projectedPixels * DRAG_TO_ANGLE * d.result.direction)
      );

      useCubeStore.getState().updateManual(angle);
    }

    function handlePointerUp(event: PointerEvent) {
      const d = drag.current;
      if (!d || event.pointerId !== d.pointerId) return;
      drag.current = null;
      if (!d.result) return;

      onDragEnd();

      const store = useCubeStore.getState();
      const manual = store.manual;

      if (manual) {
        const velocityAlongAxis = d.dragAxis2D
          ? new THREE.Vector2(d.velocityX, d.velocityY).dot(
              d.dragAxis2D.clone().normalize()
            ) * d.result.direction
          : 0;

        const isSwipe = Math.abs(velocityAlongAxis) > SWIPE_VELOCITY_THRESHOLD;

        if (isSwipe) {
          const forcedAngle = velocityAlongAxis > 0 ? Math.PI / 2 : -Math.PI / 2;
          store.updateManual(forcedAngle);
        }
      }

      store.commitManual();
    }

    function handlePointerCancel(event: PointerEvent) {
      const d = drag.current;
      if (!d || event.pointerId !== d.pointerId) return;
      drag.current = null;
      if (!d.result) return;
      onDragEnd();
      useCubeStore.getState().cancelManual();
    }

    window.addEventListener("pointerdown", handlePointerDown, { capture: true, passive: false });
    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      canvas.style.touchAction = previousTouchAction;
    };
  }, [camera, gl, onDragStart, onDragEnd]);

  useFrame((_, delta) => {
    const store = useCubeStore.getState();
    store.tick(Math.min(delta, 1 / 30));

    const { cubies, active, manual } = useCubeStore.getState();

    const axisVec = active
      ? AXIS_VECTOR[active.move.axis]
      : manual
      ? AXIS_VECTOR[manual.move.axis]
      : null;

    const eased = active ? easeInOutQuad(Math.min(active.progress, 1)) : 0;
    const extraAngle = active
      ? (Math.PI / 2) * active.move.direction * eased
      : manual
      ? manual.angle
      : 0;

    const activeIds = active
      ? new Set(active.affected.map((c) => c.id))
      : manual
      ? new Set(manual.affected.map((c) => c.id))
      : null;

    for (const cubie of cubies) {
      const obj = refs.current.get(cubie.id);
      if (!obj) continue;

      let pos = cubie.position;
      let quat = cubie.quaternion;

      if (axisVec && activeIds?.has(cubie.id)) {
        pos = cubie.position.clone().applyAxisAngle(axisVec, extraAngle);
        const extraQuat = new THREE.Quaternion().setFromAxisAngle(axisVec, extraAngle);
        quat = extraQuat.clone().multiply(cubie.quaternion);
      }

      obj.position.set(pos.x * SPACING, pos.y * SPACING, pos.z * SPACING);
      obj.quaternion.copy(quat);
    }
  });

  return (
    <group>
      {layout.map((cubie) => (
        <Cubie
          key={cubie.id}
          cubieId={cubie.id}
          colors={cubie.colors}
          ref={(node) => {
            if (node) refs.current.set(cubie.id, node);
            else refs.current.delete(cubie.id);
          }}
        />
      ))}
    </group>
  );
}
