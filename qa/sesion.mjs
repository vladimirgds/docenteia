/**
 * Iniciar sesión contra NextAuth desde una batería de QA.
 *
 * El PMV 1 declaraba que lo que necesita sesión iniciada quedaba fuera del
 * alcance de una batería sin navegador. Desde el MVP 2 no lo está: son dos
 * pasos —pedir el token CSRF, que viene con su cookie, y enviarlo junto con las
 * credenciales al proveedor— y con ellos se pueden probar de verdad las rutas
 * protegidas, que son casi todas las que se han añadido.
 *
 * Vive aparte porque lo usan varias baterías, y una copia por batería es una
 * copia que se queda atrás en cuanto cambie la autenticación.
 */

/** Las cookies de una respuesta, en el formato de la cabecera `cookie`. */
export function leerCookies(respuesta) {
  const crudas = respuesta.headers.getSetCookie?.() ?? [];
  return crudas.map((c) => c.split(";")[0]).join("; ");
}

/**
 * Devuelve la cabecera `cookie` de una sesión abierta, o null si no se pudo.
 */
export async function iniciarSesion(base, email, password) {
  try {
    const rCsrf = await fetch(`${base}/api/auth/csrf`);
    const cookiesCsrf = leerCookies(rCsrf);
    const { csrfToken } = await rCsrf.json();

    const cuerpo = new URLSearchParams({
      csrfToken,
      email,
      password,
      callbackUrl: base,
      redirect: "false",
    });

    const rLogin = await fetch(`${base}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        cookie: cookiesCsrf,
      },
      body: cuerpo.toString(),
      redirect: "manual",
    });

    const cookiesSesion = leerCookies(rLogin);
    return /session-token/.test(cookiesSesion) ? `${cookiesCsrf}; ${cookiesSesion}` : null;
  } catch {
    return null;
  }
}

/**
 * Registra un alumno y devuelve su sesión ya iniciada.
 *
 * El curso se envía tal como lo manda el formulario de registro, porque de él
 * depende qué prueba se le compone: es el dato que se está probando.
 */
export async function registrarAlumno(base, { email, password, nombre, ciclo, grado }) {
  const alta = await fetch(`${base}/api/registro`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre, email, password, ciclo, grado }),
  });
  if (!alta.ok) return { ok: false, estado: alta.status, sesion: null };

  const sesion = await iniciarSesion(base, email, password);
  return { ok: Boolean(sesion), estado: alta.status, sesion };
}
