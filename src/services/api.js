// Vite reemplaza VITE_API_URL durante el build de Vercel. En desarrollo se usa
// el backend local para que el proyecto pueda ejecutarse sin configuración extra.
const API_URL = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

async function request(path, options = {}) {
  let respuesta;

  try {
    respuesta = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor. Inténtalo de nuevo.");
  }

  if (!respuesta.ok) {
    const error = await respuesta.json().catch(() => null);
    throw new Error(error?.detail || "No fue posible completar la solicitud.");
  }

  return respuesta.json();
}

export function obtenerEventos() {
  return request("/eventos");
}

export function crearEvento(evento) {
  return request("/eventos", {
    method: "POST",
    body: JSON.stringify(evento),
  });
}
