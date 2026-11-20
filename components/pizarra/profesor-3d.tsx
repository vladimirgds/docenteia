"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

/**
 * PROFESOR VIRTUAL 3D (PMV 3 · HITO 3).
 *
 * Un personaje modelado con primitivas de three.js —sin ningún archivo de
 * modelo—, de modo que funciona hoy sin depender de un recurso externo; cuando
 * exista un modelo GLB propio basta con sustituir `construirProfesor`. Lo que se
 * pidió del profesor es que ACOMPAÑE la explicación, y eso es lo que hace:
 *
 *   · su brazo derecho APUNTA hacia donde está el puntero láser de la pizarra;
 *   · su boca se mueve mientras se oye la explicación;
 *   · parpadea y respira, para no ser una imagen congelada.
 *
 * Todo lo que cambia de un fotograma a otro (`hablando`, `objetivo`) se lee de
 * referencias, no de estado de React: la escena se construye UNA vez y el bucle
 * de animación nunca se reinicia por un cambio de props.
 *
 * Si el navegador no puede crear un contexto WebGL, se muestra un profesor 2D de
 * respaldo: la lección no se queda sin su profesor.
 */

export interface ObjetivoLaser {
  /** Posición relativa dentro de la pizarra, de 0 (izquierda/arriba) a 1. */
  x: number;
  y: number;
}

interface Props {
  hablando: boolean;
  objetivo: ObjetivoLaser | null;
  className?: string;
}

const PIEL = 0xf1c9a5;
const PELO = 0x3a2a20;
const BLUSA = 0x3b5bdb;

function material(color: number) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.05 });
}

function construirProfesor() {
  const profe = new THREE.Group();

  // Torso y falda de la blusa.
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.78, 1.5, 32), material(BLUSA));
  torso.position.y = 0.2;
  profe.add(torso);

  // Cuello y cabeza.
  const cuello = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.2, 16), material(PIEL));
  cuello.position.y = 1.02;
  profe.add(cuello);

  const cabeza = new THREE.Group();
  cabeza.position.y = 1.55;
  const craneo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 40, 32), material(PIEL));
  cabeza.add(craneo);
  const pelo = new THREE.Mesh(
    new THREE.SphereGeometry(0.53, 40, 32, 0, Math.PI * 2, 0, Math.PI * 0.55),
    material(PELO),
  );
  pelo.position.y = 0.03;
  pelo.rotation.x = -0.25;
  cabeza.add(pelo);

  const ojos: THREE.Mesh[] = [];
  for (const lado of [-1, 1]) {
    const ojo = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), material(0x1b1b1b));
    ojo.position.set(0.17 * lado, 0.07, 0.44);
    cabeza.add(ojo);
    ojos.push(ojo);
    const ceja = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 0.03), material(PELO));
    ceja.position.set(0.17 * lado, 0.2, 0.46);
    cabeza.add(ceja);
    // Gafas: el aire de profesor.
    const aro = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.012, 8, 24), material(0x222222));
    aro.position.set(0.17 * lado, 0.07, 0.46);
    cabeza.add(aro);
  }
  const puente = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.012, 0.012), material(0x222222));
  puente.position.set(0, 0.08, 0.47);
  cabeza.add(puente);

  const boca = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 12), material(0x8a2b2b));
  boca.position.set(0, -0.17, 0.44);
  boca.scale.set(1.5, 0.25, 0.5);
  cabeza.add(boca);
  profe.add(cabeza);

  // Brazo izquierdo: cuelga.
  const brazoI = new THREE.Group();
  brazoI.position.set(-0.78, 0.82, 0);
  const manga = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.9, 16), material(BLUSA));
  manga.position.y = -0.45;
  brazoI.add(manga);
  const manoI = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), material(PIEL));
  manoI.position.y = -0.95;
  brazoI.add(manoI);
  brazoI.rotation.z = -0.12;
  profe.add(brazoI);

  // Brazo derecho: el que señala. El pivote está en el hombro.
  const brazoD = new THREE.Group();
  brazoD.position.set(0.78, 0.82, 0);
  const mangaD = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.95, 16), material(BLUSA));
  mangaD.position.y = -0.475;
  brazoD.add(mangaD);
  const manoD = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), material(PIEL));
  manoD.position.y = -1.0;
  brazoD.add(manoD);
  const dedo = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.24, 8), material(PIEL));
  dedo.position.y = -1.18;
  brazoD.add(dedo);
  brazoD.rotation.z = 0.12;
  profe.add(brazoD);

  return { profe, cabeza, boca, ojos, brazoD, torso };
}

