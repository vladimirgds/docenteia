// TTS — síntesis de voz en español (Fase 2).
// Envuelve la Web Speech API (SpeechSynthesis) y expone speak() como Promise que
// se resuelve cuando termina de hablar, para que el PSE Light pueda sincronizar
// la revelación del contenido con la voz del avatar.
//
// Si el navegador no tiene voz en español (o no soporta TTS), speak() cae en un
// retardo estimado por longitud del texto, para que la sincronización siga
// funcionando (el avatar "habla" con subtítulos aunque no haya audio).

// ─── Normalización para la VOZ (no para la pantalla) ─────────────────────────
// Los motores de voz del navegador leen mal las letras de variables y los símbolos
// matemáticos sueltos: "x" suena "ecs" (no "equis"), "n" suena "en" (no "ene"),
// la "y" variable suena "i" (como la conjunción). Esta capa convierte SOLO el texto
// que se HABLA (la pizarra y los subtítulos siguen mostrando "x", "=", "x²").
const NOMBRE_LETRA = {
  a: "a", b: "be", c: "ce", d: "de", e: "e", f: "efe", g: "ge", h: "hache",
  i: "i", j: "jota", k: "ka", l: "ele", m: "eme", n: "ene", "ñ": "eñe", o: "o",
  p: "pe", q: "cu", r: "erre", s: "ese", t: "te", u: "u", v: "uve",
  w: "doble uve", x: "equis", y: "ye", z: "zeta",
};
const ORD_SUPER = { "⁴": "cuarta", "⁵": "quinta", "⁶": "sexta", "⁷": "séptima", "⁸": "octava", "⁹": "novena" };

