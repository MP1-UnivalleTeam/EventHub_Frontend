import "./App.css";
import { useEffect, useRef, useState } from "react";
import {
  actualizarEvento,
  actualizarSubtarea,
  crearEvento,
  crearSubtarea,
  eliminarEvento,
  eliminarSubtarea,
  obtenerEvento,
  obtenerEventos,
  obtenerSubtareas,
} from "./services/api.js";

const rutas = ["/eventos", "/hoy", "/crear-evento"];

function rutaActual() {
  const path = window.location.pathname;
  if (path.startsWith("/eventos/") && path.split("/")[2]) return path;
  return rutas.includes(path) ? path : "/eventos";
}

function navegar(path) {
  if (window.location.pathname !== path) window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function formatearFecha(fecha) {
  if (!fecha) return "Sin fecha";
  const [y, m, d] = String(fecha).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return fecha;
  return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", year: "numeric" }).format(new Date(y, m - 1, d));
}

function normalizarEstado(estado) {
  const value = String(estado || "pendiente").trim().toLowerCase();
  if (value === "hecho" || value.includes("complet")) return "hecho";
  if (value === "pospuesto") return "pospuesto";
  return "pendiente";
}

function etiquetaEstado(estado) {
  const value = normalizarEstado(estado);
  if (value === "hecho") return "Hecho";
  if (value === "pospuesto") return "Pospuesto";
  return "Pendiente";
}

function obtenerHoras(item) {
  const value = Number(item?.horas_estimadas ?? item?.horas ?? item?.hours ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function obtenerTituloSubtarea(item) {
  return item?.titulo ?? item?.nombre ?? "Sin título";
}

function Toast({ type = "success", message }) {
  if (!message) return null;
  return <div className={`toast toast-${type}`} role={type === "error" ? "alert" : "status"}>{type === "success" ? "✓" : "!"} {message}</div>;
}

function Modal({ title, subtitle, close, children, wide = false }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event) => event.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close]);
  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <button ref={closeRef} className="close" type="button" aria-label="Cerrar" onClick={close}>×</button>
        <h2 id="modal-title">{title}</h2>
        {subtitle && <p className="modal-subtitle">{subtitle}</p>}
        {children}
      </section>
    </div>
  );
}

function Header({ ruta, abrirCrear }) {
  return (
    <header>
      <button className="brand" type="button" onClick={() => navegar("/eventos")}><span className="brand-icon">▣</span>EventHub</button>
      <nav aria-label="Navegación principal">
        <button className={ruta === "/eventos" || ruta.startsWith("/eventos/") ? "nav-link active" : "nav-link"} onClick={() => navegar("/eventos")}>▣ Eventos</button>
        <button className={ruta === "/hoy" ? "nav-link active" : "nav-link"} onClick={() => navegar("/hoy")}>◷ Hoy</button>
      </nav>
      <div className="header-spacer" />
      <div className="search-placeholder">⌕ <span>Buscar eventos, tareas...</span></div>
      <button className="icon-button" aria-label="Notificaciones">♧</button>
      <button className="icon-button" aria-label="Ayuda">?</button>
      <button className="btn primary header-create" type="button" onClick={abrirCrear}>＋ Crear Evento</button>
      <div className="avatar" aria-label="Perfil">LV</div>
    </header>
  );
}

