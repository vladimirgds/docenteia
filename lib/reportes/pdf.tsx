import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import {
  COLUMNAS_ALUMNO,
  COLUMNAS_HABILIDADES,
  COLUMNAS_TUTORIA,
  filaAlumno,
  filaHabilidad,
  filaTutoria,
  type AulaDelReporte,
} from "@/lib/docente/exportar";
import type { ResumenInstitucional } from "@/lib/director/resumen";

/**
 * Las libretas en PDF del HITO 4 (sección 4: "listos para impresión con
 * membrete, logo, listado consolidado de notas y firma de dirección").
 *
 * Sin logo de verdad —no hay uno que el cliente haya entregado—: el membrete
 * es el nombre de la plataforma y la fecha del reporte, y la firma es una
 * línea en blanco con la etiqueta, lista para firmarse a mano tras imprimir.
 */

const estilos = StyleSheet.create({
  pagina: { padding: 36, fontSize: 10, fontFamily: "Helvetica" },
  membrete: { marginBottom: 16, borderBottom: 1, borderColor: "#999", paddingBottom: 8 },
  marca: { fontSize: 16, fontWeight: 700 },
  subtitulo: { fontSize: 11, color: "#555", marginTop: 2 },
  fecha: { fontSize: 9, color: "#888", marginTop: 4 },
  seccion: { marginTop: 18, marginBottom: 6, fontSize: 12, fontWeight: 700 },
  tabla: { display: "flex", width: "100%" },
  filaCabecera: { flexDirection: "row", borderBottom: 1, borderColor: "#333", paddingBottom: 4, marginBottom: 2 },
  fila: { flexDirection: "row", borderBottom: 0.5, borderColor: "#ddd", paddingVertical: 3 },
  celdaCabecera: { fontWeight: 700, fontSize: 9 },
  celda: { fontSize: 9 },
  firma: { marginTop: 48, borderTop: 1, borderColor: "#333", width: 220, paddingTop: 4 },
});

function Fila({ celdas, anchos, cabecera = false }: { celdas: (string | number)[]; anchos: number[]; cabecera?: boolean }) {
  return (
    <View style={cabecera ? estilos.filaCabecera : estilos.fila}>
      {celdas.map((c, i) => (
        <Text key={i} style={[cabecera ? estilos.celdaCabecera : estilos.celda, { width: `${anchos[i]}%` }]}>
          {String(c)}
        </Text>
      ))}
    </View>
  );
}

function Membrete({ subtitulo }: { subtitulo: string }) {
  return (
    <View style={estilos.membrete}>
      <Text style={estilos.marca}>MentorIA Math</Text>
      <Text style={estilos.subtitulo}>{subtitulo}</Text>
      <Text style={estilos.fecha}>Generado el {new Date().toLocaleDateString("es", { dateStyle: "long" })}</Text>
    </View>
  );
}

export async function pdfDocente(docenteNombre: string, aulas: readonly AulaDelReporte[]): Promise<Buffer> {
  const anchos = [22, 22, 8, 8, 10, 10, 10, 10];
  const anchosTutoria = [12, 12, 10, 11, 13, 6, 6, 6, 7, 9, 8];
  const anchosHabilidades = [26, 26, 10, 10, 10, 9, 9];
  const doc = (
    <Document title={`Libreta de calificaciones — ${docenteNombre}`}>
      <Page size="A4" style={estilos.pagina}>
        <Membrete subtitulo={`Libreta de calificaciones — ${docenteNombre}`} />
        {aulas.length === 0 && <Text>Todavía no hay aulas creadas.</Text>}
        {aulas.map((a) => (
          <View key={a.id} wrap={false}>
            <Text style={estilos.seccion}>
              {a.grado}.º {a.seccion} — {a.nombre}
            </Text>
            <View style={estilos.tabla}>
              <Fila cabecera anchos={anchos} celdas={[...COLUMNAS_ALUMNO]} />
              {a.estudiantes.map((e) => (
                <Fila key={e.id} anchos={anchos} celdas={filaAlumno(a, e)} />
              ))}
              {a.estudiantes.length === 0 && <Text style={estilos.celda}>Sin alumnos matriculados todavía.</Text>}
            </View>
            {a.tutoria.length > 0 && (
              <View style={estilos.tabla}>
                <Text style={estilos.seccion}>Tutoría adaptativa</Text>
                <Fila cabecera anchos={anchosTutoria} celdas={[...COLUMNAS_TUTORIA]} />
                {a.tutoria.map((t, i) => (
                  <Fila key={i} anchos={anchosTutoria} celdas={filaTutoria(t)} />
                ))}
              </View>
            )}
            {a.habilidades.length > 0 && (
              <View style={estilos.tabla}>
                <Text style={estilos.seccion}>Habilidades</Text>
                <Fila cabecera anchos={anchosHabilidades} celdas={[...COLUMNAS_HABILIDADES]} />
                {a.habilidades.map((h, i) => (
                  <Fila key={i} anchos={anchosHabilidades} celdas={filaHabilidad(h)} />
                ))}
              </View>
            )}
          </View>
        ))}
        <View style={estilos.firma}>
          <Text>Firma de dirección</Text>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}

export async function pdfDirector(nombreInstitucion: string, resumen: ResumenInstitucional): Promise<Buffer> {
  const anchosAulas = [34, 26, 10, 10, 10, 10];
  const anchosErrores = [30, 40, 15, 15];
  const doc = (
    <Document title={`Reporte institucional — ${nombreInstitucion}`}>
      <Page size="A4" style={estilos.pagina}>
        <Membrete subtitulo={`Reporte institucional — ${nombreInstitucion}`} />

        <Text style={estilos.seccion}>Cifras macro</Text>
        <Text style={estilos.celda}>
          {resumen.totalDocentes} docente(s) · {resumen.totalAulas} aula(s) · {resumen.totalAlumnos} alumno(s)
        </Text>

        <Text style={estilos.seccion}>Aulas del colegio</Text>
        <View style={estilos.tabla}>
          <Fila
            cabecera
            anchos={anchosAulas}
            celdas={["Aula", "Docente", "Alumnos", "Tareas", "Entregas", "Rendimiento"]}
          />
          {resumen.aulas.map((a) => (
            <Fila
              key={a.id}
              anchos={anchosAulas}
              celdas={[
                `${a.grado}.º ${a.seccion} — ${a.nombre}`,
                a.docenteNombre,
                a.matriculas,
                a.tareasCreadas,
                a.tasaEntrega == null ? "Sin datos" : `${a.tasaEntrega}%`,
                a.tasaAciertos == null ? "Sin datos" : `${a.tasaAciertos}%`,
              ]}
            />
          ))}
        </View>

        <Text style={estilos.seccion}>Temas con mayor tasa de error</Text>
        <View style={estilos.tabla}>
          <Fila cabecera anchos={anchosErrores} celdas={["Tema", "Tipo de error", "Ocurrencias", "Peso"]} />
          {resumen.temasConMasErrores.map((d, i) => (
            <Fila key={i} anchos={anchosErrores} celdas={[d.tema, d.tipoError, d.ocurrencias, `${d.peso}%`]} />
          ))}
          {resumen.temasConMasErrores.length === 0 && <Text style={estilos.celda}>Aún no hay errores registrados.</Text>}
        </View>

        <View style={estilos.firma}>
          <Text>Firma de dirección</Text>
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
