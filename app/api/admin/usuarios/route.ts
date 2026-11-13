import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { exigirSuperadmin } from "@/lib/admin/api";
import { crearUsuarioSchema } from "@/lib/admin/usuarios";
import { fallo, leerCuerpo } from "@/lib/docente/api";
import { ORDEN_JERARQUICO_ROL, ROLES } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * EL MÓDULO DE USUARIOS DEL ADMIN (HITO 4 — cierre PMV2, "3.B"): listado
 * completo, filtrable por rol, con las instituciones para el selector de
 * vinculación —se mandan juntas para que la pantalla no necesite una
 * segunda ruta sólo para esa lista corta—.
 */
export async function GET(req: Request) {
  const permiso = await exigirSuperadmin();
  if (!permiso.ok) return permiso.respuesta;

  const url = new URL(req.url);
  const rol = url.searchParams.get("rol");
  const institucionId = url.searchParams.get("institucion");
  const busqueda = (url.searchParams.get("q") ?? "").trim();

  // Dos condiciones, cada una ya con su propio `OR` (ésta y la de la
  // búsqueda), así que van en `AND` en vez de mezclarse en el mismo objeto:
  // dos claves `OR` en un mismo `where` se pisarían entre sí.
  const condiciones: Prisma.UsuarioWhereInput[] = [];
  if (rol && (ROLES as readonly string[]).includes(rol)) {
    condiciones.push({ rol: rol as (typeof ROLES)[number] });
  }
  if (institucionId) {
    // Un DOCENTE/DIRECTOR/SUPERADMIN tiene su institución directo en la
    // fila (`institucionId`); un ESTUDIANTE no —la tiene por aula, vía su
    // matrícula (ver el comentario de `rolUsaInstitucion` más abajo)—, así
    // que hace falta cubrir las dos formas para que el filtro encuentre a
    // los alumnos de un colegio y no sólo a su personal.
    condiciones.push({
      OR: [{ institucionId }, { matriculas: { some: { aula: { institucionId } } } }],
    });
  }
  if (busqueda) {
    condiciones.push({
      OR: [
        { nombre: { contains: busqueda, mode: "insensitive" } },
        { email: { contains: busqueda, mode: "insensitive" } },
      ],
    });
  }

  try {
    const [usuarios, instituciones] = await Promise.all([
      prisma.usuario.findMany({
        where: condiciones.length ? { AND: condiciones } : {},
        // El orden jerárquico-operativo (Administrador → Director → Docentes
        // → Alumnos) no se puede pedir aquí: Postgres ordena un enum por su
        // posición de DECLARACIÓN, no alfabéticamente, y `Rol` declara
        // ESTUDIANTE primero (ver `lib/rbac.ts`) por motivos de RBAC ajenos a
        // cómo se quiere VER esta lista. Se ordena por nombre a secas y se
        // reordena por jerarquía después, en memoria (ver `ORDEN_JERARQUICO_ROL`).
        orderBy: [{ nombre: "asc" }],
        select: {
          id: true,
          nombre: true,
          email: true,
          rol: true,
          activo: true,
          creadoEn: true,
          institucionId: true,
          institucion: { select: { nombre: true } },
          // Sólo tiene fila para un ESTUDIANTE: la etapa/curso que el propio
          // alumno declaró, o que le completó la matrícula sola (ver POST
          // /api/admin/matriculas). Se expone para que la tabla no muestre
          // "matriculado" sin decir en qué grado quedó, de un vistazo.
          perfilEstudiante: { select: { etapa: true, curso: true } },
          // Sólo tiene filas para un ESTUDIANTE —es la institución "por aula",
          // la única que aplica a ese rol (ver `rolUsaInstitucion`)—, así que
          // para cualquier otro rol llega vacío sin más condición.
          matriculas: {
            select: {
              // Vía de enrolamiento (observación del cliente, cierre HITO 4:
              // "auditar la vía de enrolamiento del estudiante"), visible
              // directo en la fila del alumno —sin tener que ir a mirar
              // /admin/auditoria para algo que ya se está mostrando aquí—.
              origen: true,
              aula: {
                select: { nombre: true, grado: true, seccion: true, institucion: { select: { nombre: true } } },
              },
            },
          },
        },
        // Sin filtro, el orden es por rol y ESTUDIANTE es, con mucha
        // diferencia, el más numeroso: un tope bajo aquí podía dejar fuera
        // de la respuesta al ÚNICO SUPERADMIN sembrado —el propio
        // administrador, que ordena DESPUÉS de ESTUDIANTE alfabéticamente—
        // en cuanto hubiera más estudiantes que el tope. 5000 es sobrado
        // para lo que de verdad tiene un colegio o unos pocos; si la
        // plataforma crece mucho más allá de eso, lo que hace falta es
        // paginar esta lista, no subir el número otra vez.
        take: 5000,
      }),
      prisma.institucion.findMany({
        orderBy: { nombre: "asc" },
        select: { id: true, nombre: true },
      }),
    ]);

    // Orden jerárquico-operativo pedido por el cliente: Administrador,
    // Director, Docentes, Alumnos —en ese orden, siempre, sin importar el
    // filtro—. `.sort` de V8 es estable, así que el `orderBy: nombre` de la
    // consulta sigue decidiendo el orden alfabético DENTRO de cada rol.
    const usuariosOrdenados = [...usuarios].sort(
      (a, b) => ORDEN_JERARQUICO_ROL[a.rol] - ORDEN_JERARQUICO_ROL[b.rol],
    );

    return NextResponse.json({
      usuarios: usuariosOrdenados.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        rol: u.rol,
        activo: u.activo,
        creadoEn: u.creadoEn,
        institucionId: u.institucionId,
        institucion: u.institucion?.nombre ?? null,
        etapa: u.perfilEstudiante?.etapa ?? null,
        curso: u.perfilEstudiante?.curso ?? null,
        matriculas: u.matriculas.map((m) => ({
          institucion: m.aula.institucion.nombre,
          grado: m.aula.grado,
          seccion: m.aula.seccion,
          aula: m.aula.nombre,
          origen: m.origen,
        })),
      })),
      instituciones,
    });
  } catch (e) {
    return fallo(e, "admin/usuarios:listar");
  }
}

