import type { Tema } from "@prisma/client";

import { prisma } from "../prisma.ts";
import { cubreAlAlumno, type CursoDelAlumno } from "../curriculo/etapas.ts";
import { TEMAS_LECCION, type TemaLeccion } from "./temas.ts";

/**
 * QUÉ TEMAS PUEDE VER ESTE ALUMNO EN LA LECCIÓN.
 *
 * POR QUÉ EXISTE
 * La vista de lección pintaba sus tarjetas a partir de `TEMAS_LECCION`, la
 * lista de los cinco motores escrita en el código, sin mirar quién estaba
 * delante. Con la taxonomía curricular en marcha eso quedó incoherente: un
 * alumno de 6.º de primaria hacía un diagnóstico de primaria —sin derivadas— y
 * al entrar en la lección se encontraba con Ecuaciones lineales, Factorización
 * y Derivadas, que el currículo marca para Secundaria y Superior.
 *
 * La lista ya no se escribe en el código: se pregunta al CURRÍCULO. Un motor se
 * ofrece si existe al menos un tema PUBLICADO que lo use y cuyo alcance cubra a
 * este alumno. Así, lo que el docente clasifica es exactamente lo que el alumno
 * recibe, y lo que se publica para Superior no baja a primaria.
 */

export interface TemasDisponibles {
  /** Los temas que se le pueden ofrecer, en el orden del temario. */
  temas: TemaLeccion[];
  /** ¿Se pudo consultar el currículo? Si no, no se restringe nada. */
  consultado: boolean;
}

/**
 * Los motores que el currículo publica para este alumno.
 *
 * Devuelve `consultado: false` cuando la base no responde. En ese caso quien
 * llama NO restringe: dejar a un alumno sin lección por un fallo de
 * infraestructura es peor que enseñarle una tarjeta de más, y el resto de la
 * pantalla ya está preparada para funcionar sin base de datos.
 */
export async function temasDisponiblesPara(alumno: CursoDelAlumno): Promise<TemasDisponibles> {
  try {
    const publicados = await prisma.nodoConocimiento.findMany({
      where: { estado: "PUBLICADO", motor: { not: null } },
      select: { motor: true, etapa: true, cursoMin: true },
    });

    const permitidos = new Set<Tema>();
    for (const nodo of publicados) {
      if (!nodo.motor) continue;
      if (cubreAlAlumno({ etapa: nodo.etapa, cursoMin: nodo.cursoMin }, alumno)) {
        permitidos.add(nodo.motor);
      }
    }

    return {
      temas: TEMAS_LECCION.filter((t) => permitidos.has(t.tema)),
      consultado: true,
    };
  } catch (e) {
    console.error("[leccion] no se pudo leer el currículo para filtrar los temas:", e);
    return { temas: [...TEMAS_LECCION], consultado: false };
  }
}

/**
 * ¿Puede este alumno abrir una lección de este motor?
 *
 * Lo usa `/api/sesion` antes de registrar nada. La interfaz ya no le ofrece las
 * tarjetas que no le tocan, pero una comprobación que sólo vive en la interfaz
 * no es una comprobación: basta con repetir la petición a mano para saltarla.
 */
export async function puedeAbrirTema(alumno: CursoDelAlumno, motor: Tema): Promise<boolean> {
  const { temas, consultado } = await temasDisponiblesPara(alumno);
  if (!consultado) return true;
  return temas.some((t) => t.tema === motor);
}