export function normalizeForSpeech(text) {
  if (typeof text !== "string" || !text) return text;
  let s = " " + text + " ";

  // 1) Exponentes (superíndices) sobre letra/número → palabras. Se lee el RUN COMPLETO de superíndices,
  //    para cubrir el exponente NEGATIVO/compuesto "xⁿ⁻¹" (regla de la potencia). Antes "ⁿ" se leía "a la
  //    ene" pero el "⁻¹" quedaba CRUDO y la voz lo OMITÍA → la regla se oía "n por x a la n" (MAL, sin
  //    "menos uno") — queja del cliente. Ahora "xⁿ⁻¹" → "x a la ene menos uno".
  const SUP = { "⁰": "cero", "¹": "uno", "²": "dos", "³": "tres", "⁴": "cuatro", "⁵": "cinco", "⁶": "seis", "⁷": "siete", "⁸": "ocho", "⁹": "nueve", "ⁿ": "ene", "⁻": "menos" };
  s = s.replace(/([0-9a-zñ)])\s*([⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁻]+)/gi, (_, b, run) => {
    if (run === "²") return `${b} al cuadrado`;
    if (run === "³") return `${b} al cubo`;
    if (ORD_SUPER[run]) return `${b} a la ${ORD_SUPER[run]}`; // ⁴…⁹ solo → ordinal (cuarta, quinta…)
    if (run === "ⁿ") return `${b} a la ene`;
    // exponente compuesto o negativo (ⁿ⁻¹, ⁻¹, ¹…) → cardinales, conservando el "menos"
    return `${b} a la ${run.split("").map((c) => SUP[c] || "").filter(Boolean).join(" ")}`;
  });

  // 1b) Exponente con ACENTO CIRCUNFLEJO "^" (el motor decía "circunflejo"): "x^2" → "al cuadrado",
  //     "x^3" → "al cubo", "x^n" → "elevado a la n". Cubre también "^" suelto.
  s = s.replace(/\s*\^\s*2\b/g, " al cuadrado")
       .replace(/\s*\^\s*3\b/g, " al cubo")
       .replace(/\s*\^\s*(\d+)/g, " elevado a la $1")
       .replace(/\s*\^\s*([a-zñ])/gi, (_, l) => ` elevado a la ${NOMBRE_LETRA[l.toLowerCase()] || l}`)
       .replace(/\^/g, " elevado a la ");

  // 1c) Cálculo: diferencial "dx/dy/dz/dt" (el motor decía "dec") → "de equis/ye/zeta/te";
  //     e integral "∫" → "integral de".
  s = s.replace(/∫/g, " integral de ")
       .replace(/\bd\s*([xyzt])\b/gi, (_, l) => `de ${NOMBRE_LETRA[l.toLowerCase()]}`);

  // 1d) NOTACIÓN DE FUNCIONES Y DERIVADAS, antes de tocar los paréntesis (abajo se convierten en
  //     pausas y se perdería la información).
  //       · "f(x)"    se leía "efe equis" → ahora "efe DE equis", que es como se dice en clase;
  //       · "C'(q)"   dejaba la comilla suelta ("ce' cu"), que el motor lee como ruido → "ce prima de cu";
  //       · ")(" es un PRODUCTO: "(x - 3)(x + 3)" se leía "equis menos 3 equis más 3", sin el "por",
  //         y así el alumno oye una expresión que NO es la factorización. Es un error de matemáticas
  //         hablado, no solo de estilo.
  const letraNombre = (l) => NOMBRE_LETRA[l.toLowerCase()] || l;
  // NOMBRES DE FUNCIÓN (seno, coseno, logaritmo…) ANTES que la regla de "letra(variable)": esa regla
  // mira la letra pegada al paréntesis, así que se comía la ÚLTIMA del nombre y "sin(x)" se leía
  // "si ENE de equis", y "cos(x)", "co ESE de equis". Se oye en las lecciones que genera la IA para lo
  // que queda fuera del motor determinista (la regla del producto, por ejemplo), que también se
  // escuchan. El nombre solo se sustituye si va pegado a un paréntesis, para que el "sin" de "sin
  // embargo" siga siendo la preposición.
  const NOMBRE_FUNCION = { sin: "seno", sen: "seno", cos: "coseno", tan: "tangente", cot: "cotangente",
    sec: "secante", csc: "cosecante", ln: "logaritmo natural", log: "logaritmo", exp: "exponencial",
    arcsen: "arcoseno", arcsin: "arcoseno", arccos: "arcocoseno", arctan: "arcotangente", lim: "límite" };
  s = s.replace(/\b(arcsen|arcsin|arccos|arctan|sin|sen|cos|tan|cot|sec|csc|ln|log|exp|lim)\s*\(\s*([^()]{1,24}?)\s*\)/gi,
    (m, f, arg) => ` ${NOMBRE_FUNCION[f.toLowerCase()] || f} de ${arg} `);
  s = s.replace(/\)\s*\(/g, ") por (");                                  // producto de binomios
  s = s.replace(/([a-zñ])\s*'\s*\(\s*([a-zñ])\s*\)/gi, (_, f, v) => `${letraNombre(f)} prima de ${letraNombre(v)}`);
  s = s.replace(/([a-zñ])\s*\(\s*([a-zñ])\s*\)/gi, (_, f, v) => `${letraNombre(f)} de ${letraNombre(v)}`);
  s = s.replace(/([a-zñ])\s*'/gi, (_, f) => `${letraNombre(f)} prima`);  // prima suelta

  // 2) Símbolos matemáticos → palabras.
  s = s.replace(/\s*=\s*/g, " igual a ")
       .replace(/\s*[×·]\s*/g, " por ")
       .replace(/\s*÷\s*/g, " entre ")
       .replace(/√\s*/g, " raíz de ")
       .replace(/\s*≈\s*/g, " aproximadamente ")
       .replace(/\s*≠\s*/g, " distinto de ")
       .replace(/\s*≤\s*/g, " menor o igual que ")
       .replace(/\s*≥\s*/g, " mayor o igual que ")
       .replace(/\s*±\s*/g, " más menos ")
       .replace(/(\d)\s*%/g, "$1 por ciento")
       .replace(/π/g, " pi ");

  // 3) Operadores + - * / en contexto matemático (evita tocar guiones de palabras:
  //    el "-" solo se convierte si hay un dígito en algún lado; "auto-evaluación" queda intacto).
  s = s.replace(/([0-9a-zñ)])\s*\*\s*([0-9a-zñ(])/gi, "$1 por $2")
       .replace(/([0-9a-zñ)])\s*\/\s*([0-9a-zñ(])/gi, "$1 entre $2")
       .replace(/([0-9a-zñ)])\s*\+\s*([0-9a-zñ(])/gi, "$1 más $2")
       .replace(/(\d)\s*[-−]\s*([0-9a-zñ(])/gi, "$1 menos $2")
       .replace(/([0-9a-zñ)])\s*[-−]\s*(\d)/gi, "$1 menos $2");

  // 4) Coeficiente pegado a variable: "3x" → "3 equis", "2y" → "2 ye".
  s = s.replace(/(\d)([a-zñ])(?![a-zñ])/gi, (_, d, l) => `${d} ${NOMBRE_LETRA[l.toLowerCase()] || l}`);

  // 5) "y" como VARIABLE (no la conjunción "y"=«y»): solo junto a contexto matemático.
  s = s.replace(/\by\s+igual a/gi, "ye igual a")
       .replace(/igual a\s+y\b/gi, "igual a ye")
       .replace(/\b(despej\w*|variable|inc[oó]gnita|valor de|t[eé]rmino)\s+y\b/gi, "$1 ye");

  // 6) Letras de variable AISLADAS → su nombre. Solo consonantes (+w): las vocales a/e/i/o/u
  //    ya se pronuncian igual como letra o como palabra, así que no hace falta tocarlas, y así
  //    "manzanas y peras" o "5 y 3" conservan la "y"/vocales de la lengua natural.
  s = s.replace(/(^|[^a-zñáéíóúü])([b-df-hj-np-tvwxz])(?=$|[^a-zñáéíóúü])/gi,
        (_, pre, l) => pre + (NOMBRE_LETRA[l.toLowerCase()] || l));

  // 6b) COEFICIENTE por PARÉNTESIS: "2(x + 3)" se leía "2 equis más 3", que el alumno escribiría como
  //     2x + 3 — otra expresión distinta. Se dice el "por" y se marcan los extremos del grupo con una
  //     coma, para que la pausa haga audible qué va dentro: "2 por, equis más 3,".
  //     Va DESPUÉS de convertir los operadores: al hacerlo antes, la coma quedaba justo delante del
  //     "+" exterior ("…, + 4") y ese signo dejaba de casar con su regla, llegando crudo a la voz.
  s = s.replace(/(\d)\s*\(([^()]*)\)/g, "$1 por, $2,");

  // 7) Paréntesis y comillas angulares → pausa (el motor los lee raro o los deletrea); limpiar espacios.
  //    Las « » venían de las propias frases del tutor («resuélvelo») y llegaban crudas a la voz.
  s = s.replace(/[()«»"“”]/g, " ").replace(/\s{2,}/g, " ").trim();
  return s;
}

// Trocea el texto en FRASES CORTAS (≤ ~130 caracteres) para que ninguna locución sea larga y el
// navegador no la corte a mitad. Divide por signos de puntuación fuertes y, si una frase es enorme,
// por comas o espacios. Devuelve siempre al menos un trozo.
export function chunkForSpeech(text) {
  const s = String(text || "").trim();
  if (!s) return [];
  const piezas = s.match(/[^.!?;:]+[.!?;:]*/g) || [s];
  const out = [];
  const push = (x) => { const t = x.trim(); if (t) out.push(t); };
  let buf = "";
  for (const p of piezas) {
    if ((buf + p).length > 130 && buf) { push(buf); buf = ""; }
    buf += p;
    while (buf.length > 180) {
      let cut = buf.lastIndexOf(",", 170);
      if (cut < 60) cut = buf.lastIndexOf(" ", 170);
      if (cut < 60) cut = 170;
      push(buf.slice(0, cut)); buf = buf.slice(cut);
    }
  }
  push(buf);
  return out.length ? out : [s];
}

// VOZ DEL TUTOR: MASCULINA y ESTABLE. Dos defectos reportados por el cliente en una misma frase
// ("cambia de voz de mujer a voz de varón"):
//   · no se elegía por género — se tomaba la PRIMERA voz en español que ofreciera el navegador, que
//     en Chrome ("Google español") es femenina y en Windows puede ser Helena o Pablo según el equipo;
//   · y `onvoiceschanged` vuelve a dispararse cuando el navegador termina de cargar las voces remotas,
//     así que se RE-ELEGÍA a mitad de la sesión y el tutor cambiaba de voz mientras hablaba.
// Ahora se prefiere una voz masculina conocida, y la elegida se BLOQUEA en cuanto empieza a hablar:
// pase lo que pase con la lista de voces, el tutor no cambia de voz dentro de una sesión.
const VOZ_MASCULINA = /\b(pablo|[áa]lvaro|ra[úu]l|jorge|diego|juan|carlos|enrique|miguel|gonzalo|andr[ée]s|crist[íi]an|liberto|arnau|el[íi]as|mateo|tom[áa]s|luciano|male|hombre|masculin)\b/i;
const VOZ_FEMENINA = /\b(helena|sabina|elvira|dalia|m[óo]nica|paulina|luc[íi]a|laura|marisol|catalina|isabela|salom[ée]|camila|ver[óo]nica|pen[ée]lope|esperanza|tania|sof[íi]a|valentina|renata|larissa|yolanda|paloma|estrella|female|mujer|femenin)\b/i;

/**
 * LA VOZ NEURONAL, Y LA DEL NAVEGADOR COMO RED.
 *
 * El cliente pidió quitar el sonido "robótico y metálico" de
 * `window.speechSynthesis` conectando la síntesis a un endpoint de voz neuronal
 * (`app/api/voz/route.ts`). Aquí está el lado del navegador:
 *
 *   · se pregunta UNA vez si hay voz neuronal configurada;
 *   · si la hay, cada trozo se pide como MP3 y se reproduce con un <audio>;
 *   · el aviso de arranque —`onStart`, lo que enciende el foco de la pizarra—
 *     se dispara con el evento `playing` REAL del audio, igual que antes se
 *     disparaba con el `onstart` de la locución: la sincronía no cambia;
 *   · y si falta la clave, falla la red o el navegador no deja sonar el audio,
 *     la frase se termina con la voz del navegador. La clase no se queda muda.
 */
const RUTA_VOZ = "/api/voz";

/**
 * UN SILENCIO DE MILISEGUNDO, PARA DESBLOQUEAR EL AUDIO.
 *
 * Los navegadores sólo dejan sonar audio si la primera reproducción de un
 * elemento ocurre dentro de un gesto del usuario. La primera frase de la
 * lección llega DESPUÉS de pedirla al servidor, y para entonces el gesto ya ha
 * pasado: sin esto, Safari se negaba a reproducir y la clase caía a la voz del
 * navegador justo en la frase en que estrenaba la neuronal. Al primer clic se
 * reproduce este silencio en el MISMO elemento que luego dirá las frases, y el
 * elemento queda autorizado para el resto de la sesión.
 */
const SILENCIO = "data:audio/wav;base64,UklGRqQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YYAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

export class TTS {
  constructor() {
    this.synth = typeof window !== "undefined" ? window.speechSynthesis : null;
    this.enabled = !!this.synth;
    /** `null` mientras no se sabe; `true`/`false` cuando el servidor contesta. */
    this.neural = null;
    this.proveedor = null;
    this.motivo = null;
    this.claveQueFalta = null;
    this._sonda = null;
    /** Frase → URL del audio ya descargado (una clase repite mucho). */
    this._audios = new Map();
    /** EL ÚNICO reproductor de la clase: se reutiliza para todas las frases. */
    this._audio = null;
    this._desbloqueado = false;
    this._fallosNeurales = 0;
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      const abrir = () => this.desbloquear();
      window.addEventListener("pointerdown", abrir, { once: true, capture: true });
      window.addEventListener("keydown", abrir, { once: true, capture: true });
    }
    this.voice = null;
    this.masculina = false;
    this._fijada = false;   // una vez que ha empezado a hablar, la voz YA NO se cambia
    this.rate = 0.95; // un poco más pausado: se entiende mejor y suena menos entrecortado
    this.pitch = 1.0;
    this._pickVoice();
    // Las voces cargan async en algunos navegadores. Se vuelve a elegir SOLO mientras no esté fijada
    // y no se haya encontrado ya una masculina (si llega tarde, se aprovecha; si ya habla, no se toca).
    if (this.synth && "onvoiceschanged" in this.synth) {
      this.synth.onvoiceschanged = () => this._pickVoice();
    }
  }

  _pickVoice() {
    if (!this.synth || this._fijada || this.masculina) return;
    const es = (this.synth.getVoices() || []).filter((v) => /^es/i.test(v.lang));
    if (!es.length) return;
    // Preferencia por variante: España, luego América, luego cualquier español.
    const grupos = [
      es.filter((v) => /^es[-_]ES/i.test(v.lang)),
      es.filter((v) => /^es[-_](MX|US|419|AR|CO|CL|PE)/i.test(v.lang)),
      es,
    ];
    let elegida = null;
    for (const g of grupos) { elegida = g.find((v) => VOZ_MASCULINA.test(v.name)); if (elegida) break; }
    this.masculina = !!elegida;
    // Sin voz masculina instalada, se descarta al menos la que se sabe femenina...
    if (!elegida) for (const g of grupos) { elegida = g.find((v) => !VOZ_FEMENINA.test(v.name)); if (elegida) break; }
    if (!elegida) elegida = grupos.find((g) => g.length)?.[0] || es[0];
    this.voice = elegida || null;
    // ...y se BAJA el tono, que es lo único que queda en manos de la aplicación para que la voz
    // disponible suene masculina. Con una voz masculina real el tono se deja natural.
    this.pitch = this.masculina ? 0.95 : 0.7;
  }

  hasSpanishVoice() {
    return !!this.voice || this.neural === true;
  }

  /** El reproductor: uno solo, creado la primera vez que hace falta. */
  _elemento() {
    if (this._audio) return this._audio;
    if (typeof Audio !== "function") return null;
    const a = new Audio();
    a.preload = "auto";
    this._audio = a;
    return a;
  }

  /**
   * Autoriza el audio con el primer gesto del alumno (el clic de «Reproducir»,
   * una tecla, un toque). Es idempotente y no suena: es un silencio.
   */
  desbloquear() {
    if (this._desbloqueado) return;
    const a = this._elemento();
    if (!a) return;
    this._desbloqueado = true;
    try {
      a.muted = true;
      a.src = SILENCIO;
      const intento = a.play();
      const soltar = () => {
        try { a.pause(); a.currentTime = 0; } catch {}
        a.muted = false;
      };
      if (intento?.then) intento.then(soltar, soltar);
      else soltar();
    } catch {
      a.muted = false;
    }
  }

  /** ¿Está sonando la voz neuronal del servidor, y no la del navegador? */
  usandoNeural() {
    return this.neural === true;
  }

  /**
   * ¿Hay voz neuronal? Se pregunta una sola vez por sesión y se recuerda la
   * promesa: la lección la espera al montar para poder anunciar qué voz suena.
   */
  listaLaVoz() {
    if (this._sonda) return this._sonda;
    if (typeof fetch !== "function") {
      this.neural = false;
      this._sonda = Promise.resolve(false);
      return this._sonda;
    }
    this._sonda = fetch(RUTA_VOZ, { method: "GET" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        this.neural = Boolean(d?.disponible);
        this.proveedor = d?.proveedor ?? null;
        // POR QUÉ NO SUENA LA NEURONAL, GUARDADO PARA DECIRLO EN PANTALLA. El
        // cliente auditó la interfaz, leyó "voz: Microsoft Raul" y tuvo que
        // revisar el código para saber que faltaba una clave. Eso se dice aquí.
        this.motivo = d?.motivo ?? null;
        this.claveQueFalta = Array.isArray(d?.variables?.google) ? d.variables.google[0] : null;
        // CON VOZ NEURONAL, LA DEL NAVEGADOR SE APAGA. El cliente lo pidió con
        // esas palabras —"desactivando la síntesis local del navegador"—: no es
        // sólo preferir una, es que la metálica no puede colarse a mitad de la
        // clase. Queda como último recurso si la neuronal se cae del todo.
        if (this.neural && this.synth) {
          try { this.synth.cancel(); } catch {}
        }
        return this.neural;
      })
      .catch(() => {
        this.neural = false;
        return false;
      });
    return this._sonda;
  }

  // Describe el estado para la UI (audio real vs. subtítulos temporizados).
  describe() {
    if (!this.enabled) return "sin TTS (subtítulos)";
    if (this.neural) return `voz neuronal (${this.proveedor ?? "servidor"})`;
    // Sin clave en el servidor, la pantalla lo DICE: es la diferencia entre
    // "suena mal" y "falta esto por configurar".
    const falta = this.motivo === "sin_configurar" ? ` · sin voz neuronal: falta ${this.claveQueFalta ?? "GOOGLE_TTS_API_KEY"} en el servidor` : "";
    if (!this.voice) return `voz del sistema (sin es-ES)${falta}`;
    return `voz del navegador: ${this.voice.name}${falta}`;
  }

  /**
   * Habla el texto. Devuelve una Promise que resuelve al terminar.
   * @param {string} text
   * @param {{ signal?: AbortSignal }} [opts]
   */
  speak(text, opts = {}) {
    const { signal, onStart } = opts;
    // Lo que se DICE se normaliza (variables y símbolos → palabras); la pantalla/subtítulos
    // muestran el texto ORIGINAL (esto no los toca: solo afecta a la locución).
    const spoken = normalizeForSpeech(text);
    if (!spoken || signal?.aborted) return Promise.resolve();
    // A partir de la PRIMERA locución la voz queda fijada: aunque el navegador siga cargando voces y
    // dispare `onvoiceschanged`, el tutor no cambiará de voz a mitad de la lección.
    if (this.voice) this._fijada = true;

    // LA VOZ NEURONAL VA PRIMERO. Devuelve cuántos trozos quedaron sin decir:
    // 0 si los dijo todos, y los que falten se terminan abajo con la voz del
    // navegador (frase entera si la neuronal no estaba, o la cola si se cayó a
    // medias, que es lo que evita repetir lo ya dicho).
    return this._hablarNeural(spoken, { signal, onStart }).then((dichos) =>
      dichos === null ? this._hablarLocal(spoken, { signal, onStart }, 0)
        : dichos >= 0 ? this._hablarLocal(spoken, { signal, onStart: null }, dichos)
        : undefined,
    );
  }

  /**
   * Habla con la voz neuronal del servidor.
   *
   * Devuelve `null` si no hay voz neuronal (hay que decirlo todo con la del
   * navegador), `-1` si lo dijo entero, o el índice del primer trozo que NO
   * llegó a sonar, para que la voz del navegador siga justo por ahí.
   */
  async _hablarNeural(spoken, { signal, onStart }) {
    // Con la voz apagada por el alumno no suena NADA: ni la del navegador ni
    // ésta. El interruptor de la lección es uno solo.
    if (!this.enabled) return null;
    if (this.neural === false || typeof fetch !== "function" || typeof Audio !== "function") return null;
    if (this.neural === null && !(await this.listaLaVoz())) return null;
    if (signal?.aborted) return -1;
    const trozos = chunkForSpeech(spoken);
    for (let i = 0; i < trozos.length; i++) {
      if (signal?.aborted) return -1;
      // Un tropiezo de red no cambia de voz a mitad de clase: se reintenta una
      // vez, y sólo si vuelve a fallar se cede el resto a la del navegador.
      let url = await this._audioDe(trozos[i], signal);
      if (!url && this.neural !== false && !signal?.aborted) url = await this._audioDe(trozos[i], signal);
      if (!url) return this._cederALaLocal(i);
      // Mientras suena éste se va pidiendo el siguiente: sin esto queda un
      // silencio entre frase y frase, del tamaño de la red.
      if (trozos[i + 1]) this._audioDe(trozos[i + 1], signal).catch(() => {});
      const sono = await this._reproducir(url, signal, i === 0 ? onStart : null);
      if (!sono) return this._cederALaLocal(i);
      this._fallosNeurales = 0;
    }
    return -1;
  }

  /**
   * Cede la palabra a la voz del navegador desde el trozo `i`. A la tercera
   * caída seguida se da la neuronal por perdida y no se vuelve a intentar: es
   * preferible una voz peor a una clase a trompicones.
   */
  _cederALaLocal(i) {
    this._fallosNeurales++;
    if (this._fallosNeurales >= 3) this.neural = false;
    return i === 0 ? null : i;
  }

  /** El MP3 de una frase, del servidor o de lo ya descargado. `null` si no hay. */
  async _audioDe(texto, signal) {
    const guardado = this._audios.get(texto);
    if (guardado) return guardado;
    try {
      const r = await fetch(RUTA_VOZ, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto }),
        signal,
      });
      if (!r.ok) {
        // 503 es "esta instalación no tiene voz neuronal": no se vuelve a pedir.
        if (r.status === 503) this.neural = false;
        return null;
      }
      const url = URL.createObjectURL(await r.blob());
      this._audios.set(texto, url);
      // Una clase no necesita más: al pasarse, se suelta la más antigua.
      while (this._audios.size > 80) {
        const vieja = this._audios.keys().next().value;
        if (vieja === undefined) break;
        try { URL.revokeObjectURL(this._audios.get(vieja)); } catch {}
        this._audios.delete(vieja);
      }
      return url;
    } catch {
      return null;
    }
  }

  /**
   * Reproduce un MP3 y resuelve al acabar. `false` si no llegó a sonar —el
   * navegador puede negarse a reproducir audio sin un gesto del usuario—, y
   * entonces la frase se dice con la voz del navegador.
   */
  _reproducir(url, signal, onStart) {
    const audio = this._elemento();
    if (!audio) return Promise.resolve(false);
    return new Promise((resolve) => {
      let acabado = false;
      const sonando = () => { try { onStart?.(); } catch {} };
      const terminado = () => fin(true);
      const fallo = () => fin(false);
      const abortar = () => { try { audio.pause(); } catch {} fin(true); };
      const fin = (ok) => {
        if (acabado) return;
        acabado = true;
        audio.removeEventListener("playing", sonando);
        audio.removeEventListener("ended", terminado);
        audio.removeEventListener("error", fallo);
        signal?.removeEventListener?.("abort", abortar);
        resolve(ok);
      };
      // El foco de la pizarra se enciende cuando el audio EMPIEZA A SONAR.
      audio.addEventListener("playing", sonando);
      audio.addEventListener("ended", terminado);
      audio.addEventListener("error", fallo);
      signal?.addEventListener?.("abort", abortar, { once: true });
      try {
        audio.muted = false;
        audio.src = url;
        audio.currentTime = 0;
      } catch {
        return fin(false);
      }
      const intento = audio.play();
      if (intento?.catch) intento.catch(() => fin(false));
    });
  }

  /**
   * La voz del navegador, desde el trozo `desde` en adelante.
   *
   * No se usa mientras la neuronal esté en pie: sólo cuando esta instalación no
   * la tiene configurada, o cuando acaba de fallar y hay una frase a medias.
   */
  _hablarLocal(spoken, { signal, onStart }, desde = 0) {
    // Sin voz real: retardo proporcional (subtítulos temporizados). Aquí no hay
    // evento que esperar, así que el "arranque" es inmediato: el resaltado se
    // enciende a la vez que aparece el subtítulo.
    if (!this.enabled || !this.voice) {
      try { onStart?.(); } catch {}
      const pendiente = desde > 0 ? chunkForSpeech(spoken).slice(desde).join(" ") : spoken;
      return new Promise((resolve) => {
        const ms = Math.min(22000, Math.max(1200, pendiente.length * 60));
        const t = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
      });
    }

    // Los motores del navegador CORTAN las locuciones largas (~15 s), dejando palabras a medias y
    // "saltándose" texto (no se entiende la explicación). Solución: hablar FRASE POR FRASE (trozos
    // cortos), en secuencia, con un "keepalive" (pause+resume) que evita que Chrome detenga la voz.
    const chunks = chunkForSpeech(spoken);
    if (desde >= chunks.length) return Promise.resolve();
    return new Promise((resolve) => {
      let aborted = false;
      signal?.addEventListener("abort", () => { aborted = true; try { this.synth.cancel(); } catch {} }, { once: true });
      const speakNext = (i) => {
        if (aborted || i >= chunks.length) return resolve();
        // El arranque se avisa una sola vez, con el primer trozo: los demás son
        // continuación de la misma frase.
        this._speakOne(chunks[i], () => aborted, i === desde ? onStart : null).then(() =>
          speakNext(i + 1),
        );
      };
      speakNext(desde);
    });
  }

  // Habla UN trozo corto. Resuelve al terminar (o al abortar). Keepalive contra el corte de Chrome.
  // Habla UN trozo. `onStart` se dispara con el evento `onstart` REAL de la
  // locución, no antes: es lo que permite encender el resaltado justo cuando
  // empieza a sonar la palabra, y no cuando nosotros la encolamos (entre una
  // cosa y otra el navegador puede tardar cientos de milisegundos).
  _speakOne(chunk, isAborted, onStart) {
    return new Promise((resolve) => {
      if (isAborted()) return resolve();
      let done = false, keep = null, guard = null;
      let arrancado = false;
      const arrancar = () => {
        if (arrancado || isAborted()) return;
        arrancado = true;
        try { onStart?.(); } catch {}
      };
      const finish = () => {
        if (done) return; done = true;
        if (keep) clearInterval(keep);
        if (guard) clearTimeout(guard);
        resolve();
      };
      try {
        this.synth.cancel();
        const u = new SpeechSynthesisUtterance(chunk);
        u.lang = this.voice?.lang || "es-ES";
        if (this.voice) u.voice = this.voice;
        u.rate = this.rate;
        u.pitch = this.pitch;
        u.onstart = arrancar;
        u.onend = () => { arrancar(); finish(); };
        u.onerror = () => { arrancar(); finish(); };
        this.synth.speak(u);
        // Keepalive: Chrome detiene la locución tras ~15 s; pause+resume la mantiene viva.
        keep = setInterval(() => {
          if (isAborted()) { try { this.synth.cancel(); } catch {} return finish(); }
          try { this.synth.pause(); this.synth.resume(); } catch {}
        }, 9000);
        // Failsafe AMPLIO (por si onend nunca llega): proporcional, SIN tope bajo que corte la voz.
        guard = setTimeout(() => { arrancar(); finish(); }, Math.max(5000, chunk.length * 150));
      } catch { finish(); }
    });
  }

  cancel() {
    if (this.synth) this.synth.cancel();
    // Y el MP3 que estuviera sonando: callar es callar del todo.
    if (this._audio) {
      try { this._audio.pause(); } catch {}
    }
  }
}
