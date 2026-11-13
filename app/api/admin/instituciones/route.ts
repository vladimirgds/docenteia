import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { exigirSuperadmin } from "@/lib/admin/api";
import { institucionSchema } from "@/lib/admin/instituciones";
import { conflicto, fallo, leerCuerpo } from "@/lib/docente/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ALTA DE COLEGIOS (cierre HITO 4, observación del cliente: "garantizar que
 * cada institución tenga su propio currículo independiente"). Antes de esta
 * ruta, un colegio sólo podía existir si lo creaba la semilla —no había
 * ningún camino en la aplicación para dar de alta uno nuevo—, así que la
 * plataforma, en la práctica, nunca podía tener más de un colegio.
 *
 * GET no hace falta aquí: el listado completo de instituciones ya lo trae
 * `GET /api/admin/usuarios` (y lo usan los selectores de `/admin/usuarios`),
 * y duplicarlo en una segunda ruta sólo daría dos sitios que mantener
 * sincronizados.
 */
export async function POST(req: Request) {
  const permiso = await exigirSuperadmin();
  if (!permiso.ok) return permiso.respuesta;

  const cuerpo = await leerCuerpo(req, institucionSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  try {
    const institucion = await prisma.institucion.create({
      data: { nombre: datos.nombre, codigoModular: datos.codigoModular ?? null },
      select: { id: true, nombre: true, codigoModular: true },
    });
    return NextResponse.json({ institucion }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return conflicto(`Ya existe un colegio con el código "${datos.codigoModular}".`);
    }
    return fallo(e, "admin/instituciones:crear");
  }
}
