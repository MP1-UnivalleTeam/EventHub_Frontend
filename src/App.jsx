import "./App.css";
import { useEffect, useRef, useState } from "react";
import { crearEvento, obtenerEventos } from "./services/api.js";

const initialTasks = [
  { id: 1, name: "Reservar salón", status: "Hecho", due: "02 Nov", hours: "2h", note: "Salón campestre confirmado." },
  { id: 2, name: "Enviar invitaciones", status: "Hecho", due: "03 Nov", hours: "1h", note: "Invitaciones enviadas a 120 invitados." },
  { id: 3, name: "Confirmar catering", status: "Pendiente", due: "Hoy", hours: "2h", urgent: true, note: "Vence hoy: decisión de menú para evitar penalizaciones contractuales." },
  { id: 4, name: "Búsqueda de proveedores", status: "Pospuesto", due: "05 Nov", hours: "5h", note: "Pendiente comparar tres cotizaciones." },
];

const rutasValidas = new Set(["/eventos", "/hoy"]);

function obtenerRutaActual() {
  return rutasValidas.has(window.location.pathname) ? window.location.pathname : "/eventos";
}

function navegarA(ruta) {
  if (window.location.pathname !== ruta) window.history.pushState({}, "", ruta);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function formatearFecha(fecha) {
  if (!fecha) return "Sin fecha";
  const [anio, mes, dia] = fecha.slice(0, 10).split("-").map(Number);
  if (!anio || !mes || !dia) return fecha;
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" }).format(new Date(anio, mes - 1, dia));
}

function Modal({ title, close, children }) {
  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <button className="close" type="button" aria-label="Cerrar" onClick={close}>×</button>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

function EnlaceRuta({ ruta, activa, children }) {
  return (
    <a className={activa ? "selected" : ""} href={ruta} onClick={(event) => { event.preventDefault(); navegarA(ruta); }}>
      {children}
    </a>
  );
}

function FormularioEvento({ onCancelar, onCrear }) {
  const [formulario, setFormulario] = useState({ titulo: "", fecha: "", descripcion: "" });
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const actualizar = (event) => {
    const { name, value } = event.target;
    setFormulario((anterior) => ({ ...anterior, [name]: value }));
  };

  const enviar = async (event) => {
    event.preventDefault();
    setError("");
    const titulo = formulario.titulo.trim();
    if (titulo.length < 3) {
      setError("Escribe un nombre de al menos 3 caracteres.");
      return;
    }

    setEnviando(true);
    try {
      await onCrear({ ...formulario, titulo, descripcion: formulario.descripcion.trim() || null });
    } catch (errorSolicitud) {
      setError(errorSolicitud.message);
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} noValidate>
      <p>Los datos se enviarán al servidor y quedarán guardados en la base de datos.</p>
      <label htmlFor="titulo">Nombre del evento</label>
      <input id="titulo" name="titulo" value={formulario.titulo} onChange={actualizar} minLength="3" maxLength="120" placeholder="Ej. Boda de Elena y Marcos" required autoFocus />
      <label htmlFor="fecha">Fecha</label>
      <input id="fecha" name="fecha" type="date" value={formulario.fecha} onChange={actualizar} required />
      <label htmlFor="descripcion">Descripción <span className="optional">(opcional)</span></label>
      <textarea id="descripcion" name="descripcion" value={formulario.descripcion} onChange={actualizar} maxLength="500" placeholder="Incluye un detalle útil para el equipo." />
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="actions">
        <button className="btn ghost" type="button" onClick={onCancelar} disabled={enviando}>Cancelar</button>
        <button className="btn primary" type="submit" disabled={enviando}>{enviando ? "Guardando…" : "Crear evento"}</button>
      </div>
    </form>
  );
}

export default function App() {
  const [ruta, setRuta] = useState(obtenerRutaActual);
  const [eventos, setEventos] = useState([]);
  const [cargandoEventos, setCargandoEventos] = useState(true);
  const [errorEventos, setErrorEventos] = useState("");
  const [tasks, setTasks] = useState(initialTasks);
  const [active, setActive] = useState(initialTasks[2]);
  const [modal, setModal] = useState("");
  const [note, setNote] = useState("");
  const [toast, setToast] = useState("");
  const temporizadorToast = useRef();
  const done = tasks.filter((task) => task.status === "Hecho").length;

  const cargarEventos = async ({ mostrarCarga = true } = {}) => {
    if (mostrarCarga) setCargandoEventos(true);
    setErrorEventos("");
    try {
      const datos = await obtenerEventos();
      setEventos(Array.isArray(datos) ? datos : []);
    } catch (error) {
      setErrorEventos(error.message);
    } finally {
      setCargandoEventos(false);
    }
  };

  useEffect(() => {
    const cargaInicial = window.setTimeout(() => cargarEventos({ mostrarCarga: false }), 0);
    const actualizarRuta = () => setRuta(obtenerRutaActual());
    window.addEventListener("popstate", actualizarRuta);
    return () => {
      window.clearTimeout(cargaInicial);
      window.removeEventListener("popstate", actualizarRuta);
      window.clearTimeout(temporizadorToast.current);
    };
  }, []);

  const notify = (texto) => {
    window.clearTimeout(temporizadorToast.current);
    setToast(texto);
    temporizadorToast.current = window.setTimeout(() => setToast(""), 4000);
  };

  const crear = async (evento) => {
    const creado = await crearEvento(evento);
    setEventos((anteriores) => [creado, ...anteriores]);
    setModal("");
    navegarA("/eventos");
    notify("Evento creado y guardado correctamente");
  };

  const guardarEjecucion = (status) => {
    setTasks((tareas) => tareas.map((tarea) => tarea.id === active.id ? { ...tarea, status, note: note || tarea.note } : tarea));
    setActive({ ...active, status, note: note || active.note });
    setNote("");
    setModal("");
    notify(status === "Hecho" ? "Gestión marcada como hecha" : "Gestión pospuesta correctamente");
  };

  return (
    <main className="app">
      <header>
        <a className="brand" href="/eventos" onClick={(event) => { event.preventDefault(); navegarA("/eventos"); }}><i>EH</i>EventHub</a>
        <nav aria-label="Navegación principal">
          <EnlaceRuta ruta="/eventos" activa={ruta === "/eventos"}>Eventos</EnlaceRuta>
          <EnlaceRuta ruta="/hoy" activa={ruta === "/hoy"}>Hoy</EnlaceRuta>
        </nav>
        <button className="btn primary" type="button" onClick={() => setModal("crear-evento")}>+ Crear evento</button>
      </header>

      {toast && <div className="toast" role="status">✓ {toast}</div>}

      {ruta === "/eventos" ? (
        <Eventos eventos={eventos} cargando={cargandoEventos} error={errorEventos} recargar={cargarEventos} crear={() => setModal("crear-evento")} />
      ) : (
        <Today tasks={tasks} active={active} setActive={setActive} open={() => setModal("execute")} done={done} />
      )}

      {modal === "crear-evento" && <Modal title="Crear evento" close={() => setModal("")}><FormularioEvento onCancelar={() => setModal("")} onCrear={crear} /></Modal>}

      {modal === "execute" && (
        <Modal title="Registrar ejecución" close={() => setModal("")}>
          <p>Actualiza el estado de <b>{active.name}</b>.</p>
          <label htmlFor="note">Nota opcional</label>
          <textarea id="note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Escribe un detalle para el historial..." />
          <div className="actions">
            <button className="btn ghost" type="button" onClick={() => guardarEjecucion("Pospuesto")}>↻ Posponer</button>
            <button className="btn primary" type="button" onClick={() => guardarEjecucion("Hecho")}>✓ Marcar como hecho</button>
          </div>
        </Modal>
      )}
    </main>
  );
}

function Eventos({ eventos, cargando, error, recargar, crear }) {
  return (
    <section className="page">
      <div className="heading">
        <div>
          <small>TU PLANIFICACIÓN</small>
          <h1>Eventos</h1>
          <p>Crea un evento y consérvalo disponible para tu equipo.</p>
        </div>
        <button className="btn secondary" type="button" onClick={crear}>+ Nuevo evento</button>
      </div>

      {cargando && <section className="card state-card" aria-live="polite"><span className="spinner" />Cargando eventos guardados…</section>}
      {!cargando && error && (
        <section className="card state-card error-state" role="alert">
          <div><b>No se pudieron cargar los eventos.</b><p>{error}</p></div>
          <button className="btn ghost" type="button" onClick={recargar}>Reintentar</button>
        </section>
      )}
      {!cargando && !error && eventos.length === 0 && (
        <section className="card empty-state">
          <div className="empty-icon">✦</div><h2>Aún no hay eventos</h2>
          <p>Empieza creando el primer evento. Se enviará al servidor y se guardará en la base de datos.</p>
          <button className="btn primary" type="button" onClick={crear}>Crear el primer evento</button>
        </section>
      )}
      {!cargando && !error && eventos.length > 0 && (
        <section className="event-grid" aria-label="Eventos guardados">
          {eventos.map((evento) => (
            <article className="event" key={evento.id ?? `${evento.titulo}-${evento.fecha}`}>
              <div className="event-icon">✦</div>
              <div><small>EVENTO GUARDADO</small><h2>{evento.titulo}</h2><p>▣ {formatearFecha(evento.fecha)}</p>{evento.descripcion && <p className="event-description">{evento.descripcion}</p>}</div>
            </article>
          ))}
        </section>
      )}
    </section>
  );
}

function Today({ tasks, active, setActive, open, done }) {
  const groups = [
    ["Gestiones urgentes", "Atención inmediata", tasks.filter((task) => task.urgent && task.status !== "Hecho")],
    ["Otras gestiones pendientes", "Programadas para hoy", tasks.filter((task) => !task.urgent && task.status === "Pendiente")],
    ["Gestiones realizadas hoy", "Historial del día", tasks.filter((task) => task.status === "Hecho")],
  ];
  return (
    <section className="page">
      <div className="heading"><div><small>VISTA DE PROTOTIPO</small><h1>Hoy</h1><p>Prioriza lo importante y conserva el ritmo.</p></div><div className="capacity">Capacidad diaria <b>{done + 1}h <small>/ 4h</small></b><span /></div></div>
      <div className="today">
        <div>{groups.map(([title, subtitle, group]) => (
          <section className="card group" key={title}>
            <h2>{title}</h2><p>{subtitle}</p>
            {group.length ? group.map((task) => (
              <button className={`today-task ${task.urgent ? "urgent" : ""}`} type="button" key={task.id} onClick={() => setActive(task)}>
                <span><b>{task.name}</b>{task.urgent && <em>⚠ Urgente</em>}<small>{task.note}</small></span><b>{task.hours}</b>
              </button>
            )) : <p>No hay gestiones en esta sección.</p>}
          </section>
        ))}</div>
        <aside className="card panel">
          <small>GESTIÓN SELECCIONADA</small><h2>{active.name}</h2><p>◷ {active.hours} estimadas &nbsp; ▣ {active.due}</p><blockquote>{active.note}</blockquote>
          <button className="btn primary" type="button" onClick={open}>Registrar ejecución</button>
          <small>Las gestiones de esta vista aún son demostrativas; la creación de eventos sí se guarda en la base de datos.</small>
        </aside>
      </div>
    </section>
  );
}
