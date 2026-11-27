"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { EVENTO_MARCA_VOZ } from "@/lib/pizarra/voz-navegador";
import type { Gesto, ObjetivoLaser, PropsProfesor } from "./profesor-tipos";

/**
 * PROFESOR VIRTUAL 3D (PMV 3 · H3B) — personaje GLB con ESQUELETO y EXPRESIONES,
 * con three.js y React Three Fiber. Se carga BAJO DEMANDA (este módulo lo
 * importa `next/dynamic` sólo si hay WebGL; el .glb se pide al montarse).
 *
 *  · Habla: la boca (expresión «Surprised» del modelo) se abre con cada MARCA
 *    de la voz (`onboundary` del sintetizador).
 *  · Señala: el brazo derecho y la cabeza se orientan al OBJETIVO del LSG; la
 *    posición de la mano se pasa a la página para que el RAYO termine sobre el
 *    término activo.
 *  · Pregunta («Wave»), espera (mira al alumno, «Idle») y da una pista
 *    («ThumbsUp»).
 *
 * Modelo: public/modelos/profesor/profesor.glb — CC0, ver LICENCIA.md.
 */
export const URL_MODELO = "/modelos/profesor/profesor.glb";

interface Estado {
  hablando: boolean;
  objetivo: ObjetivoLaser | null;
  gesto: Gesto;
  alMoverMano?: PropsProfesor["alMoverMano"];
}

const GESTO_ANIMACION: Partial<Record<Gesto, string>> = { pregunta: "Wave", pista: "ThumbsUp" };