/**
 * POST /api/admin/usuarios (checklist actualizado: "Formulario de
 * Docentes" y "Formulario de Alumnos" — entidades maestras, independientes
 * de la asignación). El SUPERADMIN da de alta directo una cuenta de
 * DOCENTE o de ESTUDIANTE, con su nombre, correo y contraseña —antes sólo
 * existía el alta pública de alumnos (`/api/registro`) o reasignar el rol
 * de una cuenta ya existente; no había forma de crear un docente nuevo de
 * un tirón—.
 */
export async function POST(req: Request) {
  const permiso = await exigirSuperadmin();
  if (!permiso.ok) return permiso.respuesta;

  const cuerpo = await leerCuerpo(req, crearUsuarioSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  try {
    const passwordHash = await bcrypt.hash(datos.password, 10);

    const usuario = await prisma.usuario.create({
      data: {
        nombre: datos.nombre,
        email: datos.email,
        passwordHash,
        rol: datos.rol,
        // Un alumno sin perfil no podría hacer el diagnóstico —misma regla
        // que `/api/registro`—; un docente no tiene perfil de alumno.
        ...(datos.rol === "ESTUDIANTE"
          ? {
              perfilEstudiante: {
                create: {
                  etapa: datos.etapa ?? null,
                  curso: datos.curso ?? null,
                  metadatos: {},
                },
              },
            }
          : {}),
      },
      select: { id: true, nombre: true, email: true, rol: true, activo: true, institucionId: true },
    });

    return NextResponse.json({ usuario: { ...usuario, institucion: null } }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "Ya existe una cuenta con ese correo electrónico." }, { status: 409 });
    }
    return fallo(e, "admin/usuarios:crear");
  }
}
