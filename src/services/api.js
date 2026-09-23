// Frontend-only API client.
// The backend team only needs to expose the routes documented in README_FRONTEND_API.md.
const API_URL = (import.meta.env.VITE_API_URL || "https://eventhub-backend-tbst.onrender.com").replace(/\/$/, "");

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { "Content-Type": "application/json", ...options.headers },
      ...options,
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor. Inténtalo de nuevo.");
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => null)
    : await response.text().catch(() => "");

  if (!response.ok) {
    const detail = typeof data === "object" && data?.detail ? data.detail : null;
    throw new Error(detail || "No fue posible completar la solicitud.");
  }

  return data;
}

export function obtenerEventos() {
  return request("/eventos");
}

export function obtenerEvento(id) {
  return request(`/eventos/${id}`);
}

export function crearEvento(evento) {
  return request("/eventos", {
    method: "POST",
    body: JSON.stringify(evento),
  });
}

export function actualizarEvento(id, evento) {
  return request(`/eventos/${id}`, {
    method: "PUT",
    body: JSON.stringify(evento),
  });
}

export function eliminarEvento(id) {
  return request(`/eventos/${id}`, {
    method: "DELETE",
  });
}

export function obtenerSubtareas(eventoId) {
  return request(`/subtareas/?evento_id=${encodeURIComponent(eventoId)}`);
}

export function crearSubtarea(subtarea) {
  return request("/subtareas/", {
    method: "POST",
    body: JSON.stringify(subtarea),
  });
}

export function actualizarSubtarea(id, subtarea) {
  return request(`/subtareas/${id}`, {
    method: "PUT",
    body: JSON.stringify(subtarea),
  });
}

export function eliminarSubtarea(id) {
  return request(`/subtareas/${id}`, {
    method: "DELETE",
  });
}