function Robot({ estado, caja, alCargar }: { estado: React.RefObject<Estado>; caja: React.RefObject<HTMLDivElement | null>; alCargar: () => void }) {
  const gltf = useLoader(GLTFLoader, URL_MODELO);
  const { camera, gl } = useThree();
  const mezclador = useMemo(() => new THREE.AnimationMixer(gltf.scene), [gltf]);
  const acciones = useMemo(() => {
    const a = new Map<string, THREE.AnimationAction>();
    for (const clip of gltf.animations) a.set(clip.name, mezclador.clipAction(clip));
    return a;
  }, [gltf, mezclador]);
  const huesos = useMemo(() => {
    // GLTFLoader QUITA los puntos de los nombres de nodo («Hand.R» → «HandR»,
    // PropertyBinding.sanitizeNodeName): se busca con el nombre saneado y,
    // por si otro modelo no lo necesita, con el original.
    const porNombre = (n: string) =>
      (gltf.scene.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n)) ?? gltf.scene.getObjectByName(n)) as THREE.Bone | undefined;
    return { brazo: porNombre("UpperArm.R"), mano: porNombre("Hand.R"), cabeza: porNombre("Head") };
  }, [gltf]);
  const cara = useMemo(() => {
    let m: THREE.Mesh | undefined;
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary && "Surprised" in mesh.morphTargetDictionary) m = mesh;
    });
    return m;
  }, [gltf]);

  const boca = useRef(0);
  const ultimaMarca = useRef(0);
  const gestoActual = useRef<Gesto | null>(null);
  const brazoSuave = useRef(new THREE.Quaternion());
  const haySuave = useRef(false);
  const giroCabeza = useRef(0);
  const tmp = useMemo(
    () => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), q: new THREE.Quaternion(), p: new THREE.Quaternion(), w: new THREE.Quaternion() }),
    [],
  );

  useEffect(() => {
    acciones.get("Idle")?.reset().play();
    alCargar();
    const alMarca = () => {
      ultimaMarca.current = performance.now();
      boca.current = 1;
      const c = caja.current;
      if (c) c.setAttribute("data-marcas", String(Number(c.getAttribute("data-marcas") ?? 0) + 1));
    };
    window.addEventListener(EVENTO_MARCA_VOZ, alMarca);
    return () => {
      window.removeEventListener(EVENTO_MARCA_VOZ, alMarca);
      mezclador.stopAllAction();
    };
  }, [acciones, mezclador, alCargar, caja]);

  useFrame((_, dt) => {
    const e = estado.current;
    if (!e) return;

    // 1) Gesto: animación de una vez («Wave», «ThumbsUp») que vuelve a «Idle».
    if (e.gesto !== gestoActual.current) {
      gestoActual.current = e.gesto;
      const nombre = GESTO_ANIMACION[e.gesto];
      const idle = acciones.get("Idle");
      const una = nombre ? acciones.get(nombre) : undefined;
      if (una && idle) {
        una.reset().setLoop(THREE.LoopOnce, 1);
        una.clampWhenFinished = false;
        una.crossFadeFrom(idle, 0.25, false).play();
        const volver = (ev: { action: THREE.AnimationAction }) => {
          if (ev.action !== una) return;
          mezclador.removeEventListener("finished", volver);
          idle.reset().crossFadeFrom(una, 0.3, false).play();
        };
        mezclador.addEventListener("finished", volver);
      }
    }
    mezclador.update(Math.min(dt, 0.1));

    // 2) Brazo y cabeza hacia el objetivo (después de la animación, que los mueve).
    gltf.scene.updateMatrixWorld(true);
    const { brazo, mano, cabeza } = huesos;
    const senala = e.gesto === "senala" && e.objetivo;
    if (brazo && mano && brazo.parent) {
      if (senala) {
        // El tablero está a la DERECHA del profesor: el objetivo se coloca en un
        // plano a su derecha, más alto cuanto más arriba esté el término.
        const destino = tmp.a.set(3.2, 4.4 - e.objetivo!.y * 2.4, 1.2);
        gltf.scene.localToWorld(destino);
        const hombro = brazo.getWorldPosition(tmp.b);
        const actual = mano.getWorldPosition(tmp.c).sub(hombro).normalize();
        const deseado = destino.sub(hombro).normalize();
        const delta = tmp.q.setFromUnitVectors(actual, deseado);
        const mundo = brazo.getWorldQuaternion(tmp.w);
        const padre = brazo.parent.getWorldQuaternion(tmp.p);
        const local = padre.invert().multiply(delta.multiply(mundo));
        if (!haySuave.current) {
          brazoSuave.current.copy(brazo.quaternion);
          haySuave.current = true;
        }
        brazoSuave.current.slerp(local, Math.min(1, dt * 8));
        brazo.quaternion.copy(brazoSuave.current);
      } else {
        haySuave.current = false;
      }
    }
    if (cabeza) {
      // Mira al término al señalar; al alumno (la cámara) al esperar o preguntar.
      // El giro es ADITIVO sobre la animación: se deshace el del fotograma
      // anterior para que no se acumule si la animación no toca la cabeza.
      cabeza.rotation.y -= giroCabeza.current;
      const meta = senala ? 0.5 : e.gesto === "espera" || e.gesto === "pregunta" ? 0 : 0.2;
      giroCabeza.current += (meta - giroCabeza.current) * Math.min(1, dt * 6);
      cabeza.rotation.y += giroCabeza.current;
    }

    // 3) Boca: marcas de voz; sin marcas, a ritmo mientras habla.
    const sinMarcas = performance.now() - ultimaMarca.current > 450;
    boca.current = e.hablando && sinMarcas ? 0.45 + 0.45 * Math.abs(Math.sin(performance.now() / 110)) : boca.current * 0.82;
    if (cara?.morphTargetDictionary && cara.morphTargetInfluences) {
      cara.morphTargetInfluences[cara.morphTargetDictionary.Surprised] = boca.current;
    }
    caja.current?.setAttribute("data-boca", boca.current.toFixed(2));

    // 4) Dónde está la mano EN LA PÁGINA, para que el rayo empiece ahí.
    if (e.alMoverMano) {
      if (senala && mano) {
        gltf.scene.updateMatrixWorld(true);
        const p = mano.getWorldPosition(tmp.a).project(camera);
        const r = gl.domElement.getBoundingClientRect();
        e.alMoverMano({ x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height });
      } else {
        e.alMoverMano(null);
      }
    }
  });

  return <primitive object={gltf.scene} position={[0, 0, 0]} rotation={[0, 0.45, 0]} />;
}

export default function ProfesorGLB({ hablando, objetivo, gesto, className, alMoverMano }: PropsProfesor) {
  const estado = useRef<Estado>({ hablando, objetivo, gesto, alMoverMano });
  estado.current = { hablando, objetivo, gesto, alMoverMano };
  const caja = useRef<HTMLDivElement>(null);
  const alCargar = useMemo(() => () => caja.current?.setAttribute("data-modelo", "glb"), []);
  useEffect(() => () => alMoverMano?.(null), [alMoverMano]);

  return (
    <div ref={caja} className={className} data-profesor="3d" data-hablando={hablando} data-gesto={gesto} data-modelo="cargando">
      <Canvas
        camera={{ position: [0, 3.4, 9.5], fov: 34 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        role="img"
        aria-label="Profesor virtual en 3D"
        onCreated={({ camera }) => camera.lookAt(0, 2.9, 0)}
      >
        <ambientLight intensity={1.4} />
        <directionalLight position={[3, 8, 6]} intensity={2.2} />
        <Suspense fallback={null}>
          <Robot estado={estado} caja={caja} alCargar={alCargar} />
        </Suspense>
      </Canvas>
    </div>
  );
}