function FormularioEvento({ onCancelar, onCrear }) {
  const [formulario, setFormulario] = useState({
    titulo: "",
    fecha: "",
    horas: "",
    usuario_responsable: "",
    descripcion: "",
  });
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState("");
  const [enviando, setEnviando] = useState(false);

  const actualizar = (event) => {
    const { name, value } = event.target;
    setFormulario((prev) => ({ ...prev, [name]: value }));
    setErrores((prev) => ({ ...prev, [name]: "" }));
    setErrorServidor("");
  };

  const validar = () => {
    const next = {};
    if (!formulario.titulo.trim()) next.titulo = "El título es requerido.";
    else if (formulario.titulo.trim().length < 5) next.titulo = "El título debe tener al menos 5 caracteres.";
    if (!formulario.fecha) next.fecha = "La fecha del evento es requerida.";
    if (!formulario.horas || Number(formulario.horas) <= 0 || !Number.isInteger(Number(formulario.horas))) next.horas = "Las horas deben ser mayor a 0.";
    return next;
  };

  const enviar = async (event) => {
    event.preventDefault();
    const next = validar();
    setErrores(next);
    setErrorServidor("");
    if (Object.keys(next).length) return;

    setEnviando(true);
    try {
      await onCrear({
        titulo: formulario.titulo.trim(),
        fecha: formulario.fecha,
        horas: Number(formulario.horas),
        usuario_responsable: formulario.usuario_responsable.trim() || null,
        descripcion: formulario.descripcion.trim() || null,
      });
    } catch (error) {
      setErrorServidor(error.message);
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} noValidate>
      <div className="field-header"><label htmlFor="titulo">Título del evento <span>*</span></label><small>Obligatorio</small></div>
      <input id="titulo" name="titulo" value={formulario.titulo} onChange={actualizar} placeholder="Ej. Conferencia de Tecnología 2026" aria-invalid={Boolean(errores.titulo)} autoFocus />
      {errores.titulo && <p className="inline-error" role="alert">⊗ {errores.titulo}</p>}

      <div className="form-two-columns">
        <div>
          <div className="field-header"><label htmlFor="fecha">Fecha del evento <span>*</span></label><small>Obligatorio</small></div>
          <input id="fecha" name="fecha" type="date" value={formulario.fecha} onChange={actualizar} aria-invalid={Boolean(errores.fecha)} />
          {errores.fecha && <p className="inline-error" role="alert">⊗ {errores.fecha}</p>}
        </div>
        <div>
          <div className="field-header"><label htmlFor="horas">Horas <span>*</span></label><small>Duración estimada</small></div>
          <input id="horas" name="horas" type="number" min="1" step="1" value={formulario.horas} onChange={actualizar} placeholder="4" aria-invalid={Boolean(errores.horas)} />
          {errores.horas && <p className="inline-error" role="alert">⊗ {errores.horas}</p>}
          {!errores.horas && <p className="helper">ⓘ Las horas deben ser mayor a 0</p>}
        </div>
      </div>

      <div className="field-header"><label htmlFor="usuario_responsable">Usuario responsable</label><small>Opcional</small></div>
      <input id="usuario_responsable" name="usuario_responsable" value={formulario.usuario_responsable} onChange={actualizar} placeholder="Ej. Laura V. (Coordinadora General)" />

      <div className="field-header"><label htmlFor="descripcion">Descripción</label><small>Opcional</small></div>
      <textarea id="descripcion" name="descripcion" value={formulario.descripcion} onChange={actualizar} placeholder="Describe el objetivo, alcance o información útil del evento." />

      {errorServidor && <div className="alert alert-error" role="alert"><b>No fue posible crear el evento.</b><span>{errorServidor}</span></div>}
      <div className="actions">
        <button className="btn ghost" type="button" onClick={onCancelar} disabled={enviando}>Cancelar</button>
        <button className="btn primary" type="submit" disabled={enviando}>{enviando && <span className="mini-spinner" />} {enviando ? "Creando…" : "Crear evento"}</button>
      </div>
    </form>
  );
}

