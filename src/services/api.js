const API_URL = "http://127.0.0.1:8000";

export async function obtenerEventos() {
  const respuesta = await fetch(`${API_URL}/eventos`);

  if (!respuesta.ok) {
    throw new Error("No fue posible cargar los eventos");
  }

  return respuesta.json();
}