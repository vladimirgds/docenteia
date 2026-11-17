import { planoALatex } from "../matematicas/index.ts";

/**
 * TÉRMINOS TOCABLES EN LA PIZARRA (PMV 3 · HITO 3).
 *
 * Un paso se escribe en notación plana ("1/2 + 1/3") y se muestra con KaTeX. Para
 * que el alumno pueda TOCAR un término y para que el puntero láser pueda
 * SEÑALARLO, cada término se envuelve en un `\htmlClass{pzt-N}{…}` de KaTeX: el
 * navegador recibe un elemento real, con su caja en pantalla, al que apuntar.
 *
 * Los fragmentos se convierten a LaTeX por separado, así que un término tiene
 * que ser un trozo COMPLETO de lo que se escribe (`1/2`, no `/2`): este módulo
 * lo comprueba, y la API lo rechaza al guardar en lugar de descubrirlo el alumno.
 *
 * Lo usan el navegador (pizarra), el servidor (verificador) y las baterías de
 * QA: nada de alias "@/" ni sintaxis exclusiva de TypeScript.
 */

export const PREFIJO_TERMINO = "pzt-";

export interface TerminoEntrada {
  texto: string;
}

export interface LatexDePaso {
  latex: string;
  /** Por qué no se puede componer (término ausente, solapado…), o `null`. */
  error: string | null;
}

/**
 * Las opciones de KaTeX con las que se muestra la pizarra. `trust` se limita a
 * `\htmlClass`: el contenido lo escriben docentes (o la IA), así que no se habilita
 * nada más —ni `\href`, ni `\url`, ni `\includegraphics`—.
 */
export const OPCIONES_KATEX = {
  displayMode: true,
  throwOnError: false,
  strict: "ignore" as const,
  // Y de `\htmlClass` sólo se admiten NUESTRAS clases (`pzt-N`): si no, un docente
  // —o la IA— podría ponerle a un fragmento cualquier clase de la hoja de
  // estilos y reestructurar la pizarra a su antojo.
  trust: (ctx: { command: string; class?: string }) =>
    ctx.command === "\\htmlClass" && /^pzt-\d+$/.test(String(ctx.class ?? "")),
};

export function latexConTerminos(escribe: string, terminos: readonly TerminoEntrada[] = []): LatexDePaso {
  if (terminos.length === 0) return { latex: planoALatex(escribe), error: null };

  const posiciones: { k: number; ini: number; fin: number }[] = [];
  for (let k = 0; k < terminos.length; k++) {
    const t = terminos[k].texto;
    const ini = t ? escribe.indexOf(t) : -1;
    if (ini < 0) {
      return { latex: planoALatex(escribe), error: `El término «${t}» no aparece en lo que se escribe en el paso.` };
    }
    posiciones.push({ k, ini, fin: ini + t.length });
  }
  // Un término no puede CORTAR una fracción ni una potencia: «/24» dentro de
  // «6/24» compilaría, pero la pizarra mostraría un «6» suelto y una barra rota.
  for (const p of posiciones) {
    const t = escribe.slice(p.ini, p.fin);
    const antes = escribe.slice(0, p.ini).trimEnd().slice(-1);
    const despues = escribe.slice(p.fin).trimStart().charAt(0);
    if (/^[/^_]/.test(t.trim()) || /[/^_]$/.test(t.trim()) || /[/^_]/.test(antes) || /[/^]/.test(despues)) {
      return {
        latex: planoALatex(escribe),
        error: `El término «${t}» corta una fracción o una potencia: elige el fragmento completo (por ejemplo «6/24» entero).`,
      };
    }
  }
  posiciones.sort((a, b) => a.ini - b.ini);
  for (let i = 1; i < posiciones.length; i++) {
    if (posiciones[i].ini < posiciones[i - 1].fin) {
      return {
        latex: planoALatex(escribe),
        error: `Los términos «${terminos[posiciones[i - 1].k].texto}» y «${terminos[posiciones[i].k].texto}» se solapan.`,
      };
    }
  }

  let cursor = 0;
  let latex = "";
  for (const p of posiciones) {
    const antes = escribe.slice(cursor, p.ini);
    if (antes.trim()) latex += planoALatex(antes) + " ";
    latex += `\\htmlClass{${PREFIJO_TERMINO}${p.k}}{${planoALatex(escribe.slice(p.ini, p.fin))}} `;
    cursor = p.fin;
  }
  const resto = escribe.slice(cursor);
  if (resto.trim()) latex += planoALatex(resto);
  return { latex: latex.trim(), error: null };
}