function CrearSubtareaForm({ eventoId, onCancelar, onCreada }) {
  const [form, setForm] = useState({ nombre: "", horas: "", estado: "pendiente" });
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState("");
  const [enviando, setEnviando] = useState(false);

  const actualizar = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrores((prev) => ({ ...prev, [name]: "" }));
    setErrorServidor("");
  };

  const enviar = async (event) => {
    event.preventDefault();
    const next = {};
    if (!form.nombre.trim()) next.nombre = "El nombre de la subtarea es requerido.";
    if (!form.horas || Number(form.horas) <= 0 || !Number.isInteger(Number(form.horas))) next.horas = "Las horas deben ser mayor a 0.";
    setErrores(next);
    if (Object.keys(next).length) return;

    setEnviando(true);
    try {
          await crearSubtarea({
            evento_id: eventoId,
            titulo: form.nombre.trim(),
            horas_estimadas: Number(form.horas),
            estado: form.estado,
          });
      onCreada();
    } catch (error) {
      setErrorServidor(error.message);
      setEnviando(false);
    }
  };

  return (
    <form onSubmit={enviar} noValidate>
      <div className="field-header"><label htmlFor="sub-nombre">Nombre de la subtarea <span>*</span></label></div>
      <input id="sub-nombre" name="nombre" value={form.nombre} onChange={actualizar} placeholder="Ej. Preparar presentación" aria-invalid={Boolean(errores.nombre)} autoFocus />
      {errores.nombre && <p className="inline-error" role="alert">⊗ {errores.nombre}</p>}

      <div className="form-two-columns">
        <div>
          <div className="field-header"><label htmlFor="sub-horas">Horas <span>*</span></label></div>
          <input id="sub-horas" name="horas" type="number" min="1" step="1" value={form.horas} onChange={actualizar} placeholder="2" aria-invalid={Boolean(errores.horas)} />
          {errores.horas ? <p className="inline-error" role="alert">⊗ {errores.horas}</p> : <p className="helper">ⓘ Las horas deben ser mayor a 0</p>}
        </div>
        <div>
          <div className="field-header"><label htmlFor="sub-estado">Estado</label></div>
          <select id="sub-estado" name="estado" value={form.estado} onChange={actualizar}>
            <option value="pendiente">Pendiente</option>
            <option value="hecho">Hecho</option>
            <option value="pospuesto">Pospuesto</option>
          </select>
          <p className="helper">Estado inicial asignado</p>
        </div>
      </div>

      {errorServidor && <div className="alert alert-error" role="alert"><b>No fue posible crear la subtarea.</b><span>{errorServidor}</span></div>}
      <div className="actions">
        <button className="btn ghost" type="button" onClick={onCancelar} disabled={enviando}>Cancelar</button>
        <button className="btn primary" type="submit" disabled={enviando}>{enviando && <span className="mini-spinner" />} {enviando ? "Creando…" : "Crear subtarea"}</button>
      </div>
    </form>
  );
}