export function Profesor3D({ hablando, objetivo, className }: Props) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const estado = useRef({ hablando, objetivo });
  const [sinWebGL, setSinWebGL] = useState(false);
  estado.current = { hablando, objetivo };

  useEffect(() => {
    const canvas = lienzo.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      setSinWebGL(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    const escena = new THREE.Scene();
    const camara = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camara.position.set(0.9, 1.35, 7.2);
    camara.lookAt(0.55, 1.0, 0);

    escena.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.1));
    const sol = new THREE.DirectionalLight(0xffffff, 1.4);
    sol.position.set(2.5, 4, 5);
    escena.add(sol);

    const { profe, cabeza, boca, ojos, brazoD, torso } = construirProfesor();
    escena.add(profe);

    const ajustar = () => {
      const caja = canvas.parentElement ?? canvas;
      const w = Math.max(120, caja.clientWidth);
      const h = Math.max(160, caja.clientHeight);
      renderer.setSize(w, h, false);
      camara.aspect = w / h;
      camara.updateProjectionMatrix();
    };
    ajustar();
    const observador = new ResizeObserver(ajustar);
    observador.observe(canvas.parentElement ?? canvas);

    const reloj = new THREE.Clock();
    let siguienteParpadeo = 2.5;
    let parpadeo = 0;
    let angulo = 0.12;
    let lastDeseado = 0.12;
    let marco = 0;
    let vivo = true;
    let ultimoPintado = 0;

    const bucle = () => {
      if (!vivo) return;
      marco = requestAnimationFrame(bucle);
      // AHORRO: en un ordenador sin tarjeta gráfica (WebGL por software, habitual
      // en aulas) pintar a 60 fps de forma continua se come la máquina entera. Se
      // pinta a ~30 fps mientras algo se mueve (habla o apunta), a ~8 fps en
      // reposo —sólo la respiración y el parpadeo— y nada si la pestaña no se ve.
      if (document.hidden) return;
      const t = reloj.getElapsedTime();
      const activo = estado.current.hablando || Math.abs(angulo - lastDeseado) > 0.01;
      if (t - ultimoPintado < (activo ? 1 / 30 : 1 / 8)) return;
      ultimoPintado = t;
      const { hablando: habla, objetivo: meta } = estado.current;

      // Respira.
      torso.scale.y = 1 + Math.sin(t * 1.6) * 0.008;

      // Habla: la boca se abre y se cierra a ritmo de sílaba, sin cerrarse del todo.
      const abierta = habla ? 0.25 + Math.abs(Math.sin(t * 13)) * 0.55 : 0.2;
      boca.scale.y += (abierta - boca.scale.y) * 0.4;
      cabeza.rotation.y = habla ? Math.sin(t * 2.2) * 0.1 : Math.sin(t * 0.6) * 0.03;
      cabeza.rotation.z = habla ? Math.sin(t * 1.7) * 0.03 : 0;

      // Parpadea.
      if (t > siguienteParpadeo && parpadeo === 0) parpadeo = 1;
      if (parpadeo > 0) {
        parpadeo += 0.25;
        const cierre = Math.abs(Math.sin(Math.min(parpadeo, 3.14)));
        for (const o of ojos) o.scale.y = Math.max(0.1, 1 - cierre * 0.9);
        if (parpadeo >= 3.14) {
          parpadeo = 0;
          siguienteParpadeo = t + 2.5 + Math.random() * 3;
          for (const o of ojos) o.scale.y = 1;
        }
      }

      // Señala: el brazo apunta hacia el láser. Un brazo que cuelga a lo largo de -Y y
      // se gira un ángulo θ alrededor de Z queda orientado hacia (senθ, -cosθ); para
      // apuntar a un punto a (dx, dy) del hombro, θ = atan2(dx, -dy). La pizarra
      // queda a la DERECHA del profesor, así que θ es positivo.
      let deseado = 0.12;
      if (meta) {
        const objetivoX = 0.9 + meta.x * 1.8;
        const objetivoY = 1.9 - meta.y * 1.7;
        deseado = THREE.MathUtils.clamp(Math.atan2(objetivoX - 0.78, -(objetivoY - 0.82)), 0.1, 2.6);
      }
      lastDeseado = deseado;
      angulo += (deseado - angulo) * 0.12;
      brazoD.rotation.z = angulo;
      canvas.dataset.brazo = angulo.toFixed(2);

      renderer.render(escena, camara);
    };
    marco = requestAnimationFrame(bucle);

    return () => {
      vivo = false;
      cancelAnimationFrame(marco);
      observador.disconnect();
      escena.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      renderer.dispose();
    };
  }, []);

  if (sinWebGL) {
    return (
      <div
        className={className}
        role="img"
        aria-label="Profesor virtual"
        data-profesor="2d"
        data-hablando={hablando}
      >
        <div className="flex h-full items-center justify-center text-7xl" aria-hidden>
          🧑‍🏫
        </div>
      </div>
    );
  }

  return (
    <div className={className} data-profesor="3d" data-hablando={hablando}>
      <canvas
        ref={lienzo}
        className="h-full w-full"
        role="img"
        aria-label="Profesor virtual en 3D"
      />
    </div>
  );
}
