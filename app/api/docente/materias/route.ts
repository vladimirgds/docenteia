import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  clausulaInstitucional,
  conflicto,
  exigirDocente,
  fallo,
  institucionParaCrear,
  leerCuerpo,
} from "@/lib/docente/api";
import { claveUnica, generarClave, materiaSchema } from "@/lib/docente/curriculo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Asignaturas del currículo (CRUD, primera mitad).
 *
 * La asignatura es el contenedor de los temas: "Matemáticas", "Álgebra II",
 * "Cálculo". El pliego del HITO 1 pide el CRUD de asignaturas y temas, y ésta
 * es la parte alta de esa jerarquía.
 */

export async function GET() {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;

  try {
    // Aislamiento curricular (cierre HITO 4): un DOCENTE/DIRECTOR ve su
    // propio catálogo más el catálogo base; SUPERADMIN los ve todos.
    const clausula = clausulaInstitucional(permiso.quien);
    const where: Prisma.MateriaWhereInput | undefined = clausula ? { OR: clausula } : undefined;

    const materias = await prisma.materia.findMany({
      where,
      orderBy: [{ orden: "asc" }, { nombre: "asc" }],
      include: {
        // Cuántos temas cuelgan de cada asignatura: es lo que decide si se
        // puede borrar y lo que se enseña en la tarjeta del listado.
        _count: { select: { temas: true } },
      },
    });
    return NextResponse.json({ materias });
  } catch (e) {
    return fallo(e, "docente/materias:listar");
  }
}

export async function POST(req: Request) {
  const permiso = await exigirDocente({ escritura: true });
  if (!permiso.ok) return permiso.respuesta;

  // Aislamiento curricular (cierre HITO 4): una asignatura nueva nace en el
  // colegio de quien la crea —nunca en uno que mande el cliente— o en el
  // catálogo base si la crea un SUPERADMIN.
  const propietario = institucionParaCrear(permiso.quien);
  if (!propietario.ok) return propietario.respuesta;

  const cuerpo = await leerCuerpo(req, materiaSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  try {
    // El código es el identificador estable de la asignatura. Si el docente no
    // lo indica —lo normal— se deriva del nombre y se desambigua, en lugar de
    // devolverle un error de restricción única que no le dice nada.
    const codigosOcupados = (
      await prisma.materia.findMany({ select: { codigo: true } })
    ).map((m) => m.codigo);

    const codigo = datos.codigo
      ? datos.codigo.toUpperCase()
      : claveUnica(generarClave(datos.nombre, 20).toUpperCase(), codigosOcupados);

    if (datos.codigo && codigosOcupados.includes(codigo)) {
      return conflicto(`Ya existe una asignatura con el código ${codigo}.`);
    }

    const materia = await prisma.materia.create({
      data: {
        codigo,
        nombre: datos.nombre,
        descripcion: datos.descripcion ?? null,
        color: datos.color ?? null,
        orden: datos.orden ?? 0,
        activa: datos.activa ?? true,
        institucionId: propietario.institucionId,
      },
    });

    return NextResponse.json({ materia }, { status: 201 });
  } catch (e) {
    return fallo(e, "docente/materias:crear");
  }
}