function ConfirmModal({ title, message, confirmLabel = "Eliminar", close, onConfirm, loading = false }) {
  const cancelRef = useRef(null);
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event) => event.key === "Escape" && !loading && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close, loading]);

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && !loading && close()}>
      <section className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
        <div className="confirm-icon">!</div>
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-message" className="modal-subtitle">{message}</p>
        <div className="actions">
          <button ref={cancelRef} className="btn ghost" type="button" onClick={close} disabled={loading}>Cancelar</button>
          <button className="btn danger" type="button" onClick={onConfirm} disabled={loading}>
            {loading && <span className="mini-spinner danger-spinner" />}
            {loading ? "Eliminando…" : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function EditarEventoForm({ evento, onCancelar, onGuardado }) {
  const responsable = typeof evento?.usuario_responsable === "object" ? evento.usuario_responsable?.nombre : evento?.usuario_responsable;
  const [formulario, setFormulario] = useState({
    titulo: evento?.titulo || "",
    fecha: String(evento?.fecha || "").slice(0, 10),
    horas: evento?.horas ?? "",
    usuario_responsable: responsable || "",
    descripcion: evento?.descripcion || "",
  });
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState("");
  const [guardando, setGuardando] = useState(false);

  const actualizar = (event) => {
    const { name, value } = event.target;
    setFormulario((prev) => ({ ...prev, [name]: value }));
    setErrores((prev) => ({ ...prev, [name]: "" }));
    setErrorServidor("");
  };

  const validar = () => {
    const next = {};
    if (!formulario.titulo.trim()) next.titulo = "El título es requerido.";
    else if (formulario.titulo.trim().length < 5) next.titulo = "El título debe tener al menos 5 caracteres.";
    if (!formulario.fecha) next.fecha = "La fecha del evento es requerida.";
    if (!formulario.horas || Number(formulario.horas) <= 0 || !Number.isInteger(Number(formulario.horas))) next.horas = "Las horas deben ser mayor a 0.";
    return next;
  };

  const enviar = async (event) => {
    event.preventDefault();
    const next = validar();
    setErrores(next);
    if (Object.keys(next).length) return;
    setGuardando(true);
    setErrorServidor("");
    try {
      await actualizarEvento(evento.id, {
        titulo: formulario.titulo.trim(),
        fecha: formulario.fecha,
        horas: Number(formulario.horas),
        usuario_responsable: formulario.usuario_responsable.trim() || null,
        descripcion: formulario.descripcion.trim() || null,
      });
      onGuardado();
    } catch (error) {
      setErrorServidor(error.message);
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={enviar} noValidate>
      <div className="field-header"><label htmlFor="edit-titulo">Título del evento <span>*</span></label></div>
      <input id="edit-titulo" name="titulo" value={formulario.titulo} onChange={actualizar} aria-invalid={Boolean(errores.titulo)} autoFocus />
      {errores.titulo && <p className="inline-error" role="alert">⊗ {errores.titulo}</p>}
      <div className="form-two-columns">
        <div>
          <div className="field-header"><label htmlFor="edit-fecha">Fecha del evento <span>*</span></label></div>
          <input id="edit-fecha" name="fecha" type="date" value={formulario.fecha} onChange={actualizar} aria-invalid={Boolean(errores.fecha)} />
          {errores.fecha && <p className="inline-error" role="alert">⊗ {errores.fecha}</p>}
        </div>
        <div>
          <div className="field-header"><label htmlFor="edit-horas">Horas <span>*</span></label></div>
          <input id="edit-horas" name="horas" type="number" min="1" step="1" value={formulario.horas} onChange={actualizar} aria-invalid={Boolean(errores.horas)} />
          {errores.horas && <p className="inline-error" role="alert">⊗ {errores.horas}</p>}
        </div>
      </div>
      <div className="field-header"><label htmlFor="edit-responsable">Usuario responsable</label></div>
      <input id="edit-responsable" name="usuario_responsable" value={formulario.usuario_responsable} onChange={actualizar} />
      <div className="field-header"><label htmlFor="edit-descripcion">Descripción</label></div>
      <textarea id="edit-descripcion" name="descripcion" value={formulario.descripcion} onChange={actualizar} />
      {errorServidor && <div className="alert alert-error" role="alert"><b>No fue posible actualizar el evento.</b><span>{errorServidor}</span></div>}
      <div className="actions">
        <button className="btn ghost" type="button" onClick={onCancelar} disabled={guardando}>Cancelar</button>
        <button className="btn primary" type="submit" disabled={guardando}>{guardando && <span className="mini-spinner" />}{guardando ? "Guardando…" : "Guardar cambios"}</button>
      </div>
    </form>
  );
}

function EditarSubtareaForm({ subtarea, eventoId, onCancelar, onGuardado }) {
  const [form, setForm] = useState({ nombre: subtarea?.titulo ?? subtarea?.nombre ?? "", horas: subtarea?.horas_estimadas ?? subtarea?.horas ?? "", estado: normalizarEstado(subtarea?.estado) });
  const [errores, setErrores] = useState({});
  const [errorServidor, setErrorServidor] = useState("");
  const [guardando, setGuardando] = useState(false);
  const actualizar = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrores((prev) => ({ ...prev, [name]: "" }));
    setErrorServidor("");
  };
  const enviar = async (event) => {
    event.preventDefault();
    const next = {};
    if (!form.nombre.trim()) next.nombre = "El nombre de la subtarea es requerido.";
    if (!form.horas || Number(form.horas) <= 0 || !Number.isInteger(Number(form.horas))) next.horas = "Las horas deben ser mayor a 0.";
    setErrores(next);
    if (Object.keys(next).length) return;
    setGuardando(true);
    try {
          await actualizarSubtarea(subtarea.id, {
            evento_id: eventoId,
            titulo: form.nombre.trim(),
            horas_estimadas: Number(form.horas),
            estado: form.estado,
          });
      onGuardado();
    } catch (error) {
      setErrorServidor(error.message);
      setGuardando(false);
    }
  };
  return (
    <form onSubmit={enviar} noValidate>
      <div className="field-header"><label htmlFor="edit-sub-nombre">Nombre de la subtarea <span>*</span></label></div>
      <input id="edit-sub-nombre" name="nombre" value={form.nombre} onChange={actualizar} aria-invalid={Boolean(errores.nombre)} autoFocus />
      {errores.nombre && <p className="inline-error" role="alert">⊗ {errores.nombre}</p>}
      <div className="form-two-columns">
        <div>
          <div className="field-header"><label htmlFor="edit-sub-horas">Horas <span>*</span></label></div>
          <input id="edit-sub-horas" name="horas" type="number" min="1" step="1" value={form.horas} onChange={actualizar} aria-invalid={Boolean(errores.horas)} />
          {errores.horas && <p className="inline-error" role="alert">⊗ {errores.horas}</p>}
        </div>
        <div>
          <div className="field-header"><label htmlFor="edit-sub-estado">Estado</label></div>
          <select id="edit-sub-estado" name="estado" value={form.estado} onChange={actualizar}><option>Pendiente</option><option>Completada</option></select>
        </div>
      </div>
      {errorServidor && <div className="alert alert-error" role="alert"><b>No fue posible actualizar la subtarea.</b><span>{errorServidor}</span></div>}
      <div className="actions">
        <button className="btn ghost" type="button" onClick={onCancelar} disabled={guardando}>Cancelar</button>
        <button className="btn primary" type="submit" disabled={guardando}>{guardando && <span className="mini-spinner" />}{guardando ? "Guardando…" : "Guardar cambios"}</button>
      </div>
    </form>
  );
}

function Eventos({ eventos, cargando, error, recargar, crear }) {
  return (
    <section className="page">
      <div className="heading">
        <div><small>PLANIFICACIÓN</small><h1>Eventos</h1><p>Gestiona tus eventos y organiza las tareas necesarias para completarlos.</p></div>
        <button className="btn primary" type="button" onClick={crear}>＋ Nuevo evento</button>
      </div>

      {cargando && <section className="card state-card"><span className="spinner" /> Cargando eventos...</section>}
      {!cargando && error && <section className="card state-card error-state" role="alert"><div><b>No se pudieron cargar los eventos.</b><p>{error}</p></div><button className="btn ghost" onClick={recargar}>Reintentar</button></section>}
      {!cargando && !error && eventos.length === 0 && <section className="card empty-state"><div className="empty-icon">▣</div><h2>Aún no hay eventos</h2><p>¿Deseas crear tu primer evento?</p><button className="btn primary" onClick={crear}>Crear el primer evento</button></section>}
      {!cargando && !error && eventos.length > 0 && <section className="event-grid" aria-label="Eventos guardados">
        {eventos.map((evento) => <article className="event-card card" key={evento.id ?? `${evento.titulo}-${evento.fecha}`}>
          <div className="event-card-icon">▣</div>
          <div className="event-card-content"><span className="status-pill">● En preparación</span><h2>{evento.titulo}</h2><p>{formatearFecha(evento.fecha)} {evento.horas ? `• ${evento.horas} horas` : ""}</p>{evento.descripcion && <p className="muted-line">{evento.descripcion}</p>}</div>
          <button className="btn secondary" onClick={() => navegar(`/eventos/${evento.id}`)}>Ver detalle</button>
        </article>)}
      </section>}
    </section>
  );
}

function DetalleEvento({ id, volver, onNotify, onEventosChanged }) {
  const [evento, setEvento] = useState(null);
  const [cargandoEvento, setCargandoEvento] = useState(true);
  const [errorEvento, setErrorEvento] = useState("");
  const [subtareas, setSubtareas] = useState([]);
  const [estadoSubtareas, setEstadoSubtareas] = useState("loading");
  const [errorSubtareas, setErrorSubtareas] = useState("");
  const [modal, setModal] = useState(null);
  const [confirmacion, setConfirmacion] = useState(null);
  const [eliminando, setEliminando] = useState(false);

  const cargar = async () => {
    setCargandoEvento(true); setErrorEvento("");
    try { setEvento(await obtenerEvento(id)); }
    catch (error) { setErrorEvento(error.message); }
    finally { setCargandoEvento(false); }
  };
  const cargarSubtareas = async () => {
    setEstadoSubtareas("loading"); setErrorSubtareas("");
    try {
      const data = await obtenerSubtareas(id);
      setSubtareas(Array.isArray(data) ? data : []);
      setEstadoSubtareas(Array.isArray(data) && data.length ? "success" : "empty");
    } catch (error) { setErrorSubtareas(error.message); setEstadoSubtareas("error"); }
  };
  useEffect(() => { cargar(); cargarSubtareas(); }, [id]);

  const completadas = subtareas.filter((item) => normalizarEstado(item.estado) === "hecho").length;
  const horasRegistradas = subtareas.reduce((total, item) => total + obtenerHoras(item), 0);
  const porcentaje = subtareas.length ? Math.round((completadas / subtareas.length) * 100) : 0;
  const responsable = evento?.usuario_responsable;
  const responsableTexto = typeof responsable === "object" ? responsable.nombre : responsable;

  const eventoActualizado = async () => {
    setModal(null); await cargar(); onEventosChanged?.(); onNotify("Evento actualizado correctamente");
  };
  const subtareaActualizada = async () => {
    setModal(null); await cargarSubtareas(); onNotify("Subtarea actualizada correctamente");
  };
  const ejecutarEliminacion = async () => {
    if (!confirmacion) return;
    setEliminando(true);
    try {
      if (confirmacion.type === "evento") {
        await eliminarEvento(id);
        setConfirmacion(null);
        onNotify("Evento eliminado correctamente");
        onEventosChanged?.();
        volver();
      } else {
        await eliminarSubtarea(confirmacion.item.id);
        setConfirmacion(null);
        await cargarSubtareas();
        onNotify("Subtarea eliminada correctamente");
      }
    } catch (error) {
      setConfirmacion(null);
      onNotify(error.message || "No fue posible eliminar el elemento.", "error");
    } finally { setEliminando(false); }
  };

  if (cargandoEvento) return <section className="page"><div className="breadcrumb">← Volver a la lista general de eventos</div><section className="card state-card"><span className="spinner" /> Cargando detalle del evento...</section></section>;
  if (errorEvento || !evento) return <section className="page"><button className="back-link" onClick={volver}>← Volver a la lista general de eventos</button><section className="card state-card error-state" role="alert"><div><b>No se pudo cargar el evento.</b><p>{errorEvento || "El evento no existe."}</p></div><button className="btn ghost" onClick={cargar}>Reintentar</button></section></section>;

  return (
    <section className="page detail-page">
      <button className="back-link" onClick={volver}>← Volver a la lista general de eventos</button>
      <div className="detail-title-row">
        <div><h1>{evento.titulo}</h1><p>Identificador ID: <b>EVT-{evento.id}</b> • Información del evento</p></div>
        <div className="title-actions">
          <button className="btn secondary" onClick={() => setModal("edit-event")}>✎ Editar</button>
          <button className="btn danger-outline" onClick={() => setConfirmacion({ type: "evento" })}>▥ Eliminar</button>
        </div>
      </div>

      <section className="event-info card">
        <InfoBlock icon="▣" title="FECHA DEL EVENTO"><strong>{formatearFecha(evento.fecha)}</strong><span>Fecha registrada</span></InfoBlock>
        <InfoBlock icon="◷" title="DURACIÓN ESTIMADA"><strong>{evento.horas ?? "—"} horas</strong><span>Jornada estimada</span></InfoBlock>
        <InfoBlock icon="♙" title="USUARIO RESPONSABLE"><strong>{responsableTexto || "Sin asignar"}</strong><span>Responsable</span></InfoBlock>
        <InfoBlock icon="▤" title="DESCRIPCIÓN COMPLETA"><strong className="description-value">{evento.descripcion || "Sin descripción"}</strong></InfoBlock>
      </section>

      <div className="subtasks-heading"><div><h2>Subtareas</h2><p>Organiza las tareas necesarias para completar este evento.</p></div><button className="btn primary" onClick={() => setModal("create-subtask")}>＋ Nueva subtarea</button></div>
      <section className="subtask-section card">
        <div className="section-tabs"><span className="tab active">Con subtareas ({subtareas.length})</span><span className="tab">Estado Vacío</span><span className="tab">Estado de Carga</span><span className="tab">Estado de Error</span></div>
        {estadoSubtareas === "loading" && <div className="state-inside"><span className="spinner" /> Cargando subtareas...</div>}
        {estadoSubtareas === "error" && <div className="state-inside error-inside" role="alert"><div><b>Error cargando las subtareas</b><p>{errorSubtareas}</p></div><button className="btn ghost" onClick={cargarSubtareas}>Reintentar</button></div>}
        {estadoSubtareas === "empty" && <div className="empty-subtasks"><div className="empty-icon">▣</div><h3>Aún no hay subtareas</h3><p>Agrega una subtarea para organizar este evento.</p><button className="btn primary" onClick={() => setModal("create-subtask")}>＋ Nueva subtarea</button></div>}
        {estadoSubtareas === "success" && <div className="subtask-list">
          {subtareas.map((task) => {
            const estado = normalizarEstado(task.estado);
            const titulo = obtenerTituloSubtarea(task);
            return <article className="subtask-row" key={task.id ?? `${titulo}-${obtenerHoras(task)}`}>
              <span className={`task-check ${estado === "hecho" ? "completed" : ""}`}>{estado === "hecho" ? "✓" : ""}</span>
              <div className="task-main"><h3 className={estado === "hecho" ? "completed-text" : ""}>{titulo}</h3><p>◷ {obtenerHoras(task)} {obtenerHoras(task) === 1 ? "hora" : "horas"}</p></div>
              <span className={`badge ${estado === "hecho" ? "badge-success" : "badge-pending"}`}>{etiquetaEstado(estado)}</span>
              <div className="row-actions"><button className="btn ghost" onClick={() => setModal({ type: "edit-subtask", item: task })}>✎ Editar</button><button className="btn danger-outline" onClick={() => setConfirmacion({ type: "subtarea", item: task })}>▥ Eliminar</button></div>
            </article>;
          })}
        </div>}
      </section>

      <section className="progress-card card"><div className="progress-icon">✓</div><div><h2>Progreso global de subtareas</h2><p>{completadas} de {subtareas.length} completadas ({porcentaje}%) • {horasRegistradas} horas totales registradas</p></div><strong>{porcentaje}%</strong><div className="progress-track"><span style={{ width: `${porcentaje}%` }} /></div></section>

      {modal === "create-subtask" && <Modal title="Crear subtarea" subtitle="Agrega una nueva tarea para este evento." close={() => setModal(null)}><CrearSubtareaForm eventoId={id} onCancelar={() => setModal(null)} onCreada={async () => { setModal(null); onNotify("Subtarea creada correctamente"); await cargarSubtareas(); }} /></Modal>}
      {modal === "edit-event" && <Modal title="Editar evento" subtitle="Actualiza la información del evento." close={() => setModal(null)} wide><EditarEventoForm evento={evento} onCancelar={() => setModal(null)} onGuardado={eventoActualizado} /></Modal>}
      {modal?.type === "edit-subtask" && <Modal title="Editar subtarea" subtitle="Actualiza la información de la subtarea." close={() => setModal(null)}><EditarSubtareaForm subtarea={modal.item} eventoId={id} onCancelar={() => setModal(null)} onGuardado={subtareaActualizada} /></Modal>}
      {confirmacion?.type === "evento" && <ConfirmModal title="¿Eliminar evento?" message="Esta acción eliminará el evento y sus subtareas. No se puede deshacer." close={() => setConfirmacion(null)} onConfirm={ejecutarEliminacion} loading={eliminando} />}
      {confirmacion?.type === "subtarea" && <ConfirmModal title="¿Eliminar subtarea?" message={`Esta acción eliminará “${obtenerTituloSubtarea(confirmacion.item)}”. No se puede deshacer.`} close={() => setConfirmacion(null)} onConfirm={ejecutarEliminacion} loading={eliminando} />}
    </section>
  );
}

function InfoBlock({ icon, title, children }) {
  return <div className="info-block"><span className="info-icon">{icon}</span><div><small>{title}</small>{children}</div></div>;
}

function CrearEventoPage({ onCancelar, onCrear }) {
  return (
    <section className="create-page">
      <div className="create-main">
        <button className="back-link" onClick={onCancelar}>← Volver a Eventos <span className="back-dot">•</span> <span className="draft-pill">◉ Borrador de alta</span></button>
        <div className="create-heading">
          <div>
            <h1>Crear evento</h1>
            <p>Completa la información para crear un nuevo evento.</p>
          </div>
        </div>
        <section className="card create-form-card">
          <FormularioEvento onCancelar={onCancelar} onCrear={onCrear} />
        </section>
      </div>
      <aside className="create-sidebar">
        <section className="card progress-register">
          <div className="sidebar-title"><span className="sidebar-icon">☷</span><h2>Progreso del Registro</h2><span className="ready-pill">75% Listo</span></div>
          <div className="register-step done"><span className="step-dot">✓</span><div><b>Nombre y temática principal</b><small>Claro para asistentes y equipo de operaciones.</small></div></div>
          <div className="register-step done"><span className="step-dot">✓</span><div><b>Fecha fijada</b><small>Selecciona una fecha para reservar.</small></div></div>
          <div className="register-step current"><span className="step-dot">○</span><div><b>Horas estimadas de ejecución</b><small>Calcula montaje, show y desmontaje técnico.</small></div></div>
          <div className="register-step"><span className="step-dot">○</span><div><b>Confirmación de locación</b><small>Se configura en el siguiente paso de logística.</small></div></div>
          <div className="register-progress"><span /></div>
        </section>

        <section className="card validation-card">
          <div className="validation-title"><span>ⓘ</span><h2>Reglas de validación y publicación</h2></div>
          <p>Al registrar un nuevo evento en el workspace de EventHub:</p>
          <ul>
            <li><b>Título:</b> No puede quedar vacío ni contener menos de 5 caracteres.</li>
            <li><b>Horas:</b> Debe ser un número entero mayor a 0.</li>
            <li><b>Coordinador:</b> Se asignará automáticamente el rol de propietario del cronograma.</li>
          </ul>
        </section>

        <section className="card venue-card">
          <div className="venue-image"><div className="venue-label">Sede Predeterminada</div></div>
          <div className="venue-content"><h3>Auditorio Central Corporativo</h3><p>Capacidad: 350 personas • Equipamiento audiovisual disponible</p></div>
        </section>
      </aside>
    </section>
  );
}

function Today() {
  return <section className="page"><div className="heading"><div><small>VISTA DE PROTOTIPO</small><h1>Hoy</h1><p>Esta vista se conserva del frontend anterior mientras el backend define la información real de tareas.</p></div></div><section className="card empty-state"><div className="empty-icon">◷</div><h2>Vista Hoy</h2><p>La gestión de tareas de hoy se conectará cuando el backend exponga el endpoint correspondiente.</p></section></section>;
}

export default function App() {
  const [ruta, setRuta] = useState(rutaActual);
  const [eventos, setEventos] = useState([]);
  const [cargandoEventos, setCargandoEventos] = useState(true);
  const [errorEventos, setErrorEventos] = useState("");
  const [toast, setToast] = useState({ type: "success", message: "" });
  const toastTimer = useRef(null);

  const cargarEventos = async () => {
    setCargandoEventos(true); setErrorEventos("");
    try { const data = await obtenerEventos(); setEventos(Array.isArray(data) ? data : []); }
    catch (error) { setErrorEventos(error.message); }
    finally { setCargandoEventos(false); }
  };

  useEffect(() => {
    const onPop = () => setRuta(rutaActual());
    window.addEventListener("popstate", onPop);
    if (ruta === "/eventos") cargarEventos();
    return () => window.removeEventListener("popstate", onPop);
  }, [ruta]);

  const notify = (message, type = "success") => {
    clearTimeout(toastTimer.current); setToast({ type, message });
    toastTimer.current = setTimeout(() => setToast({ type, message: "" }), 4000);
  };

  const crear = async (evento) => {
    const creado = await crearEvento(evento);
    notify("Evento creado correctamente");
    if (creado?.id) navegar(`/eventos/${creado.id}`);
    else { await cargarEventos(); navegar("/eventos"); }
  };

  const detalleId = ruta.startsWith("/eventos/") ? ruta.split("/")[2] : null;

  return <main className="app">
    <Header ruta={ruta} abrirCrear={() => navegar("/crear-evento")} />
    <Toast type={toast.type} message={toast.message} />
    {ruta === "/eventos" && <Eventos eventos={eventos} cargando={cargandoEventos} error={errorEventos} recargar={cargarEventos} crear={() => navegar("/crear-evento")} />}
    {ruta === "/hoy" && <Today />}
    {detalleId && <DetalleEvento id={detalleId} volver={() => navegar("/eventos")} onNotify={notify} onEventosChanged={cargarEventos} />}
    {ruta === "/crear-evento" && <CrearEventoPage onCancelar={() => navegar("/eventos")} onCrear={crear} />}
  </main>;
}
