import type { Metadata } from "next";
import Link from "next/link";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionDocente } from "@/components/docente/navegacion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { autorizacionDeSesion } from "@/lib/docente/bancos";
import { resumenDeBancos } from "@/lib/docente/resumen-bancos";
import { etiquetaMotor } from "@/lib/docente/curriculo";

export const metadata: Metadata = { title: "Mis bancos · Panel docente" };
export const dynamic = "force-dynamic";

/**
 * /docente/bancos — el banco privado de cada tema, junto al catálogo maestro.
 *
 * Es la "entrega de un banco docente vacío para la carga inicial de contenido
 * por tema": un docente nuevo ve aquí TODOS los temas con su banco a cero y el
 * catálogo al lado, y desde cada fila salta a escribir, copiar o generar
 * borradores con IA. Todo lo que cuenta esta página es SUYO: no hay forma de
 * ver el banco de otro docente desde aquí.
 */
export default async function PaginaBancos() {
  const sesion = await auth();
  const quien = autorizacionDeSesion(sesion?.user);
  const bancos = await resumenDeBancos(quien);

  const totalPropios = bancos.reduce((n, b) => n + b.propio.total, 0);
  const totalIA = bancos.reduce((n, b) => n + b.propio.borradoresIA, 0);
  const totalCatalogo = bancos.reduce((n, b) => n + b.catalogo.publicados, 0);
  const esDocente = quien.rol === "DOCENTE";

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionDocente />
      <main className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Mis bancos de ejercicios</h1>
          <p className="text-muted-foreground">
            Cada tema tiene dos bancos. El <strong>catálogo maestro</strong> es común a toda la
            plataforma y alimenta el diagnóstico general. <strong>Tu banco</strong> es privado: sólo
            tú lo ves y sólo llega a un alumno a través de una tarea que tú asignes.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Resumen titulo="Temas" valor={bancos.length} />
          <Resumen titulo="Ejercicios en el catálogo maestro" valor={totalCatalogo} />
          <Resumen
            titulo="Ejercicios en tu banco"
            valor={totalPropios}
            nota={
              totalPropios === 0
                ? "Tu banco está vacío: empieza copiando del catálogo, escribiendo o generando borradores con IA."
                : totalIA > 0
                  ? `${totalIA} borrador(es) de IA esperan tu revisión.`
                  : undefined
            }
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Por tema</CardTitle>
            <CardDescription>
              Las cifras de «Tu banco» cuentan únicamente tus ejercicios.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {bancos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Todavía no hay temas publicados en el currículo.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="pb-2 font-medium">Tema</th>
                      <th className="pb-2 font-medium">Catálogo maestro</th>
                      <th className="pb-2 font-medium">Tu banco</th>
                      <th className="pb-2 font-medium">Publicados</th>
                      <th className="pb-2 font-medium">Borradores</th>
                      <th className="pb-2 font-medium">IA por revisar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bancos.map((b) => (
                      <tr key={b.tema.id} className="border-b align-top last:border-0">
                        <td className="py-3">
                          <div className="font-medium">{b.tema.titulo}</div>
                          <div className="flex flex-wrap gap-1 pt-1">
                            {b.tema.motor ? (
                              <Badge variant="contorno">{etiquetaMotor(b.tema.motor)}</Badge>
                            ) : (
                              <Badge variant="aviso" title="Sin motor: no hay verificación automática">
                                Sin motor
                              </Badge>
                            )}
                            {b.tema.materia && (
                              <span className="text-xs text-muted-foreground">{b.tema.materia}</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3">{b.catalogo.publicados}</td>
                        <td className="py-3">
                          {b.propio.total === 0 ? (
                            <Badge variant="neutro">Vacío</Badge>
                          ) : (
                            <span className="font-medium">{b.propio.total}</span>
                          )}
                        </td>
                        <td className="py-3">{b.propio.publicados}</td>
                        <td className="py-3">{b.propio.borradores}</td>
                        <td className="py-3">
                          {b.propio.borradoresIA > 0 ? (
                            <Badge variant="aviso">{b.propio.borradoresIA}</Badge>
                          ) : (
                            0
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {esDocente && (
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/docente/ejercicios">Ir a mis ejercicios</Link>
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}

function Resumen({ titulo, valor, nota }: { titulo: string; valor: number; nota?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{titulo}</CardDescription>
        <CardTitle className="text-3xl">{valor}</CardTitle>
      </CardHeader>
      {nota && (
        <CardContent>
          <p className="text-sm text-muted-foreground">{nota}</p>
        </CardContent>
      )}
    </Card>
  );
}
