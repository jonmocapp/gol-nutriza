// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  GOL NUTRISA — BOT v3.38 — PRODUCCIÓN                                        ║
// ║  Fanáticos del Sabor · Grupo Nutrisa · WhatsApp-native                       ║
// ║                                                                              ║
// ║  v3.38: Tono formal, ortografía revisada, instrucciones claras               ║
// ║  v3.37: Last-resort BD recovery en handlers + UX continuidad                 ║
// ║  v3.36: pendingFolio en BD + regex 21 dígitos estricto                       ║
// ║  v3.35: Caché stale-aware + retry robusto + ortografía Nutrisa               ║
// ║  v3.34: Multi-réplica safe — dedupe distribuido + fase en BD                 ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
//
// ─── NUEVO EN v3.38 (22 may 2026 — copy review) ─────────────────────────────
// Pasada completa a todos los mensajes para tono más formal y profesional:
// - Eliminado slang: "qué onda" → "hola", "va" → "perfecto", "cáele" → "compra"
// - Eliminado "ahorita" → "ahora", "manda" → "envía"
// - Comandos siempre en MAYÚSCULAS (REINICIAR, CANCELAR, SOPORTE, etc)
// - Reducidos emojis decorativos, mantenidos los funcionales (🥇🥈🥉)
// - Ortografía revisada en todos los mensajes
// - Instrucciones más claras dirigiendo al protocolo (palabras completas)
//
// ─── NUEVO EN v3.37 (22 may 2026 — UX continuidad + soporte safety) ─────────
// 1) recoverFromDB helper: si llega un comando (otra_ronda/saludo/puntos/mi_link)
//    y el cache no tiene userId pero la BD dice wa_registered=true, recupera al
//    vuelo y procesa normalmente. Antes: respondía bienvenidaNuevo (mensaje largo
//    completo) tratando al usuario como nuevo.
// 2) Mensajes de fallback más cortos cuando user no está registrado:
//    Antes: bienvenidaNuevo completo (10+ líneas)
//    Ahora: "Para empezar mándame tu folio (21 dígitos que empiezan con 84) 🎫"
// 3) Removido envío de imagen del folio en handler de "otra_ronda" — usuario ya
//    sabe dónde está, no necesita re-explicación
// 4) Soporte early-exit: si user está en fase esperando_soporte y manda un
//    folio/reiniciar/ayuda/puntos/mi_link/otra_ronda/saludo, el bot sale del
//    modo soporte automáticamente y procesa el comando. Antes: enviaba el folio
//    a Airtable como "reporte de soporte" (race condition entre réplicas).
// 5) esperando_soporte ahora incluida en cache_stale_reload — si una réplica
//    tiene esa fase >3min, recarga de BD para detectar cambios cross-réplica.
//
// ─── NUEVO EN v3.36 (21 may 2026 — fixes críticos pre-launch) ───────────────
// 1) pendingFolio persistido en BD (tabla wa_pending_registrations):
//    Antes: si user mandaba folio y luego username en réplica distinta, el
//    pendingFolio se perdía → bot pedía folio de nuevo en lugar de procesar el apodo
//    Ahora: cualquier réplica recupera el pendingFolio de BD y completa el registro
// 2) Regex de folio estricta a 21 dígitos exactos:
//    Antes: si user tipeaba 22 dígitos, bot truncaba silenciosamente al primer 21
//    (dos inputs distintos resolvían al mismo folio)
//    Ahora: 22 dígitos = formato inválido → user debe verificar
//
// ─── NUEVO EN v3.35 (21 may 2026 — bug fixes post-testing) ──────────────────
// 1) cargarSesion ahora distingue error transitorio de "no encontrado":
//    Antes: timeout en BD marcaba al usuario como "nuevo" permanentemente
//    Ahora: retry interno + marker __error → caller reintenta próximo mensaje
// 2) Caché stale-aware (3 min TTL):
//    Antes: réplica A podía servir datos viejos cuando réplica B ya modificó BD
//    Ahora: si caché >3min y fase segura, re-carga de BD
// 3) Recovery de usuario registrado al recibir folio:
//    Antes: si caché perdió username/userId, bot pedía apodo de nuevo
//    Ahora: consulta BD antes de pedir apodo, recupera si está registrado
// 4) claim_webhook_event con retry asimétrico:
//    Antes: falla → ambas réplicas procesan → double message
//    Ahora: retry con jitter, descarta tras 2 fallos
// 5) Limpieza explícita de username/userId cuando BD dice no encontrado
// 6) Ortografía: "Nutriza" → "Nutrisa" en textos visibles al usuario
//
// ─── NUEVO EN v3.34 (21 may 2026 — pre-launch hardening) ────────────────────
// MULTI-RÉPLICA SAFE (Railway 2+ réplicas sin shared state):
// 1) Dedupe distribuido vía claim_webhook_event RPC (atómico en BD)
//    Antes: dedupe en memoria local → posible doble-process en multi-réplica
//    Ahora: PK en webhook_events.message_id garantiza idempotency
// 2) wa_phase ahora se persiste a BD en cada cambio de fase
//    Antes: solo en memoria → user perdía estado al cambiar de réplica
//    Ahora: cualquier réplica recupera el estado real de BD
// 3) Nuevo error 'rate_limited' manejado en M.folioError
// 4) Nuevo error 'invalid_user_id' manejado (defensa en profundidad)
//
// ─── HEREDADO DE v3.33 (20 may 2026 — pre-launch) ───────────────────────────
// 🚨 BUG CRÍTICO descubierto pre-launch:
// La RPC auto_sync_all_orphans generaba scores random para folios canjeados
// sin sesión real. Causaba el caso "Goleador" (puntos sin haber jugado).
// Ya neutralizada en Supabase. Quitamos la llamada del bot.
//
// También: DIAS_VALIDEZ 2 → 3 (folios ahora válidos 3 días)
//
// ─── HEREDADO DE v3.28 ──────────────────────────────────────────────────────
// Refinamientos de copy tras stress test:
// • "¡Quiúbole!" → "¡Hola!" en todos los mensajes
// • bienvenidaNuevo restaurado al estilo original (más warm)
// • AYUDA: restaurada la línea "No leo fotos, audios, videos ni stickers"
//
// ─── HEREDADO DE v3.27 ──────────────────────────────────────────────────────
// Refactor completo de UX basado en stress test con usuarios reales:
//
// • PUNTOS ahora muestra puntaje + posición DIRECTO en WhatsApp (no link)
// • MI LINK (o LINK) → reenvía el último magic link activo
// • OTRA RONDA → hype + imagen del folio + CTA (intent nuevo)
// • Profanity filter mejorado
// • Mensajes más cortos: regla "1 mensaje = 1 acción clara"
// • Tono unificado: mexa casual, "Gol" como personaje del bot
// • rondaCompletada ahora incluye posición en leaderboard
// • Bienvenidas: 4 → 2 variantes (nuevo / conocido con sub-estados)
// • SITIO eliminado (ya no necesario tras fix de frontend)
//
// ─── HEREDADO DE v3.26 (17 may 2026 PM) ────────────────────────────────────
// Mientras se arreglan los bugs del sitio web (Mohammad), el bot ahora:
// • Mensaje del magic link incluye tips para los bugs visuales del sitio
// • Mensaje post-canje avisa que el puntaje aparece en 2-3 min
// • Si el usuario reporta error, sugerencias específicas y SOPORTE
//
// ─── HEREDADO DE v3.25 (17 may 2026) ────────────────────────────────────────
// UX REWRITE: cada mensaje rediseñado con personalidad mexicana.
// COMANDO SOPORTE: escape hatch humano.
// PUNTAJE ACUMULADO: rondaCompletada ahora muestra puntos totales.
// DETECCIÓN DE RE-ENGAGEMENT: si user no juega 3+ días, mensaje especial.
// ENDPOINTS ADMIN para Airtable.
//
// ─── HEREDADO DE v3.24 ──────────────────────────────────────────────────────
// FIX #1: session_active → regenera y reenvía magic link
// FIX #2: endpoint POST /game-complete cierra el loop WhatsApp ↔ Web
// FIX #3: copy "rondas completadas" (no "jugadas")
//
// ─── HEREDADO DE v3.23 ──────────────────────────────────────────────────────
// preview_ticket restaurado, 11 RPCs con GRANT a anon,
// bot_cleanup_sessions wrapper, get_wa_profile mejorado.
//
// ─── HEREDADO DE v3.22 ──────────────────────────────────────────────────────
// Consolidación a Bot Control (apprLebqIDBaogjDJ).
//
// ─── HEREDADO DE v3.21 ──────────────────────────────────────────────────────
// Profanidad unificada via is_profane RPC.
// wa_rondas_hoy se incrementa al COMPLETAR 4 minijuegos.
//
// ─── ENV VARS REQUERIDAS ────────────────────────────────────────────────────
//   WHATSAPP_TOKEN, PHONE_NUMBER_ID, AIRTABLE_TOKEN,
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_BOT_SECRET
//
// ─── ENV VARS OPCIONALES ────────────────────────────────────────────────────
//   META_APP_SECRET    → HMAC validation de webhooks
//   METRICS_SECRET     → bearer auth en /metrics
//   AT_SYNC_LOGS, AT_SYNC_FOLIOS, AT_SYNC_JUGADORES, AT_SYNC_RONDAS,
//   AT_SYNC_ALERTAS    → activar stubs Airtable (default: off)
// ════════════════════════════════════════════════════════════════════════════

const express = require("express");
const crypto  = require("crypto");
const app     = express();

app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    console.error(`[${new Date().toISOString()}] [WARN] JSON inválido de ${req.ip}`);
    return res.status(200).send('ok');
  }
  next(err);
});

// ─── ENV ────────────────────────────────────────────────────────────────────
const VERSION         = "3.38";
const VERIFY_TOKEN    = "golnutriza2026";
const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const AIRTABLE_TOKEN  = process.env.AIRTABLE_TOKEN;
const SUPABASE_URL    = (process.env.SUPABASE_URL || "https://selxawolsjukpvzisipm.supabase.co").replace(/\/$/, "");
const SUPABASE_ANON   = process.env.SUPABASE_ANON_KEY;
const BOT_SECRET      = process.env.SUPABASE_BOT_SECRET;

const META_APP_SECRET = process.env.META_APP_SECRET;
const METRICS_SECRET  = process.env.METRICS_SECRET;

const AT_SYNC_LOGS      = process.env.AT_SYNC_LOGS      === 'true';
const AT_SYNC_FOLIOS    = process.env.AT_SYNC_FOLIOS    === 'true';
const AT_SYNC_JUGADORES = process.env.AT_SYNC_JUGADORES === 'true';
const AT_SYNC_RONDAS    = process.env.AT_SYNC_RONDAS    === 'true';
const AT_SYNC_ALERTAS   = process.env.AT_SYNC_ALERTAS   === 'true';

function isValidSecret(s) {
  return typeof s === 'string' && s.length >= 16 && s !== 'undefined' && s !== 'null';
}

// ─── AIRTABLE — Engine v2 + Bot Control ─────────────────────────────────────
const AT_BASE     = "appDnuaIHpVrXTpz1";
const AT_BOT_BASE = "apprLebqIDBaogjDJ";

const BC_USUARIOS    = "tblMLwnH97t7WDix7";
const BC_BROADCASTS  = "tbluRhALErgxpB3x9";
const BC_LEADERBOARD = "tblOEJkSlJuQfO5pE";
const BC_CANJES      = "tbl0YNSJEQPE4jsYO";
const BC_SOPORTE     = process.env.BC_SOPORTE_TABLE_ID || "";

const BCU = {
  TEL:               "fldnrcKBlRy1DXZGC",
  FASE:              "fldY8dZQIXu5mupQF",
  PRIMER:            "fldyAx6CjTzYDCm93",
  ULTIMO:            "fldiM65M8hl909yVB",
  TOTAL:             "fldD47UVZrVeXxnF3",
  USERNAME:          "fldJvuy3Sgz84l8rD",
  MARCA:             "fldAhyZcETRHOFrMv",
  TIENDA:            "fldXO9M4kju43Evqk",
  CODIGO_TIENDA:     "fldPt5bdPoHcHYjNj",
  IP:                "fldKSvazm1ZcAT4hH",
  SOSPECHOSO:        "fldnmFX6blp2G54ii",
  ESTADO:            "fldYdof8WBKcYOM0E",
  TIENDAS_VISITADAS: "fldDDDpIusKN5sP71",
  PUNTOS_TOTAL:      "fldljAcl0TAXGEmvY",
};
const BCL = {
  SNAPSHOT_ID:       "fldZ7R8QKMGfmQQpg",
  FECHA:             "fldpCb5kC5iGJ7eEU",
  POSICION:          "fldHKE5SKEwflp6w0",
  USERNAME:          "fldZA00CeduzS7M8Z",
  TELEFONO:          "fldicf03YFtMaygvg",
  PUNTOS_TOTAL:      "fldF0ubOtf8xkUGx5",
  MARCA:             "fldSk3esW82MeKbuO",
  ESTADO:            "fldeuYPjLoO1kHdRV",
  TIENDAS_VISITADAS: "fldPDsrkadpYMssv5",
  IP:                "fld6Fys21ENTjzQ8h",
};
const BCC = {
  FOLIO:         "fldcRMqF5RheA7DwT",
  TELEFONO:      "fldG6cDw0Z0jFqEAF",
  USERNAME:      "fld7b477PRrnVUexV",
  CODIGO_TIENDA: "fldIkORyjNReov5tg",
  NOMBRE_TIENDA: "fldUyTJdC8kIJhrca",
  MARCA:         "fldo8cGQgEfSkRbxj",
  ESTADO:        "fldhwNx2HfjlGUmL3",
  FECHA_TICKET:  "fldhCIBRPnpdk7n3W",
  FECHA_CANJE:   "fldonaQWWTT7KPP1A",
  RONDA:         "fldn1klPSJTcnR5K1",
  FUENTE:        "fldGc3TnL88uR8Lup",
  IP:            "fldi0lwzG1w2q4thR",
};
const BCB = {
  MSG:  "fldpZ3lmuKdm0JBJm",
  EST:  "fldzVQhbvjEThOzO0",
  ENV:  "fldwtMlLh3XJOmKvc",
  FALL: "fldJ9APbcGZSxMPfC",
};
const BCS = {
  TELEFONO:     process.env.BCS_TELEFONO_FIELD     || "Teléfono",
  USERNAME:     process.env.BCS_USERNAME_FIELD     || "Username",
  MENSAJE:      process.env.BCS_MENSAJE_FIELD      || "Mensaje original",
  CATEGORIA:    process.env.BCS_CATEGORIA_FIELD    || "Categoría",
  ESTADO:       process.env.BCS_ESTADO_FIELD       || "Estado",
  FECHA_CREADO: process.env.BCS_FECHA_FIELD        || "Fecha creado",
};

const AT_TABLES = {
  CONFIG:     "tblNZdUxRj9oczXwV",
  TIENDAS:    "tbl2zIMmueuckGR7K",
  JUGADORES:  "tblmNjt2noZ1IrMtm",
  FOLIOS:     "tblpnEiLmAnXIIF6D",
  RONDAS:     "tblM66MdcfdRpHrxW",
  ALERTAS:    "tblN1F65X4k9UVdMx",
  BROADCASTS: "tblKJRgaD9nB95lqL",
  LOGS:       "tblZf4QaxZn0gcdq1",
  STATS:      "tblpWnpTmJ3kUrNZJ",
};
const FB = { MSG:"fldadSOH0WyWbj622", EST:"fldEBKYSWpfXUseZa", ENV:"fldM0GtUD8Jkdn6Kr", FALL:"fld7Rug1JF1ggtd2R" };

// ─── CONSTANTES ─────────────────────────────────────────────────────────────
const RONDAS_MAX           = 5;
const DIAS_VALIDEZ         = 3;
const SITE_URL             = "https://fanaticosdelsabor.com";
const IMG_FOLIO            = "https://i.ibb.co/TDP6mnRz/Folio.jpg";
const CAMPAIGN_END_DATE    = "9 julio";
const DIAS_RE_ENGAGEMENT   = 3;

const FETCH_TIMEOUT_MS     = 8000;
const EDGE_FUNC_TIMEOUT_MS = 12000;

const SESSION_TTL_MS       = 24 * 60 * 60 * 1000;
const CACHE_STALE_MS       = 3 * 60 * 1000;  // v3.35: re-cargar de BD si caché no se ha tocado en 3 min
const DEDUP_TTL_MS         =  5 * 60 * 1000;
const DEDUP_MAX_ENTRIES    = 50_000;
const USERLOCK_MAX_AGE_MS  = 60 * 1000;
const CLEANUP_INTERVAL_MS  = 10 * 60 * 1000;

const OUTBOUND_THROTTLE_MS = 500;
const INBOUND_MAX_PER_MIN  = 15;

const IP_MAX_PER_MIN       = 100;

const AT_QUEUE_FLUSH_MS     = 5000;
const AT_BATCH_SIZE         = 10;
const AT_QUEUE_MAX          = 5000;
const AT_CIRCUIT_FAILS      = 3;
const AT_CIRCUIT_RECOVER_MS = 60_000;

const SOPORTE_MAX_CHARS    = 1000;

// ─── ESTADO EN MEMORIA ──────────────────────────────────────────────────────
const sesiones         = new Map();
const userLocks        = new Map();
const processedMsgs    = new Map();
const outboundLastSend = new Map();
const inboundCounter   = new Map();
const ipCounter        = new Map();
let   storesCache      = new Map();

let storesCacheReady   = false;
let broadcastRunning   = false;
const bootTime         = Date.now();

const atQueue = {
  LOGS:      [],
  FOLIOS:    [],
  JUGADORES: [],
  RONDAS:    [],
  ALERTAS:   [],
};
let atCircuitOpen      = false;
let atCircuitOpenedAt  = 0;
let atConsecutiveFails = 0;

const getSesion = (tel) => sesiones.get(tel) || { fase: "desconocido", intentos: 0 };

// v3.34: setSesion ahora auto-persiste la fase a BD para multi-réplica safety.
// Si se está cambiando la fase y tenemos userId, replicamos a BD (fire-and-forget).
const setSesion = (tel, data) => {
  const prev = getSesion(tel);
  const newSession = { ...prev, ...data, lastSeen: Date.now() };
  sesiones.set(tel, newSession);
  // Persistir fase si cambió y hay userId
  if (data.fase && data.fase !== prev.fase) {
    const userId = data.userId || prev.userId;
    if (userId) {
      persistFase(tel, userId, data.fase, null);
    }
  }
  return newSession;
};

// v3.34: Persist fase a BD (multi-réplica safe). Best-effort, no bloquea.
function persistFase(tel, userId, newPhase, trace) {
  if (!userId || !newPhase) return;
  const persistedPhases = new Set([
    "nuevo", "esperando_folio", "esperando_username", 
    "activo", "esperando_soporte"
  ]);
  if (!persistedPhases.has(newPhase)) return;
  sbRpc("update_wa_profile", {
    p_phone: tel,
    p_user_id: userId,
    p_phase: newPhase
  }, trace).catch(() => {
    metrics.persist_fase_fail = (metrics.persist_fase_fail || 0) + 1;
  });
}

// ─── MÉTRICAS ───────────────────────────────────────────────────────────────
const metrics = {
  startup_at:           new Date().toISOString(),
  webhook_total:        0,
  webhook_dedup_hit:    0,
  webhook_dedup_distributed: 0,   // v3.34
  webhook_dedup_fail:   0,        // v3.34
  persist_fase_fail:    0,        // v3.34
  session_recovery_lost_folio: 0, // v3.34
  session_recovery_soporte: 0,    // v3.34
  user_blocked:         0,        // v3.34
  webhook_silent_type:  0,
  webhook_non_text:     0,
  webhook_text:         0,
  webhook_invalid_json: 0,
  webhook_invalid_hmac: 0,
  webhook_ip_blocked:   0,
  webhook_invalid_phone:0,
  inbound_rate_limited: 0,
  msg_processed:        0,
  msg_errors:           0,
  rpc_total:            0,
  rpc_errors:           0,
  rpc_timeouts:         0,
  preview_ticket_ok:    0,
  preview_ticket_fail:  0,
  claim_ok:             0,
  claim_fail:           0,
  get_profile_found:    0,
  get_profile_notfound: 0,
  waauth_ok:            0,
  waauth_fail:          0,
  waauth_unauthorized:  0,
  waauth_timeouts:      0,
  send_attempts:        0,
  send_ok:              0,
  send_fail:            0,
  send_fail_24h_window: 0,
  send_throttled:       0,
  send_timeouts:        0,
  broadcast_runs:       0,
  broadcast_skipped:    0,
  broadcast_sent:       0,
  broadcast_failed:     0,
  broadcast_fetch_errors: 0,
  username_rejected_profanity: 0,
  dedup_evictions:      0,
  userlock_stale:       0,
  at_queue_size:        0,
  at_queue_dropped:     0,
  rpc_queue_dropped:    0,
  rpc_429_hits:         0,
  rpc_429_recovered:    0,
  at_flush_success:     0,
  at_flush_fail:        0,
  at_circuit_opens:     0,
  at_429_hits:          0,
  at_429_recovered:     0,
  session_active_relinks:  0,
  game_complete_received:  0,
  game_complete_failed:    0,
  game_complete_unauth:    0,
  cmd_ayuda_invoked:        0,
  cmd_premios_invoked:      0,
  cmd_puntos_invoked:       0,
  cmd_tiendas_invoked:      0,
  cmd_reglas_invoked:       0,
  cmd_folio_invoked:        0,
  cmd_reiniciar_invoked:    0,
  cmd_soporte_invoked:      0,
  cmd_mi_link_invoked:      0,
  cmd_otra_ronda_invoked:   0,
  soporte_tickets_created:  0,
  reengagement_triggered:   0,
  admin_send_direct_received: 0,
  admin_send_direct_unauth:   0,
  admin_broadcast_triggered:  0,
  last_error:           null,
  last_error_at:        null,
  last_error_stage:     null,
};

function recordError(stage, err) {
  metrics.last_error       = (err?.message || String(err)).substring(0, 300);
  metrics.last_error_at    = new Date().toISOString();
  metrics.last_error_stage = stage;
}

// ─── LOGGING ────────────────────────────────────────────────────────────────
function newTrace() {
  return Math.random().toString(16).substring(2, 14).padEnd(12, '0');
}

const log = {
  info:  (trace, ...args) => console.log(`[${new Date().toISOString()}] [INFO] [${trace || '------------'}]`, ...args),
  warn:  (trace, ...args) => console.warn(`[${new Date().toISOString()}] [WARN] [${trace || '------------'}]`, ...args),
  error: (trace, ...args) => console.error(`[${new Date().toISOString()}] [ERR ] [${trace || '------------'}]`, ...args),
};

function maskLink(url) {
  if (!url || typeof url !== 'string') return '<no-link>';
  if (url.length < 40) return url.substring(0, 20) + '...';
  return url.substring(0, 40) + '...[REDACTED]';
}

function fmt(n) {
  if (typeof n !== 'number') n = parseInt(n, 10) || 0;
  return n.toLocaleString('es-MX');
}

// ─── FECHA MÉXICO ───────────────────────────────────────────────────────────
const _dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City',
  year: 'numeric', month: '2-digit', day: '2-digit',
});
function hoyMexico() { return _dateFmt.format(new Date()); }

// ─── HMAC VALIDATION ────────────────────────────────────────────────────────
function verifyMetaSignature(req) {
  if (!META_APP_SECRET) return { valid: true, reason: 'not_configured' };
  if (!req.rawBody) return { valid: false, reason: 'no_body' };
  const header = req.headers['x-hub-signature-256'];
  if (!header || !header.startsWith('sha256=')) return { valid: false, reason: 'missing_header' };
  const received = header.slice(7);
  const expected = crypto.createHmac('sha256', META_APP_SECRET).update(req.rawBody, 'utf8').digest('hex');
  const a = Buffer.from(received, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return { valid: false, reason: 'length_mismatch' };
  return { valid: crypto.timingSafeEqual(a, b), reason: 'hmac_check' };
}

// ─── IP RATE LIMITING ───────────────────────────────────────────────────────
function checkIpRate(ip) {
  const now = Date.now();
  const entry = ipCounter.get(ip);
  if (!entry || now - entry.windowStart > 60_000) {
    ipCounter.set(ip, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  return entry.count <= IP_MAX_PER_MIN;
}

// ─── FETCH CON TIMEOUT ──────────────────────────────────────────────────────
async function fetchTimeout(url, opts = {}, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') { e.isTimeout = true; e.timeoutMs = ms; }
    else { e.isNetwork = true; }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ─── DEDUP LRU ──────────────────────────────────────────────────────────────
function addToProcessedMsgs(id) {
  if (!id) return;
  processedMsgs.set(id, Date.now());
  if (processedMsgs.size > DEDUP_MAX_ENTRIES) {
    const overflow = processedMsgs.size - DEDUP_MAX_ENTRIES;
    let evicted = 0;
    for (const key of processedMsgs.keys()) {
      if (evicted >= overflow) break;
      processedMsgs.delete(key);
      evicted++;
    }
    metrics.dedup_evictions += evicted;
  }
}

// ─── SUPABASE RATE LIMITER ──────────────────────────────────────────────────
class SupabaseLimiter {
  constructor(maxConcurrent, maxQueue) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueue = maxQueue;
    this.running = 0;
    this.queue = [];
    this.totalQueued = 0;
    this.totalDropped = 0;
    this.peakQueue = 0;
  }
  async run(fn) {
    if (this.running >= this.maxConcurrent) {
      if (this.queue.length >= this.maxQueue) {
        this.totalDropped++;
        metrics.rpc_queue_dropped++;
        throw new Error('supabase_queue_full');
      }
      await new Promise(resolve => {
        this.queue.push(resolve);
        if (this.queue.length > this.peakQueue) this.peakQueue = this.queue.length;
        this.totalQueued++;
      });
    }
    this.running++;
    try {
      return await fn();
    } finally {
      this.running--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }
}
const SB_LIMITER = new SupabaseLimiter(50, 1000);

// ─── SUPABASE HELPERS ───────────────────────────────────────────────────────
async function sbRpc(fnName, params = {}, trace) {
  metrics.rpc_total++;
  try {
    return await SB_LIMITER.run(async () => {
      const res = await fetchTimeout(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "apikey":        SUPABASE_ANON,
          "Authorization": `Bearer ${SUPABASE_ANON}`,
        },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        metrics.rpc_errors++;
        if (res.status === 429) {
          metrics.rpc_429_hits++;
          await new Promise(r => setTimeout(r, 300));
          const res2 = await fetchTimeout(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
            method: "POST",
            headers: {
              "Content-Type":  "application/json",
              "apikey":        SUPABASE_ANON,
              "Authorization": `Bearer ${SUPABASE_ANON}`,
            },
            body: JSON.stringify(params),
          });
          if (res2.ok) {
            metrics.rpc_429_recovered++;
            const d = await res2.json();
            return Array.isArray(d) ? d[0] : d;
          }
        }
        recordError(`rpc:${fnName}`, err.substring(0, 200));
        log.error(trace, `RPC ${fnName} (${res.status}):`, err.substring(0, 200));
        return null;
      }
      const data = await res.json();
      return Array.isArray(data) ? data[0] : data;
    });
  } catch (e) {
    metrics.rpc_errors++;
    if (e.message === 'supabase_queue_full') {
      log.warn(trace, `RPC ${fnName}: queue full → graceful degrade`);
      return null;
    }
    if (e.isTimeout) metrics.rpc_timeouts++;
    recordError(`rpc:${fnName}`, e);
    log.error(trace, `RPC ${fnName} ${e.isTimeout ? 'TIMEOUT' : 'ERR'}:`, e.message);
    return null;
  }
}

async function sbRpcArray(fnName, params = {}, trace) {
  metrics.rpc_total++;
  try {
    return await SB_LIMITER.run(async () => {
      const res = await fetchTimeout(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "apikey":        SUPABASE_ANON,
          "Authorization": `Bearer ${SUPABASE_ANON}`,
        },
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        metrics.rpc_errors++;
        const err = await res.text().catch(() => "");
        log.error(trace, `RPC[arr] ${fnName} (${res.status}):`, err.substring(0, 200));
        return [];
      }
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    });
  } catch (e) {
    metrics.rpc_errors++;
    if (e.message === 'supabase_queue_full') return [];
    if (e.isTimeout) metrics.rpc_timeouts++;
    recordError(`rpc[arr]:${fnName}`, e);
    return [];
  }
}

async function sbGet(path, trace) {
  metrics.rpc_total++;
  try {
    const res = await fetchTimeout(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` },
    });
    if (!res.ok) { metrics.rpc_errors++; return null; }
    return await res.json();
  } catch (e) {
    metrics.rpc_errors++;
    if (e.isTimeout) metrics.rpc_timeouts++;
    recordError(`sbGet`, e);
    log.error(trace, `SB GET ${path}:`, e.message);
    return null;
  }
}

async function waAuth(action, params = {}, trace) {
  try {
    const res = await fetchTimeout(`${SUPABASE_URL}/functions/v1/wa-auth`, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "apikey":        SUPABASE_ANON,
        "x-bot-secret":  BOT_SECRET,
      },
      body: JSON.stringify({ action, ...params }),
    }, EDGE_FUNC_TIMEOUT_MS);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      metrics.waauth_fail++;
      if (res.status === 401) metrics.waauth_unauthorized++;
      recordError(`waauth:${action}`, JSON.stringify(data).substring(0, 200));
      log.error(trace, `waAuth ${action} (${res.status}):`, JSON.stringify(data).substring(0, 200));
    } else {
      metrics.waauth_ok++;
    }
    return data;
  } catch (e) {
    metrics.waauth_fail++;
    if (e.isTimeout) metrics.waauth_timeouts++;
    recordError(`waauth:${action}`, e);
    log.error(trace, `waAuth ${action} ${e.isTimeout ? 'TIMEOUT' : 'ERR'}:`, e.message);
    return { error: "edge_function_error", detail: e.message };
  }
}

// ─── STORES CACHE ───────────────────────────────────────────────────────────
async function refreshStoresCache() {
  const data = await sbGet("stores?is_active=eq.true&select=sucursal,name,brand,estado&limit=2000");
  if (!Array.isArray(data)) {
    log.error(null, "stores cache refresh falló — sigo con anterior");
    return false;
  }
  const fresh = new Map();
  for (const s of data) fresh.set(s.sucursal, { name: s.name, brand: s.brand, estado: s.estado });
  storesCache = fresh;
  storesCacheReady = true;
  log.info(null, `🏪 Stores cache: ${storesCache.size} tiendas (con estado)`);
  return true;
}

function getStoreFromFolio(folio) {
  if (!storesCacheReady) return null;
  const sucursal = parseInt(folio.substring(2, 7), 10);
  const cached = storesCache.get(sucursal);
  if (!cached) return null;
  return { name: cached.name, brand: cached.brand, estado: cached.estado, sucursal };
}

// ─── VALIDADOR FOLIO ────────────────────────────────────────────────────────
function validarFormatoFolioLocal(texto) {
  // v3.36: estricto en exactamente 21 dígitos. Nunca truncar.
  const match = (texto || '').match(/\d{21}/);
  if (match) {
    const f = match[0];
    // Verificar que NO sea parte de un número más largo
    const idx = (texto || '').indexOf(f);
    const before = idx > 0 ? texto[idx - 1] : '';
    const after = texto[idx + 21] || '';
    if (/\d/.test(before) || /\d/.test(after)) {
      metrics.folio_wrong_length = (metrics.folio_wrong_length || 0) + 1;
      return { ok: false, error: "formato" };
    }
    if (!f.startsWith("84")) {
      const prefix = f.substring(0, 2);
      metrics[`folio_wrong_prefix_${prefix}`] = (metrics[`folio_wrong_prefix_${prefix}`] || 0) + 1;
      return { ok: false, error: "prefijo" };
    }
    return { ok: true, folio: f };
  }
  const onlyDigits = (texto || '').replace(/[^0-9]/g, "");
  if (/^\d{21}$/.test(onlyDigits)) {
    if (!onlyDigits.startsWith("84")) {
      const prefix = onlyDigits.substring(0, 2);
      metrics[`folio_wrong_prefix_${prefix}`] = (metrics[`folio_wrong_prefix_${prefix}`] || 0) + 1;
      return { ok: false, error: "prefijo" };
    }
    return { ok: true, folio: onlyDigits };
  }
  return { ok: false, error: "formato" };
}

// ─── USERNAME VALIDATION ────────────────────────────────────────────────────
const SUFIJOS = ["Gol","FC","MX","Pro","Star","26","Goal","Ace","Crack"];

function generarSugerencia(u) {
  const base = (u || "").replace(/[^a-zA-Z0-9]/g, "").substring(0, 8).trim();
  if (!base) return `FanGol${Math.floor(10 + Math.random() * 90)}`;
  return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase() + SUFIJOS[Math.floor(Math.random()*SUFIJOS.length)];
}

function validarUsername(u) {
  u = (u || "").trim();
  if (!u || u.length < 3)  return { valido: false, razon: "Mínimo 3 caracteres.", sugerencia: "FanGol26" };
  if (u.length > 20)       return { valido: false, razon: "Máximo 20 caracteres.", sugerencia: generarSugerencia(u) };
  if (!/^[a-zA-Z0-9_]+$/.test(u))
    return { valido: false, razon: "Solo letras, números y guion bajo (_). Sin espacios ni acentos.", sugerencia: generarSugerencia(u) };
  if (/^\d+$/.test(u))     return { valido: false, razon: "No puede ser solo números.", sugerencia: generarSugerencia(u) };
  if (/(.)\1{4,}/.test(u)) return { valido: false, razon: "Demasiados caracteres repetidos.", sugerencia: generarSugerencia(u) };
  if (/\d{10}/.test(u))    return { valido: false, razon: "No uses tu teléfono como nombre.", sugerencia: generarSugerencia(u) };
  return { valido: true };
}

// ─── WHATSAPP API + THROTTLE ────────────────────────────────────────────────
async function enviar(tel, texto, trace) {
  metrics.send_attempts++;
  const lastSend = outboundLastSend.get(tel) || 0;
  const sinceLast = Date.now() - lastSend;
  if (sinceLast < OUTBOUND_THROTTLE_MS) {
    await new Promise(r => setTimeout(r, OUTBOUND_THROTTLE_MS - sinceLast));
  }
  outboundLastSend.set(tel, Date.now());

  try {
    const res = await fetchTimeout(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: tel, type: "text",
        text: { body: texto, preview_url: false },
      }),
    });
    const d = await res.json().catch(() => ({}));
    if (d?.error) {
      metrics.send_fail++;
      const errMsg = JSON.stringify(d.error).toLowerCase();
      if (errMsg.includes("re-engagement") || errMsg.includes("24h") || errMsg.includes("131047")) {
        metrics.send_fail_24h_window++;
      }
      recordError("meta:send", JSON.stringify(d.error).substring(0, 200));
      log.error(trace, `enviar [${tel}]:`, JSON.stringify(d.error).substring(0, 200));
    } else {
      metrics.send_ok++;
      log.info(trace, `✉️ [${tel}] sent:`, d?.messages?.[0]?.id || "?");
    }
    return d;
  } catch (e) {
    metrics.send_fail++;
    if (e.isTimeout) metrics.send_timeouts++;
    recordError("meta:send", e);
    log.error(trace, `enviar [${tel}] ${e.isTimeout ? 'TIMEOUT' : 'ERR'}:`, e.message);
  }
}

async function enviarImagen(tel, url, caption = "", trace) {
  const lastSend = outboundLastSend.get(tel) || 0;
  const sinceLast = Date.now() - lastSend;
  if (sinceLast < OUTBOUND_THROTTLE_MS) {
    await new Promise(r => setTimeout(r, OUTBOUND_THROTTLE_MS - sinceLast));
  }
  outboundLastSend.set(tel, Date.now());
  try {
    await fetchTimeout(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: tel, type: "image", image: { link: url, caption } }),
    });
  } catch (e) {
    log.error(trace, `enviarImagen [${tel}]:`, e.message);
  }
}

function checkInboundRate(tel) {
  const now = Date.now();
  const entry = inboundCounter.get(tel);
  if (!entry || now - entry.windowStart > 60_000) {
    inboundCounter.set(tel, { count: 1, windowStart: now });
    return true;
  }
  entry.count++;
  if (entry.count > INBOUND_MAX_PER_MIN) {
    metrics.inbound_rate_limited++;
    return false;
  }
  return true;
}

// ─── AIRTABLE HELPERS ───────────────────────────────────────────────────────
function airtableUrl(path, queryParams = {}) {
  const url = new URL(`https://api.airtable.com/v0/${AT_BASE}/${path}`);
  for (const [k, v] of Object.entries(queryParams)) url.searchParams.set(k, v);
  return url.toString();
}

function bcUrl(path, queryParams = {}) {
  const url = new URL(`https://api.airtable.com/v0/${AT_BOT_BASE}/${path}`);
  for (const [k, v] of Object.entries(queryParams)) url.searchParams.set(k, v);
  return url.toString();
}

async function bcSyncUsuario(tel, fase = "activo", storeInfo = null, extras = {}) {
  if (!AIRTABLE_TOKEN) return;
  try {
    const fields = {
      [BCU.TEL]:    `+${tel}`,
      [BCU.FASE]:   fase,
      [BCU.ULTIMO]: new Date().toISOString(),
      [BCU.TOTAL]:  extras.totalMensajes || 1,
    };
    if (extras.primerContacto !== false) {
      fields[BCU.PRIMER] = new Date().toISOString();
    }
    if (storeInfo) {
      fields[BCU.MARCA]         = storeInfo.brand || null;
      fields[BCU.TIENDA]        = storeInfo.name || null;
      fields[BCU.CODIGO_TIENDA] = storeInfo.sucursal || null;
      fields[BCU.ESTADO]        = storeInfo.estado || null;
    }
    if (extras.username)            fields[BCU.USERNAME]          = extras.username;
    if (extras.ipUltimo)            fields[BCU.IP]                = extras.ipUltimo;
    if (extras.puntosTotal != null) fields[BCU.PUNTOS_TOTAL]      = extras.puntosTotal;
    if (extras.tiendasVisitadas)    fields[BCU.TIENDAS_VISITADAS] = extras.tiendasVisitadas;

    await fetchTimeout(bcUrl(BC_USUARIOS), {
      method: "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ fields }] }),
    }, 8000);
  } catch(e) {
    log.warn(null, `bcSyncUsuario fail: ${e.message}`);
  }
}

async function getUserLastIP(tel) {
  try {
    const res = await sbRpc("get_last_login_ip", { p_phone: tel }, null);
    if (res?.found && res?.ip) return res.ip;
  } catch (e) {
    log.warn(null, `getUserLastIP fail: ${e.message}`);
  }
  return null;
}

async function bcSyncCanje(folio, tel, username, storeInfo, rondaNum, ip) {
  if (!AIRTABLE_TOKEN) return;
  try {
    const ahora = new Date().toISOString();
    const fechaTicket = `20${folio.substring(7,9)}-${folio.substring(9,11)}-${folio.substring(11,13)}`;
    const fields = {
      [BCC.FOLIO]:         folio,
      [BCC.TELEFONO]:      `+${tel}`,
      [BCC.USERNAME]:      username || null,
      [BCC.CODIGO_TIENDA]: storeInfo?.sucursal || parseInt(folio.substring(2, 7), 10),
      [BCC.NOMBRE_TIENDA]: storeInfo?.name || null,
      [BCC.MARCA]:         storeInfo?.brand || null,
      [BCC.ESTADO]:        storeInfo?.estado || null,
      [BCC.FECHA_TICKET]:  fechaTicket,
      [BCC.FECHA_CANJE]:   ahora,
      [BCC.RONDA]:         rondaNum,
      [BCC.FUENTE]:        "WhatsApp",
    };
    if (ip) fields[BCC.IP] = ip;

    await fetchTimeout(bcUrl(BC_CANJES), {
      method: "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ fields }] }),
    }, 8000);
  } catch (e) {
    log.warn(null, `bcSyncCanje fail: ${e.message}`);
  }
}

async function bcSyncSoporte(tel, username, mensaje, categoria = "Otro") {
  if (!AIRTABLE_TOKEN) return;
  if (!BC_SOPORTE) {
    log.warn(null, `bcSyncSoporte: BC_SOPORTE_TABLE_ID no configurado en env, skipping`);
    return;
  }
  try {
    const fields = {
      [BCS.TELEFONO]:     `+${tel}`,
      [BCS.USERNAME]:     username || null,
      [BCS.MENSAJE]:      String(mensaje).substring(0, SOPORTE_MAX_CHARS),
      [BCS.CATEGORIA]:    categoria,
      [BCS.ESTADO]:       "Sin responder",
      [BCS.FECHA_CREADO]: new Date().toISOString(),
    };

    await fetchTimeout(bcUrl(BC_SOPORTE), {
      method: "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ fields }] }),
    }, 8000);
    metrics.soporte_tickets_created++;
    log.info(null, `🆘 Ticket soporte creado: ${tel} - "${String(mensaje).substring(0, 40)}..."`);
  } catch (e) {
    log.warn(null, `bcSyncSoporte fail: ${e.message}`);
  }
}

async function runLeaderboardSnapshot() {
  if (!AIRTABLE_TOKEN) return;
  try {
    const data = await sbRpc("leaderboard_snapshot", { p_limit: 1000 }, null);
    if (!Array.isArray(data) || data.length === 0) {
      log.info(null, "Leaderboard snapshot: 0 usuarios, skip");
      return;
    }
    const fecha = new Date().toISOString().substring(0, 10);
    const records = data.map((row) => ({
      fields: {
        [BCL.SNAPSHOT_ID]:       `${fecha}-${String(row.posicion).padStart(4, '0')}`,
        [BCL.FECHA]:             fecha,
        [BCL.POSICION]:          row.posicion,
        [BCL.USERNAME]:          row.username,
        [BCL.TELEFONO]:          `+${row.wa_phone}`,
        [BCL.PUNTOS_TOTAL]:      row.puntos_total,
        [BCL.MARCA]:             row.brand,
        [BCL.ESTADO]:            row.estado,
        [BCL.TIENDAS_VISITADAS]: row.tiendas_visitadas,
      },
    }));
    let success = 0;
    for (let i = 0; i < records.length; i += 10) {
      const batch = records.slice(i, i + 10);
      try {
        await fetchTimeout(bcUrl(BC_LEADERBOARD), {
          method: "POST",
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ records: batch }),
        }, 8000);
        success += batch.length;
      } catch (e) {
        log.warn(null, `Leaderboard batch fail at i=${i}: ${e.message}`);
      }
      await new Promise(r => setTimeout(r, 250));
    }
    log.info(null, `📊 Leaderboard snapshot: ${success}/${records.length} registros`);
  } catch (e) {
    log.error(null, `Leaderboard snapshot ERR: ${e.message}`);
  }
}

function atEnqueue(tableName, fields) {
  const total = Object.values(atQueue).reduce((sum, q) => sum + q.length, 0);
  if (total >= AT_QUEUE_MAX) {
    let largest = null, largestSize = 0;
    for (const [name, q] of Object.entries(atQueue)) {
      if (q.length > largestSize) { largest = name; largestSize = q.length; }
    }
    if (largest) {
      atQueue[largest].shift();
      metrics.at_queue_dropped++;
    }
  }
  atQueue[tableName].push({ fields, enqueuedAt: Date.now() });
}

async function atFlushOne(tableName, items) {
  if (atCircuitOpen) {
    if (Date.now() - atCircuitOpenedAt > AT_CIRCUIT_RECOVER_MS) {
      atCircuitOpen = false;
      atConsecutiveFails = 0;
      log.info(null, `🔌 Airtable circuit breaker CLOSED (recovered)`);
    } else {
      return;
    }
  }
  const tableId = AT_TABLES[tableName];
  if (!tableId) return;
  const batch = items.slice(0, AT_BATCH_SIZE);

  const MAX_RETRIES = 3;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchTimeout(airtableUrl(tableId), {
        method: "POST",
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ records: batch.map(b => ({ fields: b.fields })) }),
      });

      if (res.status === 429) {
        metrics.at_429_hits++;
        if (attempt < MAX_RETRIES) {
          const baseMs = 500 * Math.pow(3, attempt);
          const jitterMs = Math.floor(baseMs * (0.7 + Math.random() * 0.6));
          log.warn(null, `Airtable 429 (intento ${attempt + 1}/${MAX_RETRIES + 1}), retry en ${jitterMs}ms`);
          await new Promise(r => setTimeout(r, jitterMs));
          continue;
        }
        throw new Error(`Airtable 429 después de ${MAX_RETRIES + 1} intentos`);
      }

      if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text().catch(() => '?')}`);

      atQueue[tableName].splice(0, batch.length);
      atConsecutiveFails = 0;
      metrics.at_flush_success++;
      if (attempt > 0) metrics.at_429_recovered++;
      return;

    } catch (e) {
      if (attempt < MAX_RETRIES && (e.isTimeout || e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT')) {
        const baseMs = 500 * Math.pow(3, attempt);
        const jitterMs = Math.floor(baseMs * (0.7 + Math.random() * 0.6));
        log.warn(null, `Airtable net error (intento ${attempt + 1}), retry en ${jitterMs}ms: ${e.message}`);
        await new Promise(r => setTimeout(r, jitterMs));
        continue;
      }

      metrics.at_flush_fail++;
      atConsecutiveFails++;
      log.error(null, `Airtable flush ${tableName} fail #${atConsecutiveFails}:`, e.message);
      if (atConsecutiveFails >= AT_CIRCUIT_FAILS) {
        atCircuitOpen = true;
        atCircuitOpenedAt = Date.now();
        metrics.at_circuit_opens++;
        log.warn(null, `🔌 Airtable circuit breaker OPEN for ${AT_CIRCUIT_RECOVER_MS/1000}s`);
      }
      return;
    }
  }
}

async function atFlush() {
  const anyFlag = AT_SYNC_LOGS || AT_SYNC_FOLIOS || AT_SYNC_JUGADORES || AT_SYNC_RONDAS || AT_SYNC_ALERTAS;
  if (!anyFlag) return;
  metrics.at_queue_size = Object.values(atQueue).reduce((sum, q) => sum + q.length, 0);
  for (const tableName of Object.keys(atQueue)) {
    if (atQueue[tableName].length === 0) continue;
    await atFlushOne(tableName, atQueue[tableName]);
  }
}

function atLog(tel, mensaje, direccion, fase) {
  if (!AT_SYNC_LOGS) return;
  atEnqueue('LOGS', {
    "fldnJETIYN75AwZJF": tel,
    "fldOyr6YlCqRiGjjM": mensaje.substring(0, 500),
    "fldPPCZQVa316k1Md": direccion,
    "fldFD22sD3QOjJAc4": new Date().toISOString(),
    "fld0ByXnIf4DjADCG": fase || '',
  });
}

// ════════════════════════════════════════════════════════════════════════════
// MENSAJES AL USUARIO
// ════════════════════════════════════════════════════════════════════════════

const M = {
  bienvenidaNuevo: () =>
`¡Hola! ⚽ Soy *Gol*, tu guía oficial en *Fanáticos del Sabor*.

Para registrarte y comenzar a jugar necesito el folio de tu ticket 🎫

📍 *Dónde encontrarlo:*
↳ Está en la parte superior del ticket
↳ Empieza con *84* y tiene *21 dígitos*
↳ Cópialo directo del ticket (envía solo los números, no la fotografía)

⏱️ *Importante:* tu ticket debe ser de los últimos *${DIAS_VALIDEZ} días*.

¡Envíalo cuando lo tengas!`,

  bienvenidaConocido: (username, rondasHoy) => {
    if (rondasHoy >= RONDAS_MAX) {
      return `¡Hola, *${username}*! 🏆

Ya completaste tus *${RONDAS_MAX} rondas* de hoy. Se reinician mañana a *medianoche (hora CDMX)*.

📊 Mira tu posición → *PUNTOS*`;
    }
    if (rondasHoy === 0) {
      return `¡Hola, *${username}*! 👋

Tienes *${RONDAS_MAX} rondas* disponibles hoy.

🎫 Envía un folio para comenzar, o escribe *PUNTOS* para ver tu posición.`;
    }
    return `¡Hola, *${username}*! 👋

Llevas *${rondasHoy}/${RONDAS_MAX}* rondas hoy. Te quedan *${RONDAS_MAX - rondasHoy}*.

🎫 Envía tu siguiente folio, o escribe *PUNTOS* para ver tu posición.`;
  },

  bienvenidaReEngagement: (username) =>
`*${username}*, queremos verte de regreso 👀

La campaña sigue activa y hay *81 premios* en juego. Termina el *${CAMPAIGN_END_DATE}*.

🎫 Envía un folio para jugar, o escribe *PUNTOS* para ver tu posición.`,

  bienvenidaNuevoDia: (username) =>
`☀️ ¡Hola, *${username}*!

Tienes *${RONDAS_MAX} rondas nuevas* para hoy. Envía un folio cuando estés listo.`,

  atajoConocido: (username, rondasHoy) =>
`Envíame el folio, *${username}* 🎫

${rondasHoy < RONDAS_MAX
  ? `Llevas *${rondasHoy}/${RONDAS_MAX}* rondas hoy. Te quedan *${RONDAS_MAX - rondasHoy}*.`
  : `Ya completaste tus *${RONDAS_MAX} rondas* de hoy 🏆\nSe reinician mañana a *medianoche (hora CDMX)*.`}`,

  folioOkPideNombre: (storeName, brand) => {
    const tienda = storeName ? `*${brand}* — ${storeName}` : "*Grupo Nutrisa*";
    return `✅ Folio válido — compra realizada en ${tienda} 🥑

🎯 *Último paso:* elige tu *apodo* para el ranking.

Reglas: 3 a 20 caracteres, sin espacios y sin acentos. Solo letras, números y guion bajo.

Ejemplos: *Goleador26*, *NutriFan*, *MoyoQueen*, *ChilimRey*.

💡 Ese apodo te identificará durante toda la campaña. Elígelo con cuidado.`;
  },

  usernameInvalido: (razon, sugerencia) =>
`Ese apodo no es válido 😅
*${razon}*

${sugerencia ? `Te sugerimos *${sugerencia}*, o envía otro.` : "Envía otro nombre."}

💡 Si deseas empezar de nuevo, escribe *REINICIAR*.`,

  usernameProfanity: (sugerencia) =>
`Ese apodo no es válido 😅
*Nuestro filtro lo identificó como inapropiado o contiene una palabra restringida.*

${sugerencia ? `Te sugerimos *${sugerencia}*, o envía otro.` : "Envía otro apodo."}

💡 Si consideras que es un error, escribe *SOPORTE* y proporciona tu nombre real para revisarlo.`,

  usernameTomado: (sugerencia) =>
`Ese apodo ya está en uso 😅

Cada apodo es único — el primer fanático que lo elige se lo queda.

Te sugerimos *${sugerencia}*, o envía uno propio.

🎯 Sugerencia: agregar números o tu marca favorita ayuda — *NutriQueen*, *MoyoKing*, *ChilimChef*`,

  registroCompleto: (username, magicLink, rondasHoy) =>
`¡Listo, *${username}*! 🎉 Ya eres oficial *Fanático del Sabor*.

🎮 *Toca aquí para jugar:*
${magicLink}

⏱️ El link es solo tuyo. Expira en *1 hora* y funciona *una sola vez*.

Vas en la ronda *${rondasHoy}/${RONDAS_MAX}* de hoy.`,

  folioAdicional: (username, rondaNum, magicLink) =>
`✅ ¡Otra ronda lista, *${username}*!

🎮 *Ronda ${rondaNum}/${RONDAS_MAX}* — toca aquí:
${magicLink}

${rondaNum < RONDAS_MAX
  ? `Te quedan *${RONDAS_MAX - rondaNum} rondas* hoy. ¡A subir en el ranking!`
  : `🔥 Última ronda de hoy. Mañana a medianoche se reinician.`}`,

  reenvioLink: (username, magicLink) =>
`Aún no terminaste tu ronda actual, *${username || "Fanático"}* 🎮

Te reenvío el link para que completes los 4 minijuegos:
${magicLink}

✅ Cuando completes esa ronda, envíame el folio nuevo y lo registraré.

⏱️ Tienes hasta *15 minutos* para terminar antes de que el folio se libere automáticamente.
🔄 Si recibiste varios links, *usa el más reciente* — los anteriores ya no funcionan.`,

  rondaCompletada: (username, score, rondasHoy, puntosTotal, posicion, totalJugadores) => {
    let posLine = "";
    if (posicion && totalJugadores) {
      posLine = `\n🏆 Vas en el lugar *#${posicion}* de ${fmt(totalJugadores)}`;
    }
    return `🎉 *¡Cerraste la ronda, ${username}!*

⚽ Esta partida: *${fmt(score)} pts*
🔥 Total acumulado: *${fmt(puntosTotal)} pts*${posLine}

Te quedan *${RONDAS_MAX - rondasHoy} rondas* hoy — envía otro folio para seguir.`;
  },

  rondaCompletadaMaxDia: (username, score, puntosTotal, posicion, totalJugadores) => {
    let posLine = "";
    if (posicion && totalJugadores) {
      posLine = `\n🏆 Vas en el lugar *#${posicion}* de ${fmt(totalJugadores)}`;
    }
    return `🏆 *¡Completaste todas tus rondas del día, ${username}!*

⚽ Última ronda: *${fmt(score)} pts*
🔥 Total del día: *${fmt(puntosTotal)} pts*${posLine}

🌅 Las rondas se reinician mañana a *medianoche (hora CDMX)*.

💡 Comparte la campaña con tus amigos para que jueguen — pero *no compartas tus folios* (cada uno es único).`;
  },

  maxRondas: (username) =>
`Ya completaste tus *${RONDAS_MAX} rondas* de hoy, *${username}* 🏆

Guarda ese folio — sigue siendo válido por *${DIAS_VALIDEZ} días*. Puedes canjearlo mañana.

🌅 Las rondas se reinician a *medianoche (hora CDMX)*.

📊 Mira tu posición → *PUNTOS*`,

  folioError: (error) => {
    const msgs = {
      formato:
`🤔 No identifiqué un folio válido en tu mensaje.

Necesito:
↳ *21 dígitos* exactos
↳ Que empiece con *84*
↳ Solo los números (sin fotografía, sin texto adicional)

¿No sabes dónde está? Escribe *FOLIO* y te indico 📋

💡 Si estabas escribiendo otra cosa, escribe *AYUDA* para ver las opciones.`,

      prefijo:
`Tu folio debe empezar con *84* 📋

Si empieza con otro número, no es de las marcas participantes.

Si lo copiaste incorrectamente, revisa el ticket e inténtalo de nuevo.

💡 Las marcas participantes son: Nutrisa, Moyo, Cielito Café y Chilim Balam. Escribe *TIENDAS* para más información.`,

      invalid_format:
`El folio no tiene el formato correcto.

Debe ser *21 dígitos* exactos, empezando con *84*.

Si copiaste el ticket entero, envíame *únicamente* los dígitos.

💡 Escribe *FOLIO* si necesitas ayuda para ubicarlo en tu ticket.`,

      invalid_empresa:
`Ese folio no es de una marca participante.

Solo aceptamos folios de: *Nutrisa*, *Moyo*, *Cielito Café* y *Chilim Balam*.

💡 Escribe *TIENDAS* para más detalle.`,

      invalid_date:
`La fecha en ese folio no es válida 🤔

Revisa que hayas copiado todos los dígitos correctamente.

💡 Si consideras que tu ticket está dañado, escribe *SOPORTE*.`,

      unknown_store:
`Esa tienda no aparece en la lista de participantes 🧐

¿Es un ticket de Nutrisa, Moyo, Cielito Café o Chilim Balam?
Si lo es, el ticket podría estar dañado — intenta con otro.

💡 ¿Consideras que es un error nuestro? Escribe *SOPORTE*.`,

      expired:
`😕 Ese ticket tiene más de *${DIAS_VALIDEZ} días*.

Los tickets son válidos por *${DIAS_VALIDEZ} días* desde la compra. Después no pueden canjearse.

🎫 ¿Tienes uno más reciente? Envíalo.

💡 *Sugerencia:* envía tu folio el mismo día de la compra para evitar que se venza.`,

      not_yet_valid:
`La fecha del ticket aún no llega 🤔

Revisa la fecha en tu ticket — debe ser de *hoy o ayer*.

💡 Si la fecha es correcta y aun así da error, escribe *SOPORTE*.`,

      date_too_early:
`Ese ticket es anterior al inicio de la campaña 📅

*Fanáticos del Sabor* arrancó recientemente. Solo cuentan tickets desde esa fecha.

🎫 ¿Tienes uno más reciente? Envíalo.`,

      campaign_ended:
`🏁 *Fanáticos del Sabor* ya finalizó.

La campaña concluyó. ¡Gracias por jugar! ⚽
Consulta los ganadores en ${SITE_URL}.`,

      folio_too_low:
`Ese folio es anterior al inicio de la campaña 📋

Solo se aceptan compras realizadas durante *Fanáticos del Sabor*.

🎫 ¿Tienes uno más reciente? Envíalo.`,

      already_used:
`🔒 Ese folio ya fue canjeado.

Cada folio se usa una sola vez, por una sola persona.

⚠️ Si lo compartiste con alguien:
↳ Esa persona pudo haberlo usado antes que tú
↳ Escribe *SOPORTE* si consideras que fue un robo

💡 *Tu folio es tu llave personal.* No lo compartas.

🎫 ¿Tienes otro ticket? Envíalo.`,

      ticket_limit_reached:
`Ya completaste tus *${RONDAS_MAX} rondas* de hoy 🏆
Cada persona tiene *${RONDAS_MAX} rondas diarias*.

🌅 Se reinician a *medianoche (hora CDMX)*.
La hora de tu celular no aplica — siempre es hora de México.

💡 Guarda tu folio: sigue siendo válido por ${DIAS_VALIDEZ} días.`,

      session_active:
`Aún no terminaste tu ronda actual 🎮

👉 Entra a *${SITE_URL}* con el link que te envié y *completa los 4 minijuegos*.

Cuando completes esa ronda, podrás canjear otro folio.

(Si no completas en 15 minutos, el folio se libera automáticamente.)

💡 ¿Perdiste el link? Envíame de nuevo el folio que ya canjeaste para reenviártelo.`,

      rate_limited:
`Estás enviando folios demasiado rápido 🛑

Espera *1 minuto* y vuelve a intentarlo.

💡 Si consideras que es un error, escribe *SOPORTE*.`,

      invalid_user_id:
`Tuvimos un problema técnico con tu cuenta 😞
*No es algo que hicieras mal.* Escribe *REINICIAR* para empezar de nuevo.

Si el problema persiste, escribe *SOPORTE*.`,

      missing_user_id:
`Tuvimos un problema técnico con tu cuenta 😞
*No es algo que hicieras mal.* Escribe *REINICIAR* para empezar de nuevo.

Si el problema persiste, escribe *SOPORTE*.`,

      unauthorized:
`Hubo un problema con tu sesión 😞
Escribe *REINICIAR* para empezar de nuevo.

Si el problema persiste, escribe *SOPORTE*.`,

      internal_error:
`Tuvimos un problema técnico 😞
*No es algo que hicieras mal.* Inténtalo de nuevo en 1 a 2 minutos.

Si el problema persiste, escribe *SOPORTE*.`,
    };
    return msgs[error] || `No pude validar ese folio. Verifica que esté completo y envíalo de nuevo.

💡 Si consideras que algo no está bien, escribe *SOPORTE*.`;
  },

  errorRegistro: () =>
`Tuvimos un problema técnico al registrarte 😞
*No es algo que hicieras mal.* Intenta de nuevo en 1 a 2 minutos.

Si el problema persiste, escribe *SOPORTE*.`,

  errorEdgeFunction: () =>
`Estamos teniendo un problema temporal 🙏
Inténtalo de nuevo en 1 a 2 minutos.

Si sigue fallando, escribe *SOPORTE*.`,

  servidorSaturado: () =>
`🔥 Estamos recibiendo mucho tráfico.
Inténtalo de nuevo en *30 segundos*. Tu folio no se ha perdido.

(No es necesario reenviarlo — espera y te responderemos cuando se libere.)`,

  ayuda: (u) =>
`👋 Soy *Gol*${u ? `, tu apodo es *${u}*` : ""}.

Esto es lo que puedo hacer:

🎫 *Envía un folio* → Jugar una ronda
📊 *PUNTOS* → Tu puntaje y posición
🔗 *MI LINK* → Reenviar tu último link
🎮 *OTRA RONDA* → Pedir otro folio
🏆 *PREMIOS* → Lo que puedes ganar
🏪 *TIENDAS* → Marcas participantes
📋 *REGLAS* → Cómo funciona
🔍 *FOLIO* → Dónde está en el ticket
🔄 *REINICIAR* → Empezar de nuevo

⚠️ *No proceso:* fotografías, audios, videos ni stickers.

🆘 *SOPORTE* → Hablar con un humano de Grupo Nutrisa.`,

  puntos: (username, stats) => {
    if (!stats || stats.puntos_total === 0 || !stats.posicion) {
      return `📊 Aún no tienes puntaje, *${username}*.

🎫 Envía un folio para jugar tu primera ronda y aparecer en el ranking.

💡 Cada folio equivale a 1 ronda de 4 minijuegos.`;
    }

    const top3 = (stats.top_3 || []).slice(0, 3);
    const top3Lines = top3.map((u, i) => {
      const medal = ["🥇", "🥈", "🥉"][i] || "•";
      const isYou = u.username === username ? " ← tú" : "";
      return `${medal} *${u.username}* — ${fmt(u.puntos)} pts${isYou}`;
    }).join("\n");

    const inTop3 = top3.some(u => u.username === username);
    const youLine = inTop3 ? "" : `\n\nTu lugar: *#${stats.posicion}* de ${fmt(stats.total_jugadores)} jugadores`;

    return `📊 *${username}*, este es tu progreso:

⚽ Total acumulado: *${fmt(stats.puntos_total)} pts*
🎯 Mejor ronda: *${fmt(stats.mejor_ronda)} pts*${youLine}

🏆 *Top 3 actual:*
${top3Lines}

🎫 Para subir, envía otro folio.`;
  },

  premios: () =>
`🏆 *81 premios en total* — Fanáticos del Sabor

🥇 *Top 20 del leaderboard*
↳ Meet & Greet con *La Cotorrisa* 🎤
↳ El evento del año

🥈 *Top 8 siguientes*
↳ *Nintendo Switch 2* 🎮
↳ La consola más buscada de 2026

🥉 *Top 13 siguientes*
↳ *LEGO Edición Especial* 🧱
↳ Para coleccionistas

🏅 *Top 40 siguientes*
↳ *Merchandising firmado por La Cotorrisa* 👕
↳ Edición limitada de la campaña

💪 *Cómo subir en el ranking:*
↳ Juega tus *${RONDAS_MAX} rondas diarias*
↳ Mejora tu puntaje en cada juego
↳ Acumula puntos durante toda la campaña

🔥 La campaña termina el *${CAMPAIGN_END_DATE}*.

📊 Para ver tu posición → *PUNTOS*`,

  tiendas: () =>
`🏪 *Marcas participantes:*

🥑 *Nutrisa* → yogurts y helados
🍦 *Moyo* → yogurt helado con toppings
☕ *Cielito Café* → café y panadería
🌮 *Chilim Balam* → cocina mexicana

🎫 Compra en cualquiera → guarda el ticket → envíame el folio dentro de los siguientes *${DIAS_VALIDEZ} días*.

💡 Cada marca cuenta igual para tus puntos.`,

  reglas: () =>
`📋 *Reglas de la campaña:*

🎫 *1 folio = 1 ronda* (4 minijuegos)
🎮 Máximo *${RONDAS_MAX} rondas* al día
📅 Ticket válido por *${DIAS_VALIDEZ} días* desde la compra
🏆 Los puntos *se acumulan* durante toda la campaña
🌅 Las rondas se reinician a *medianoche (hora CDMX)*
🔒 Cada folio se usa *una sola vez* — no lo compartas
👤 *Un WhatsApp equivale a una cuenta* — no se permiten cuentas duplicadas

📅 La campaña termina el *${CAMPAIGN_END_DATE}*.

💡 Si algo no queda claro, escribe *AYUDA* o *SOPORTE*.`,

  dondeFolio: () =>
`📋 *Cómo encontrar tu folio:*

🧾 Mira la *parte superior del ticket*
🔢 Busca *21 dígitos seguidos*
🟢 Siempre empieza con *84*
📍 Está antes de la lista de productos

📷 Te envié una imagen de ejemplo arriba — fíjate en los números marcados.

⚠️ *Importante:*
↳ ❌ No envíes la fotografía — no puedo leerla
↳ ❌ No envíes el ticket completo escrito
↳ ✅ Envía únicamente los 21 números

💡 *Consejo:* en iOS y Android, mantén presionado el número en la foto de tu ticket para copiarlo.`,

  gracias: (u) =>
`¡Con gusto${u ? `, *${u}*` : ""}! ⚽

💡 Si necesitas algo más, escribe *AYUDA*.`,

  noTexto: () =>
`😅 Soy un bot de texto — no proceso fotografías, audios, videos ni stickers.

🎫 *¿Querías enviar tu folio?*
↳ Cópialo directo del ticket (los *21 números*)
↳ Pégalo aquí como texto
↳ ¿No sabes cómo? Escribe *FOLIO*

💬 *¿Querías otra cosa?*
↳ Escribe *AYUDA* para ver todas las opciones
↳ Escribe *SOPORTE* si necesitas hablar con un humano`,

  pedirFolio: () =>
`Para continuar necesito tu *folio* 🎫

📍 *Cómo encontrarlo:*
↳ 21 dígitos
↳ Empieza con *84*
↳ Está en la parte superior del ticket

✅ *Cópialo y pégalo directo* — no envíes la fotografía.

¿Tienes dudas? Escribe *FOLIO* para más detalles.
¿Necesitas otra cosa? Escribe *AYUDA*.`,

  soporteIntro: () =>
`🆘 *Te pondremos en contacto con un humano de Grupo Nutrisa.*

Descríbenos en una sola frase qué necesitas. Por ejemplo:
↳ "Mi folio está dañado"
↳ "Alguien usó mi folio"
↳ "No me llega el link"
↳ "Quiero reportar un problema"
↳ Cualquier otro asunto

📩 Un humano te contestará en *menos de 24 horas* (lunes a viernes, 9:00 a 18:00 CDMX).

💡 Sugerencia: si no has recibido tu link, envía otro folio para generar uno nuevo.

(Si cambias de opinión, escribe *CANCELAR*.)`,

  soporteConfirmado: () =>
`✅ *Reporte recibido.*

Un humano de Grupo Nutrisa revisará tu caso y te contactará pronto.

🎫 Puedes seguir jugando si tienes otro folio.`,

  soporteCancelado: () =>
`Listo, cancelado 👌

Si cambias de opinión, escribe *SOPORTE* otra vez.

¿Necesitas otra cosa? Escribe *AYUDA*.`,

  miLink: (username, magicLink) =>
`🔗 Aquí está tu link, *${username}*:

${magicLink}

⏱️ Expira en *1 hora*. Si ya expiró, envía otro folio para generar uno nuevo.`,

  miLinkNoActivo: (username) =>
`No tienes una ronda activa, *${username || "Fanático"}* 🤔

🎫 Envía un folio para iniciar una nueva ronda — te generaré un link al momento.

📊 Si solo querías ver tu puntaje, escribe *PUNTOS*.`,

  otraRonda: (username, rondasHoy) => {
    if (rondasHoy >= RONDAS_MAX) {
      return `Ya completaste tus *${RONDAS_MAX} rondas* de hoy, *${username}* 🏆

🌅 Se reinician mañana a *medianoche (hora CDMX)*.

📊 Mira tu posición → *PUNTOS*`;
    }
    return `¡Perfecto, *${username}*! 🔥

Compra otro producto en *Nutrisa, Moyo, Cielito Café o Chilim Balam* — cada compra es una oportunidad de subir en el ranking.

🎫 Envía los 21 dígitos del folio de tu nuevo ticket.

Te quedan *${RONDAS_MAX - rondasHoy} rondas* hoy.`;
  },
};

// ─── DETECCIÓN DE INTENCIÓN ─────────────────────────────────────────────────
function detectarIntencion(texto) {
  const t = texto.toUpperCase().trim();
  const inc = (...w) => w.some(p => t.includes(p));
  const num = texto.replace(/\s/g, "");
  if (/^84\d{19}$/.test(num)) return "folio_input";
  if (inc("INGRESAR CÓDIGO","INGRESAR CODIGO","INGRESAR FOLIO","NUEVO FOLIO")) return "atajo_codigo";
  if (inc("SOPORTE","AYUDA HUMANA","HABLAR CON ALGUIEN","HABLAR CON HUMANO","REPORTAR PROBLEMA","CONTACTAR HUMANO")) return "soporte";
  if (inc("MI LINK","MILINK","MI ENLACE","REENVIAR LINK","NUEVO LINK","DAME EL LINK","DAME EL ENLACE","NO ME LLEGA EL LINK","SE PERDIO EL LINK","ENVIA LINK")) return "mi_link";
  if (t === "LINK" || t === "ENLACE") return "mi_link";
  if (inc("OTRA RONDA","QUIERO OTRA RONDA","NUEVA RONDA","JUGAR OTRA","JUGAR DE NUEVO","JUGAR OTRA VEZ","OTRA PARTIDA","UNA MÁS","UNA MAS","MAS RONDAS","MÁS RONDAS")) return "otra_ronda";
  if (t === "CANCELAR") return "cancelar";
  if (inc("AYUDA","HELP","OPCIONES","MENÚ","MENU","COMANDOS")) return "ayuda";
  if (inc("PUNT","SCORE","RANKING","COMO VOY","CÓMO VOY","MI POSICION","MI POSICIÓN")) return "puntos";
  if (inc("PREMIO","GANAR","QUÉ GANO","QUE GANO","QUE PUEDO GANAR")) return "premios";
  if (inc("TIENDA","MARCA","NUTRISA","MOYO","CHILIM","CIELITO")) return "tiendas";
  if (inc("REGLA","FUNCIONA","INSTRUCCIONES","CÓMO JUEGO","COMO JUEGO")) return "reglas";
  if (inc("DÓNDE ESTÁ","DONDE ESTA","NO ENCUENTRO","COMO ENCUENTRO","CÓMO ENCUENTRO")) return "donde_folio";
  if (t === "FOLIO" || t === "TICKET") return "donde_folio";
  if (inc("REINICIAR","BORRAR","RESET","EMPEZAR DE NUEVO","EMPEZAR DE CERO")) return "reiniciar";
  if (inc("GRACIAS","GRAX","THANKS")) return "gracias";
  if (inc("HOLA","BUENAS","HEY","SALUDOS","JUGAR","QUIUBOLE","QUÉ ONDA","QUE ONDA")) return "saludo";
  return null;
}

async function cargarSesion(tel, trace) {
  // v3.35: retry interno para evitar marcar usuarios registrados como "nuevo" por timeout transitorio
  let data = await sbRpc("get_wa_profile", { p_phone: tel }, trace);
  if (data === null) {
    // sbRpc retorna null en error (timeout, 429, 500). Distinguir de found:false.
    log.warn(trace, `cargarSesion: get_wa_profile retornó null — retry en 300ms`);
    metrics.cargar_sesion_retry = (metrics.cargar_sesion_retry || 0) + 1;
    await new Promise(r => setTimeout(r, 300));
    data = await sbRpc("get_wa_profile", { p_phone: tel }, trace);
    if (data === null) {
      // Sigue fallando. Retornar marker especial para que el caller no marque cargado=true.
      metrics.cargar_sesion_fail = (metrics.cargar_sesion_fail || 0) + 1;
      log.error(trace, `cargarSesion: get_wa_profile falló 2x para ${tel} — caller debe reintentar`);
      return { __error: true };
    }
  }
  if (data && data.found) { metrics.get_profile_found++; return data; }
  metrics.get_profile_notfound++;
  return null;
}

function diasSinActividad(profile) {
  if (!profile || !profile.wa_ultimo_mensaje_at) return 0;
  const diff = Date.now() - new Date(profile.wa_ultimo_mensaje_at).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ─── LÓGICA PRINCIPAL ───────────────────────────────────────────────────────
async function procesarMensajeCore(tel, texto, trace) {
  atLog(tel, texto, 'in', getSesion(tel).fase);

  const intencion = detectarIntencion(texto);
  let s = getSesion(tel);

  // v3.37: Re-cargar de BD si caché está stale (>3 min sin actividad) Y la fase es segura
  // Esto previene que una réplica use datos viejos cuando otra réplica modificó la BD.
  // Incluimos esperando_soporte para que cambios cross-réplica se reflejen.
  const cacheIsStale = s.cargado && s.lastSeen && 
    (Date.now() - s.lastSeen > CACHE_STALE_MS) &&
    (s.fase === "activo" || s.fase === "esperando_folio" || s.fase === "nuevo" || s.fase === "desconocido" || s.fase === "esperando_soporte");
  
  if (!s.cargado || cacheIsStale) {
    if (cacheIsStale) {
      log.info(trace, `Caché stale (${Math.round((Date.now() - s.lastSeen)/1000)}s) — re-cargando de BD`);
      metrics.cache_stale_reload = (metrics.cache_stale_reload || 0) + 1;
    }
    const jugador = await cargarSesion(tel, trace);
    // v3.35: si cargarSesion devolvió __error transitorio:
    // - Si no había caché (first message): respondemos "saturado" y reintentamos próximo msg
    // - Si caché era stale (refresh): mantenemos el caché viejo para no bloquear al usuario
    if (jugador && jugador.__error) {
      if (cacheIsStale) {
        log.warn(trace, `BD falló en re-carga, manteniendo caché viejo`);
        metrics.cache_stale_reload_failed = (metrics.cache_stale_reload_failed || 0) + 1;
        setSesion(tel, { lastSeen: Date.now() }); // refresh lastSeen para evitar loop
      } else {
        log.warn(trace, `Sesión no cargada por error transitorio — respondiendo con mensaje genérico, próximo msg reintentará`);
        metrics.session_load_deferred = (metrics.session_load_deferred || 0) + 1;
        return enviar(tel, M.servidorSaturado(), trace);
      }
    } else if (jugador) {
      if (jugador.wa_bloqueado === true) {
        metrics.user_blocked = (metrics.user_blocked || 0) + 1;
        log.warn(trace, `🚫 Usuario bloqueado, ignorando: ${tel}`);
        return;
      }

      let recoveredPhase = jugador.wa_phase || "nuevo";
      let recoveredPendingFolio = null;
      
      // v3.36: si fase es esperando_username, intentar recuperar pendingFolio de BD
      if (recoveredPhase === "esperando_username") {
        const pendingRes = await sbRpc("get_pending_registration", { p_phone: tel }, trace);
        if (pendingRes?.found && pendingRes?.pending_folio) {
          recoveredPendingFolio = pendingRes.pending_folio;
          log.info(trace, `Sesión recuperada en esperando_username con pendingFolio=${recoveredPendingFolio}`);
          metrics.session_recovery_with_folio = (metrics.session_recovery_with_folio || 0) + 1;
        } else {
          log.warn(trace, `Sesión recuperada en esperando_username — pendingFolio no encontrado en BD, reset a esperando_folio`);
          metrics.session_recovery_lost_folio = (metrics.session_recovery_lost_folio || 0) + 1;
          recoveredPhase = "esperando_folio";
        }
      }
      if (recoveredPhase === "esperando_soporte") {
        log.info(trace, `Sesión recuperada en esperando_soporte — manteniendo fase`);
        metrics.session_recovery_soporte = (metrics.session_recovery_soporte || 0) + 1;
      }
      log.info(trace, `Sesión cargada de BD: fase=${recoveredPhase} username=${jugador.wa_username || 'null'} registered=${jugador.wa_registered}`);
      setSesion(tel, {
        cargado:     true,
        fase:        recoveredPhase,
        username:    jugador.wa_username || jugador.username || null,
        userId:      jugador.user_id || null,
        registered:  jugador.wa_registered === true,
        pendingFolio: recoveredPendingFolio,
        rondasHoy:   typeof jugador.wa_rondas_hoy === 'number' ? jugador.wa_rondas_hoy : 0,
        rondasTotal: typeof jugador.wa_rondas_total === 'number' ? jugador.wa_rondas_total : 0,
        fechaReset:  jugador.wa_fecha_reset || null,
        bloqueado:   jugador.wa_bloqueado === true,
        diasSinJugar: diasSinActividad(jugador),
      });
    } else {
      // v3.36: si no hay profile, ver si hay un registro pendiente (user mandó folio pero aún no apodo)
      const pendingRes = await sbRpc("get_pending_registration", { p_phone: tel }, trace);
      if (pendingRes?.found && pendingRes?.pending_folio) {
        log.info(trace, `No hay profile pero sí pendingFolio=${pendingRes.pending_folio} — fase=esperando_username`);
        metrics.session_recovery_with_folio = (metrics.session_recovery_with_folio || 0) + 1;
        setSesion(tel, {
          cargado: true, fase: "esperando_username",
          username: null, userId: null, registered: false,
          pendingFolio: pendingRes.pending_folio,
          rondasHoy: 0, rondasTotal: 0, fechaReset: null
        });
      } else {
        // BD dice no encontrado: limpiar explícitamente username/userId del caché viejo
        setSesion(tel, { 
          cargado: true, fase: "nuevo", 
          username: null, userId: null, registered: false,
          rondasHoy: 0, rondasTotal: 0, fechaReset: null,
          pendingFolio: null
        });
      }
    }
    s = getSesion(tel);
  }

  if (s.bloqueado === true) {
    metrics.user_blocked = (metrics.user_blocked || 0) + 1;
    log.warn(trace, `🚫 Usuario bloqueado (cache), ignorando: ${tel}`);
    return;
  }

  const username = s.username || null;
  const userId   = s.userId   || null;
  const hoy      = hoyMexico();
  let rondasHoy  = s.fechaReset === hoy ? (s.rondasHoy || 0) : 0;
  const diasSinJugar = s.diasSinJugar || 0;

  // v3.37 helper: recuperar perfil de BD al vuelo cuando el cache no tiene userId pero el user podría estar registrado.
  // Esto cubre el caso de cambio de réplica, restart, o cache no poblado.
  async function recoverFromDB(reason) {
    log.warn(trace, `recoverFromDB (${reason}): cache sin userId, verificando BD para ${tel}`);
    metrics.last_resort_db_check = (metrics.last_resort_db_check || 0) + 1;
    const profile = await sbRpc("get_wa_profile", { p_phone: tel }, trace);
    if (profile?.found && profile?.wa_registered && profile?.wa_username && profile?.user_id) {
      const rec = {
        username: profile.wa_username,
        userId:   profile.user_id,
        rondasHoy: profile.wa_fecha_reset === hoy ? (profile.wa_rondas_hoy || 0) : 0,
        diasSinJugar: diasSinActividad(profile),
      };
      setSesion(tel, {
        cargado: true,
        fase: "activo",
        username: rec.username,
        userId: rec.userId,
        registered: true,
        rondasHoy: rec.rondasHoy,
        rondasTotal: profile.wa_rondas_total || 0,
        fechaReset: profile.wa_fecha_reset || null,
        diasSinJugar: rec.diasSinJugar,
      });
      log.info(trace, `recoverFromDB (${reason}): recuperado ${rec.username}`);
      metrics.last_resort_db_recovered = (metrics.last_resort_db_recovered || 0) + 1;
      return rec;
    }
    return null;
  }

  if (s.fechaReset && s.fechaReset !== hoy && userId) {
    rondasHoy = 0;
    setSesion(tel, { rondasHoy: 0, fechaReset: hoy });
    sbRpc("update_wa_profile", { p_phone: tel, p_user_id: userId, p_rondas_hoy: 0, p_fecha_reset: hoy }, trace).catch(() => {});
  }

  if (intencion === "soporte") {
    metrics.cmd_soporte_invoked++;
    setSesion(tel, { fase: "esperando_soporte" });
    return enviar(tel, M.soporteIntro(), trace);
  }
  if (s.fase === "esperando_soporte") {
    // v3.37: early-exit del modo soporte si el usuario manda comandos claros.
    // Esto evita que un folio o "reiniciar" se manden a Airtable como "reporte".
    const earlyExitIntents = ["reiniciar", "folio_input", "ayuda", "puntos", "mi_link", "otra_ronda", "saludo"];
    if (earlyExitIntents.includes(intencion)) {
      log.info(trace, `Soporte cancelado por intent "${intencion}" — bypass automático`);
      metrics.soporte_auto_cancel = (metrics.soporte_auto_cancel || 0) + 1;
      setSesion(tel, { fase: username ? "activo" : "nuevo" });
      // No respondemos M.soporteCancelado() — el handler del intent siguiente responde
      // Re-leer la sesión para que los handlers de abajo vean la fase actualizada
      s = getSesion(tel);
    } else if (intencion === "cancelar") {
      setSesion(tel, { fase: username ? "activo" : "nuevo" });
      return enviar(tel, M.soporteCancelado(), trace);
    } else {
      await bcSyncSoporte(tel, username, texto, "Otro").catch(() => {});
      setSesion(tel, { fase: username ? "activo" : "nuevo" });
      return enviar(tel, M.soporteConfirmado(), trace);
    }
  }

  if (intencion === "reiniciar") {
    metrics.cmd_reiniciar_invoked++;
    setSesion(tel, { fase: username ? "activo" : "nuevo", intentos: 0, pendingFolio: null });
    sbRpc("clear_pending_registration", { p_phone: tel }, trace).catch(() => {});
    return enviar(tel, username ? M.bienvenidaConocido(username, rondasHoy) : M.bienvenidaNuevo(), trace);
  }
  if (intencion === "ayuda")       { metrics.cmd_ayuda_invoked++;   return enviar(tel, M.ayuda(username), trace); }
  if (intencion === "puntos")      {
    metrics.cmd_puntos_invoked++;
    let _puid = userId, _puser = username;
    if (!_puid) {
      const rec = await recoverFromDB("puntos");
      if (rec) { _puid = rec.userId; _puser = rec.username; }
    }
    if (!_puid) {
      return enviar(tel, `Para ver tu puntaje primero necesitas registrarte. Envíame tu folio: 21 dígitos que empiezan con 84.`, trace);
    }
    let statsRes = null;
    let rpcFailed = false;
    try {
      statsRes = await sbRpc("get_user_stats_for_bot", { p_user_id: _puid }, trace);
    } catch (e) {
      rpcFailed = true;
      log.error(trace, `get_user_stats_for_bot failed: ${e.message}`);
    }
    if (rpcFailed) {
      return enviar(tel, M.errorEdgeFunction(), trace);
    }
    if (!statsRes || statsRes.found === false) {
      return enviar(tel, M.puntos(_puser || "Fanático", null), trace);
    }
    return enviar(tel, M.puntos(_puser || statsRes.username, statsRes), trace);
  }
  if (intencion === "mi_link")     {
    metrics.cmd_mi_link_invoked++;
    let _muid = userId, _muser = username;
    if (!_muid) {
      const rec = await recoverFromDB("mi_link");
      if (rec) { _muid = rec.userId; _muser = rec.username; }
    }
    if (!_muid) {
      return enviar(tel, `Para recibir un link primero necesitas registrarte. Envíame tu folio: 21 dígitos que empiezan con 84.`, trace);
    }
    const linkRes = await waAuth("get_link", { phone: tel }, trace).catch(() => null);
    if (linkRes?.ok && linkRes.magic_link) {
      return enviar(tel, M.miLink(_muser || "Fanático", linkRes.magic_link), trace);
    }
    return enviar(tel, M.miLinkNoActivo(_muser), trace);
  }
  if (intencion === "otra_ronda")  {
    metrics.cmd_otra_ronda_invoked++;
    let _u = username, _uid = userId, _rondas = rondasHoy;
    if (!_uid) {
      const rec = await recoverFromDB("otra_ronda");
      if (rec) { _u = rec.username; _uid = rec.userId; _rondas = rec.rondasHoy; }
    }
    if (!_uid) {
      // genuinamente nuevo: mensaje corto, no el de bienvenida completo
      return enviar(tel, `Para empezar envíame tu folio: 21 dígitos que empiezan con 84.`, trace);
    }
    return enviar(tel, M.otraRonda(_u || "Fanático", _rondas), trace);
  }
  if (intencion === "premios")     { metrics.cmd_premios_invoked++; return enviar(tel, M.premios(), trace); }
  if (intencion === "tiendas")     { metrics.cmd_tiendas_invoked++; return enviar(tel, M.tiendas(), trace); }
  if (intencion === "reglas")      { metrics.cmd_reglas_invoked++;  return enviar(tel, M.reglas(), trace); }
  if (intencion === "gracias")     return enviar(tel, M.gracias(username), trace);
  if (intencion === "donde_folio") {
    metrics.cmd_folio_invoked++;
    await enviarImagen(tel, IMG_FOLIO, "📋 Tu folio: 21 dígitos que empiezan con 84", trace);
    return enviar(tel, M.dondeFolio(), trace);
  }

  if (intencion === "saludo") {
    let _u = username, _uid = userId, _rondas = rondasHoy, _dias = diasSinJugar;
    if (!_uid) {
      const rec = await recoverFromDB("saludo");
      if (rec) { _u = rec.username; _uid = rec.userId; _rondas = rec.rondasHoy; }
    }
    if (_u) {
      if (_dias >= DIAS_RE_ENGAGEMENT) {
        metrics.reengagement_triggered++;
        return enviar(tel, M.bienvenidaReEngagement(_u), trace);
      }
      if (_dias === 1 && _rondas === 0) {
        return enviar(tel, M.bienvenidaNuevoDia(_u), trace);
      }
      return enviar(tel, M.bienvenidaConocido(_u, _rondas), trace);
    }
    setSesion(tel, { fase: "esperando_folio" });
    await enviarImagen(tel, IMG_FOLIO, "📋 Tu folio: 21 dígitos que empiezan con 84", trace);
    return enviar(tel, M.bienvenidaNuevo(), trace);
  }

  if (intencion === "atajo_codigo") {
    let _u = username, _uid = userId, _rondas = rondasHoy;
    if (!_uid) {
      const rec = await recoverFromDB("atajo_codigo");
      if (rec) { _u = rec.username; _uid = rec.userId; _rondas = rec.rondasHoy; }
    }
    if (_u) {
      setSesion(tel, { fase: "esperando_folio" });
      return enviar(tel, M.atajoConocido(_u, _rondas), trace);
    }
    setSesion(tel, { fase: "esperando_folio" });
    await enviarImagen(tel, IMG_FOLIO, "📋 Tu folio: 21 dígitos que empiezan con 84", trace);
    return enviar(tel, M.bienvenidaNuevo(), trace);
  }

  if (s.fase === "esperando_username") {
    if (intencion === "folio_input") {
      log.info(trace, `Folio recibido en esperando_username — pidiendo username del folio anterior`);
      return enviar(tel,
        `Antes envíame *un apodo* para tu folio anterior.\n\n` +
        `O escribe *REINICIAR* si prefieres empezar con este folio nuevo.`,
        trace
      );
    }

    const nombrePropuesto = texto.trim().substring(0, 20);
    const val = validarUsername(nombrePropuesto);
    if (!val.valido) return enviar(tel, M.usernameInvalido(val.razon, val.sugerencia), trace);

    // v3.36 BUG FIX: verificar pendingFolio ANTES del register para evitar usuarios fantasma
    // Si no hay en memoria, intentar recuperar de BD una última vez
    let prefolioVerify = s.pendingFolio;
    if (!prefolioVerify) {
      const pendingRes = await sbRpc("get_pending_registration", { p_phone: tel }, trace);
      if (pendingRes?.found && pendingRes?.pending_folio) {
        prefolioVerify = pendingRes.pending_folio;
        setSesion(tel, { pendingFolio: prefolioVerify });
        log.info(trace, `pendingFolio recuperado de BD justo antes de register: ${prefolioVerify}`);
      }
    }
    if (!prefolioVerify) {
      log.warn(trace, `BUG GUARD: register intentado sin pendingFolio — usuario perdió el estado`);
      metrics.register_aborted_no_folio = (metrics.register_aborted_no_folio || 0) + 1;
      setSesion(tel, { fase: "esperando_folio", pendingFolio: null });
      return enviar(tel, `Hubo un problema al sincronizar tu sesión. Envíame tu folio de nuevo, por favor.`, trace);
    }

    log.info(trace, `→ register username="${nombrePropuesto}" phone=${tel}`);
    const regRes = await waAuth("register", { phone: tel, username: nombrePropuesto }, trace);

    if (regRes?.error === "username_taken") return enviar(tel, M.usernameTomado(generarSugerencia(nombrePropuesto)), trace);
    if (regRes?.error === "inappropriate_username") {
      metrics.username_rejected_profanity++;
      log.info(trace, `Username rechazado por profanity: "${nombrePropuesto}"`);
      return enviar(tel, M.usernameProfanity(generarSugerencia(nombrePropuesto)), trace);
    }
    if (regRes?.error === "unauthorized") {
      log.error(trace, "Edge Function rechaza auth — WA_BOT_SECRET no seteado");
      setSesion(tel, { fase: "esperando_folio", pendingFolio: null });
      return enviar(tel, M.errorEdgeFunction(), trace);
    }
    if (regRes?.error === "misconfigured" || regRes?.error === "edge_function_error") {
      setSesion(tel, { fase: "esperando_folio", pendingFolio: null });
      return enviar(tel, M.errorEdgeFunction(), trace);
    }
    if (!regRes?.success || !regRes.user_id) {
      log.error(trace, "register fallido:", JSON.stringify(regRes).substring(0, 200));
      setSesion(tel, { fase: "esperando_folio", pendingFolio: null });
      return enviar(tel, M.errorRegistro(), trace);
    }

    const finalUsername = regRes.username || nombrePropuesto;
    const newUserId     = regRes.user_id;
    const pendFolio     = s.pendingFolio;

    if (!pendFolio) {
      log.warn(trace, "Sin pendingFolio en esperando_username");
      setSesion(tel, { fase: "esperando_folio" });
      return enviar(tel, `Hubo un problema. Envíame tu folio de nuevo, por favor.`, trace);
    }

    const claimRes = await sbRpc("validate_and_claim_ticket", {
      p_code: pendFolio, p_user_id: newUserId,
    }, trace);

    if (!claimRes?.success) {
      metrics.claim_fail++;
      log.error(trace, "Claim fallido tras register:", JSON.stringify(claimRes));
      setSesion(tel, { fase: "activo", username: finalUsername, userId: newUserId, pendingFolio: null });
      sbRpc("clear_pending_registration", { p_phone: tel }, trace).catch(() => {});
      return enviar(tel, M.folioError(claimRes?.error || "already_used"), trace);
    }
    metrics.claim_ok++;

    let completedToday = 0;
    let totalCompleted = 0;
    const postProfile = await sbRpc("get_wa_profile", { p_phone: tel }, trace);
    if (postProfile?.found) {
      completedToday = (postProfile.wa_fecha_reset === hoy ? postProfile.wa_rondas_hoy : 0) || 0;
      totalCompleted = postProfile.wa_rondas_total || 0;
    }
    const rondaNum = completedToday + 1;

    setSesion(tel, {
      fase: "activo", username: finalUsername, userId: newUserId,
      rondasHoy: completedToday, rondasTotal: totalCompleted, fechaReset: hoy,
      pendingFolio: null, intentos: 0,
    });
    // v3.36: limpiar pending_registration en BD
    sbRpc("clear_pending_registration", { p_phone: tel }, trace).catch(() => {});

    const storeInfoFirst = getStoreFromFolio(pendFolio);

    bcSyncCanje(pendFolio, tel, finalUsername, storeInfoFirst, rondaNum, null).catch(() => {});

    bcSyncUsuario(tel, "activo", storeInfoFirst, {
      username: finalUsername,
      primerContacto: true,
    }).catch(() => {});

    setTimeout(async () => {
      const ip = await getUserLastIP(tel);
      if (ip) {
        bcSyncUsuario(tel, "activo", null, { ipUltimo: ip, primerContacto: false }).catch(() => {});
        log.info(trace, `IP capturada para ${tel}: ${ip}`);
      }
    }, 30000);

    if (!regRes.magic_link) {
      log.warn(trace, `Magic link no generado, fallback URL`);
      return enviar(tel, `Listo, *${finalUsername}*.\n\nVe a *${SITE_URL}* para entrar a jugar.\nRonda *${rondaNum}* de *${RONDAS_MAX}* hoy.`, trace);
    }
    log.info(trace, `Magic link generado: ${maskLink(regRes.magic_link)}`);
    return enviar(tel, M.registroCompleto(finalUsername, regRes.magic_link, rondaNum), trace);
  }

  const looksLikeFolio = /^\d{10,}$/.test(texto.replace(/\s/g, ""));
  if (intencion === "folio_input" || (s.fase === "esperando_folio" && looksLikeFolio)) {
    const num = texto.replace(/\s/g, "");
    const localVal = validarFormatoFolioLocal(num);
    if (!localVal.ok) {
      setSesion(tel, { intentos: (s.intentos || 0) + 1 });
      return enviar(tel, M.folioError(localVal.error), trace);
    }
    const folio = localVal.folio;
    const previewParams = userId ? { p_code: folio, p_user_id: userId } : { p_code: folio };
    const preview = await sbRpc("preview_ticket", previewParams, trace);

    if (preview === null) {
      log.warn(trace, "preview_ticket null — Supabase posiblemente saturado");
      return enviar(tel, M.servidorSaturado(), trace);
    }
    if (!preview?.success) {
      metrics.preview_ticket_fail++;
      setSesion(tel, { intentos: (s.intentos || 0) + 1 });
      return enviar(tel, M.folioError(preview?.error || "invalid_format"), trace);
    }
    metrics.preview_ticket_ok++;

    // v3.35 BUG2 FIX: si caché perdió username/userId, recuperar de BD antes de pedir apodo
    // Solo intentamos recover si el cache NO indica explícitamente que el usuario es nuevo
    let resolvedUsername = username;
    let resolvedUserId   = userId;
    let recoveredProfile = null;
    const cacheKnowsNotRegistered = s.cargado === true && s.registered === false;
    if ((!resolvedUsername || !resolvedUserId) && !cacheKnowsNotRegistered) {
      const recoverProfile = await sbRpc("get_wa_profile", { p_phone: tel }, trace);
      if (recoverProfile?.found && recoverProfile?.wa_registered) {
        resolvedUsername = recoverProfile.wa_username || null;
        resolvedUserId   = recoverProfile.user_id     || null;
        if (resolvedUsername && resolvedUserId) {
          recoveredProfile = recoverProfile;
          setSesion(tel, {
            fase:        "activo",
            username:    resolvedUsername,
            userId:      resolvedUserId,
            rondasHoy:   recoverProfile.wa_fecha_reset === hoy ? (recoverProfile.wa_rondas_hoy || 0) : 0,
            rondasTotal: recoverProfile.wa_rondas_total || 0,
            fechaReset:  recoverProfile.wa_fecha_reset || null,
          });
          log.info(trace, `BUG2-FIX: usuario registrado recuperado de BD: ${resolvedUsername}`);
          metrics.session_recovery_registered = (metrics.session_recovery_registered || 0) + 1;
        }
      }
    }

    if (resolvedUsername && resolvedUserId) {
      const username = resolvedUsername;
      const userId   = resolvedUserId;
      let localRondasTotal = s.rondasTotal || 0;
      // v3.35: si ya tenemos recoveredProfile, lo reutilizamos en lugar de hacer otra llamada
      const freshProfile = recoveredProfile || await sbRpc("get_wa_profile", { p_phone: tel }, trace);
      if (freshProfile?.found) {
        const dbRondasHoy = freshProfile.wa_fecha_reset === hoy
          ? (freshProfile.wa_rondas_hoy || 0)
          : 0;
        const dbRondasTotal = freshProfile.wa_rondas_total || 0;

        if (dbRondasHoy > rondasHoy || dbRondasTotal > localRondasTotal) {
          log.info(trace, `Sync: rondasHoy ${rondasHoy}→${dbRondasHoy}, rondasTotal ${localRondasTotal}→${dbRondasTotal}`);
          rondasHoy = Math.max(rondasHoy, dbRondasHoy);
          localRondasTotal = Math.max(localRondasTotal, dbRondasTotal);
          setSesion(tel, { rondasHoy, rondasTotal: localRondasTotal });
        }
      }

      if (rondasHoy >= RONDAS_MAX) return enviar(tel, M.maxRondas(username), trace);

      const claimRes = await sbRpc("validate_and_claim_ticket", {
        p_code: folio, p_user_id: userId,
      }, trace);

      if (!claimRes?.success) {
        metrics.claim_fail++;

        if (claimRes?.error === 'session_active') {
          log.info(trace, `session_active detectado — regenerando magic link`);
          const linkRes = await waAuth("get_link", { phone: tel }, trace);
          if (linkRes?.magic_link) {
            metrics.session_active_relinks++;
            log.info(trace, `Re-enviando magic link: ${maskLink(linkRes.magic_link)}`);
            return enviar(tel, M.reenvioLink(username, linkRes.magic_link), trace);
          }
          log.warn(trace, `session_active sin link — fallback a mensaje de texto`);
        }

        return enviar(tel, M.folioError(claimRes?.error || "already_used"), trace);
      }
      metrics.claim_ok++;

      let completedToday = rondasHoy;
      let totalCompleted = localRondasTotal;
      const postProfile = await sbRpc("get_wa_profile", { p_phone: tel }, trace);
      if (postProfile?.found) {
        completedToday = (postProfile.wa_fecha_reset === hoy ? postProfile.wa_rondas_hoy : 0) || 0;
        totalCompleted = postProfile.wa_rondas_total || 0;
      }
      const rondaParaMostrar = completedToday + 1;
      setSesion(tel, { rondasHoy: completedToday, rondasTotal: totalCompleted, intentos: 0 });

      const storeInfoReclaim = getStoreFromFolio(folio);
      bcSyncCanje(folio, tel, username, storeInfoReclaim, rondaParaMostrar, null).catch(() => {});

      const linkRes = await waAuth("get_link", { phone: tel }, trace);
      if (!linkRes?.magic_link) {
        return enviar(tel, `Folio registrado, *${username}*.\nVe a *${SITE_URL}* para jugar.\nRonda *${rondaParaMostrar}* de *${RONDAS_MAX}* hoy.`, trace);
      }
      log.info(trace, `Magic link generado: ${maskLink(linkRes.magic_link)}`);
      return enviar(tel, M.folioAdicional(username, rondaParaMostrar, linkRes.magic_link), trace);
    }

    const storeInfo = getStoreFromFolio(folio);
    setSesion(tel, { fase: "esperando_username", pendingFolio: folio, intentos: 0 });
    // v3.36: persistir pendingFolio en BD para que sobreviva cambio de réplica
    sbRpc("set_pending_registration", { p_phone: tel, p_folio: folio }, trace).catch(() => {
      metrics.pending_reg_persist_fail = (metrics.pending_reg_persist_fail || 0) + 1;
    });
    return enviar(tel, M.folioOkPideNombre(storeInfo?.name, storeInfo?.brand || "Grupo Nutrisa"), trace);
  }

  if (s.fase === "activo" && username) {
    return enviar(tel, `¿Tienes un folio nuevo, *${username}*? Envíalo, por favor.\n\nO escribe *AYUDA* si necesitas algo.`, trace);
  }
  if (s.fase === "esperando_folio") return enviar(tel, M.pedirFolio(), trace);

  setSesion(tel, { fase: "esperando_folio" });
  await enviarImagen(tel, IMG_FOLIO, "📋 Tu folio: 21 dígitos que empiezan con 84", trace);
  return enviar(tel, M.bienvenidaNuevo(), trace);
}

async function procesarMensaje(tel, texto, trace) {
  const prev = userLocks.get(tel);
  const prevPromise = prev?.promise || Promise.resolve();
  const next = prevPromise.then(() => procesarMensajeCore(tel, texto, trace).catch(e => {
    metrics.msg_errors++;
    recordError("core", e);
    log.error(trace, "procesarMensajeCore:", e);
  }));
  userLocks.set(tel, { promise: next, startedAt: Date.now() });
  await next;
  if (userLocks.get(tel)?.promise === next) userLocks.delete(tel);
  metrics.msg_processed++;
}

// ─── BROADCASTS ─────────────────────────────────────────────────────────────
async function procesarBroadcasts() {
  if (broadcastRunning) { metrics.broadcast_skipped++; return; }
  broadcastRunning = true;
  metrics.broadcast_runs++;
  try {
    const sources = [
      {
        listUrl: airtableUrl(AT_TABLES.BROADCASTS, {
          filterByFormula: `{${FB.EST}}="Listo para enviar"`,
          returnFieldsByFieldId: "true",
        }),
        msgField: FB.MSG,
        markEnviando: (id) => fetchTimeout(airtableUrl(`${AT_TABLES.BROADCASTS}/${id}`), {
          method: "PATCH",
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ fields: { [FB.EST]: "Enviando" } }),
        }),
        markDone: (id, ok, fail) => fetchTimeout(airtableUrl(`${AT_TABLES.BROADCASTS}/${id}`), {
          method: "PATCH",
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ fields: { [FB.EST]: "Enviado", [FB.ENV]: ok, [FB.FALL]: fail } }),
        }),
      },
      {
        listUrl: bcUrl(BC_BROADCASTS, {
          filterByFormula: `{${BCB.EST}}="Listo para enviar"`,
          returnFieldsByFieldId: "true",
        }),
        msgField: BCB.MSG,
        markEnviando: (id) => fetchTimeout(bcUrl(`${BC_BROADCASTS}/${id}`), {
          method: "PATCH",
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ fields: { [BCB.EST]: "Enviando" } }),
        }),
        markDone: (id, ok, fail) => fetchTimeout(bcUrl(`${BC_BROADCASTS}/${id}`), {
          method: "PATCH",
          headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
          body: JSON.stringify({ fields: { [BCB.EST]: "Enviado", [BCB.ENV]: ok, [BCB.FALL]: fail } }),
        }),
      },
    ];

    for (const src of sources) {
      try {
        const res = await fetchTimeout(src.listUrl, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
        if (!res.ok) { metrics.broadcast_fetch_errors++; continue; }
        const data = await res.json().catch(() => ({}));
        if (!data?.records?.length) continue;

        for (const bc of data.records) {
          const msg = bc.fields[src.msgField];
          if (!msg) continue;
          log.info(null, `📢 Broadcast: "${msg.substring(0, 40)}..."`);

          await src.markEnviando(bc.id);

          const jugadores = await sbRpcArray("wa_broadcast_recipients", {}, null);
          let ok = 0, fail = 0;
          if (Array.isArray(jugadores)) {
            for (const j of jugadores) {
              if (!j.wa_phone) continue;
              const sent = await enviar(j.wa_phone, msg, null);
              if (sent?.messages?.[0]?.id) ok++;
              else fail++;
            }
          }
          metrics.broadcast_sent += ok;
          metrics.broadcast_failed += fail;

          await src.markDone(bc.id, ok, fail);
          log.info(null, `✅ Broadcast: ${ok} ok, ${fail} fallidos`);
        }
      } catch(e) {
        log.warn(null, `Broadcast source error: ${e.message}`);
      }
    }
  } catch (e) {
    recordError("airtable:broadcast", e);
    log.error(null, "Broadcast error:", e.message);
  } finally {
    broadcastRunning = false;
  }
}

async function rescatarBroadcastsHuerfanos() {
  try {
    const url = airtableUrl(AT_TABLES.BROADCASTS, {
      filterByFormula: `{Estado}="Enviando"`,
      returnFieldsByFieldId: "true",
    });
    const res = await fetchTimeout(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    const data = await res.json().catch(() => ({}));
    if (!data?.records?.length) return;
    log.warn(null, `Encontré ${data.records.length} broadcasts huérfanos — reseteo`);
    for (const bc of data.records) {
      await fetchTimeout(airtableUrl(`${AT_TABLES.BROADCASTS}/${bc.id}`), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ fields: { [FB.EST]: "Listo para enviar" } }),
      });
    }
  } catch (e) { log.error(null, "rescatar:", e.message); }
}

// ─── CLEANUP ────────────────────────────────────────────────────────────────
function cleanupMaps() {
  const now = Date.now();
  let cs=0, cl=0, cd=0, co=0, ci=0, cip=0;
  for (const [tel, s] of sesiones.entries()) {
    if (s.lastSeen && now - s.lastSeen > SESSION_TTL_MS) { sesiones.delete(tel); cs++; }
  }
  for (const [tel, lock] of userLocks.entries()) {
    if (now - lock.startedAt > USERLOCK_MAX_AGE_MS) {
      userLocks.delete(tel); cl++; metrics.userlock_stale++;
    }
  }
  for (const [id, ts] of processedMsgs.entries()) {
    if (now - ts > DEDUP_TTL_MS) { processedMsgs.delete(id); cd++; }
  }
  for (const [tel, ts] of outboundLastSend.entries()) {
    if (now - ts > 10 * 60 * 1000) { outboundLastSend.delete(tel); co++; }
  }
  for (const [tel, entry] of inboundCounter.entries()) {
    if (now - entry.windowStart > 2 * 60 * 1000) { inboundCounter.delete(tel); ci++; }
  }
  for (const [ip, entry] of ipCounter.entries()) {
    if (now - entry.windowStart > 2 * 60 * 1000) { ipCounter.delete(ip); cip++; }
  }
  if (cs+cl+cd+co+ci+cip > 0) {
    log.info(null, `🧹 Cleanup: sesiones=${cs}, locks=${cl}, dedup=${cd}, out=${co}, in=${ci}, ip=${cip}`);
  }
}

// ─── WEBHOOK ────────────────────────────────────────────────────────────────
app.get("/webhook", (req, res) => {
  const { "hub.mode": m, "hub.verify_token": t, "hub.challenge": c } = req.query;
  if (m === "subscribe" && t === VERIFY_TOKEN) {
    log.info(null, "✅ Webhook verificado por Meta");
    res.status(200).send(c);
  } else {
    res.sendStatus(403);
  }
});

app.post("/webhook", async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'unknown';
  if (!checkIpRate(ip)) {
    metrics.webhook_ip_blocked++;
    log.warn(null, `🚫 IP rate limit: ${ip}`);
    return res.status(429).send('rate limited');
  }

  const sig = verifyMetaSignature(req);
  if (!sig.valid) {
    metrics.webhook_invalid_hmac++;
    log.warn(null, `🚫 HMAC invalid (${sig.reason}) from ${ip}`);
    return res.status(401).send('unauthorized');
  }

  res.sendStatus(200);
  metrics.webhook_total++;

  if (!req.body) {
    metrics.webhook_invalid_json++;
    return;
  }

  const entries = req.body.entry || [];
  for (const entry of entries) {
    const changes = entry?.changes || [];
    for (const change of changes) {
      const messages = change?.value?.messages || [];
      for (const msg of messages) {
        const trace = newTrace();
        const SILENT_TYPES = new Set(["reaction", "system", "ephemeral", "order"]);
        if (SILENT_TYPES.has(msg.type)) {
          metrics.webhook_silent_type++;
          log.info(trace, `🤐 [${msg.from}] ${msg.type} ignorado`);
          continue;
        }

        // v3.34: Dedupe distribuido (multi-réplica safe)
        // Capa 1: memoria local (fast path, ~0ms)
        if (msg.id && processedMsgs.has(msg.id)) {
          metrics.webhook_dedup_hit++;
          log.info(trace, `⏭️ Dup msg ${msg.id} (local cache)`);
          continue;
        }

        // Capa 2: BD (cross-replica, atómico via PK)
        if (msg.id) {
          try {
            const claimed = await sbRpc("claim_webhook_event", {
              p_message_id: msg.id,
              p_from_phone: msg.from || null,
              p_event_type: msg.type || 'unknown',
              p_payload: { text: msg.text?.body?.substring(0, 200) || null }
            }, trace);

            if (claimed && claimed.claimed === false) {
              metrics.webhook_dedup_hit++;
              metrics.webhook_dedup_distributed = (metrics.webhook_dedup_distributed || 0) + 1;
              log.info(trace, `⏭️ Dup msg ${msg.id} (distributed)`);
              continue;
            }
          } catch (e) {
            // v3.35 BUG3 FIX: si claim falla, reintentar una vez con delay antes de procesar
            // Esto reduce la ventana de race condition entre réplicas
            metrics.webhook_dedup_fail = (metrics.webhook_dedup_fail || 0) + 1;
            log.warn(trace, `claim_webhook_event fail (retrying): ${e.message}`);
            try {
              await new Promise(r => setTimeout(r, 200 + Math.random() * 150));
              const retry = await sbRpc("claim_webhook_event", {
                p_message_id: msg.id,
                p_from_phone: msg.from || null,
                p_event_type: msg.type || 'unknown',
                p_payload: { text: msg.text?.body?.substring(0, 200) || null }
              }, trace);
              if (retry && retry.claimed === false) {
                metrics.webhook_dedup_distributed = (metrics.webhook_dedup_distributed || 0) + 1;
                log.info(trace, `⏭️ Dup msg ${msg.id} (distributed retry)`);
                continue;
              }
            } catch (e2) {
              // Segundo fallo: descartar para evitar double-processing
              metrics.webhook_dedup_fail_skip = (metrics.webhook_dedup_fail_skip || 0) + 1;
              log.warn(trace, `claim_webhook_event fail x2 — descartando msg ${msg.id}: ${e2.message}`);
              continue;
            }
          }
        }
        addToProcessedMsgs(msg.id);

        if (msg.type !== "text") {
          metrics.webhook_non_text++;
          enviar(msg.from, M.noTexto(), trace).catch(() => {});
          continue;
        }

        const tel = String(msg.from || "").replace(/\D/g, "");
        if (!tel || tel.length < 10) {
          metrics.webhook_invalid_phone++;
          log.warn(trace, `Phone inválido tras normalización: "${msg.from}"`);
          continue;
        }
        if (!checkInboundRate(tel)) {
          log.warn(trace, `🚫 [${tel}] inbound rate limit`);
          continue;
        }

        metrics.webhook_text++;
        const texto = msg.text.body.trim();
        log.info(trace, `📩 [${tel}] "${texto.substring(0, 40)}" fase=${getSesion(tel).fase}`);

        procesarMensaje(tel, texto, trace).then(() => {
          // v3.36: marcar webhook como procesado para que cleanup_old_webhook_events funcione
          if (msg.id) {
            sbRpc("mark_webhook_processed", { p_message_id: msg.id, p_error_msg: null }, trace).catch(err => {
              metrics.mark_processed_fail = (metrics.mark_processed_fail || 0) + 1;
              log.warn(trace, `mark_webhook_processed fail: ${err.message}`);
            });
          }
        }).catch(e => {
          metrics.msg_errors++;
          recordError("procesarMensaje", e);
          log.error(trace, "procesarMensaje top:", e);
          // Marcar como procesado con error para no reintentar y no ensuciar la tabla
          if (msg.id) {
            sbRpc("mark_webhook_processed", { p_message_id: msg.id, p_error_msg: String(e.message || e).substring(0, 500) }, trace).catch(() => {});
          }
        });
      }
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════
// /game-complete
// ════════════════════════════════════════════════════════════════════════════
app.post("/game-complete", async (req, res) => {
  const trace = newTrace();
  metrics.game_complete_received++;

  const { phone, score, secret, ronda_num } = req.body || {};

  if (!secret || secret !== BOT_SECRET) {
    metrics.game_complete_unauth++;
    log.warn(trace, `game-complete: unauthorized from ${req.ip}`);
    return res.status(401).json({ error: "unauthorized" });
  }

  if (!phone || score == null) {
    log.warn(trace, `game-complete: missing fields`);
    return res.status(400).json({ error: "missing_fields" });
  }

  const tel = String(phone).replace(/\D/g, "");
  if (tel.length < 10) {
    log.warn(trace, `game-complete: phone inválido "${phone}"`);
    return res.status(400).json({ error: "invalid_phone" });
  }

  const scoreNum = parseInt(score, 10);
  if (isNaN(scoreNum) || scoreNum < 0) {
    log.warn(trace, `game-complete: score inválido "${score}"`);
    return res.status(400).json({ error: "invalid_score" });
  }

  res.json({ ok: true });

  (async () => {
    try {
      log.info(trace, `🎮 game-complete: tel=${tel} score=${scoreNum} ronda_num=${ronda_num || '?'}`);

      const profile = await sbRpc("get_wa_profile", { p_phone: tel }, trace);
      if (!profile?.found) {
        log.warn(trace, `game-complete: profile not found ${tel}`);
        metrics.game_complete_failed++;
        return;
      }

      const username      = profile.wa_username || profile.username || 'Fanático';
      const hoy           = hoyMexico();
      const rondasHoy     = profile.wa_fecha_reset === hoy ? (profile.wa_rondas_hoy || 0) : 0;
      const puntosTotal   = profile.wa_puntos_total || 0;

      setSesion(tel, {
        username,
        userId: profile.user_id,
        rondasHoy,
        rondasTotal: profile.wa_rondas_total || 0,
        fechaReset: hoy,
        fase: "activo",
      });

      let posicion = null;
      let totalJugadores = null;
      try {
        const stats = await sbRpc("get_user_stats_for_bot", { p_user_id: profile.user_id }, trace);
        if (stats?.found) {
          posicion = stats.posicion || null;
          totalJugadores = stats.total_jugadores || null;
        }
      } catch (e) {
        log.warn(trace, `game-complete: stats fetch failed (no crítico): ${e.message}`);
      }

      const msg = rondasHoy >= RONDAS_MAX
        ? M.rondaCompletadaMaxDia(username, scoreNum, puntosTotal, posicion, totalJugadores)
        : M.rondaCompletada(username, scoreNum, rondasHoy, puntosTotal, posicion, totalJugadores);

      await enviar(tel, msg, trace);
      log.info(trace, `🎉 game-complete WA sent: rondas=${rondasHoy}/${RONDAS_MAX}, score=${scoreNum}, total=${puntosTotal}`);
    } catch (e) {
      metrics.game_complete_failed++;
      recordError("game-complete:process", e);
      log.error(trace, `game-complete process error: ${e.message}`);
    }
  })();
});

// ════════════════════════════════════════════════════════════════════════════
// ENDPOINTS ADMIN
// ════════════════════════════════════════════════════════════════════════════

app.post("/send-direct", async (req, res) => {
  const trace = newTrace();
  metrics.admin_send_direct_received++;

  const { phone, message, secret } = req.body || {};

  if (!secret || secret !== BOT_SECRET) {
    metrics.admin_send_direct_unauth++;
    log.warn(trace, `send-direct: unauthorized from ${req.ip}`);
    return res.status(401).json({ error: "unauthorized" });
  }

  if (!phone || !message) {
    return res.status(400).json({ error: "missing_fields" });
  }

  const tel = String(phone).replace(/\D/g, "");
  if (tel.length < 10) {
    return res.status(400).json({ error: "invalid_phone" });
  }

  const msg = String(message).substring(0, 1500);
  res.json({ ok: true });

  (async () => {
    try {
      log.info(trace, `📩 admin send-direct: ${tel} ← "${msg.substring(0, 50)}..."`);
      await enviar(tel, msg, trace);
    } catch (e) {
      recordError("send-direct:process", e);
      log.error(trace, `send-direct error: ${e.message}`);
    }
  })();
});

app.post("/admin-broadcast-trigger", async (req, res) => {
  const trace = newTrace();
  const { secret } = req.body || {};

  if (!secret || secret !== BOT_SECRET) {
    log.warn(trace, `broadcast-trigger: unauthorized from ${req.ip}`);
    return res.status(401).json({ error: "unauthorized" });
  }

  metrics.admin_broadcast_triggered++;
  res.json({ ok: true });

  procesarBroadcasts().catch(e => {
    log.error(trace, `broadcast-trigger error: ${e.message}`);
  });
});

app.get("/admin-health-summary", async (req, res) => {
  const secret = req.query.secret || req.headers['x-bot-secret'];
  if (!secret || secret !== BOT_SECRET) {
    return res.status(401).json({ error: "unauthorized" });
  }

  res.json({
    version:           VERSION,
    uptime_sec:        Math.floor((Date.now() - bootTime) / 1000),
    hoy_mx:            hoyMexico(),
    sesiones_activas:  sesiones.size,
    stores_loaded:     storesCache.size,
    stores_ready:      storesCacheReady,
    webhook_total:     metrics.webhook_total,
    msg_processed:     metrics.msg_processed,
    claim_ok:          metrics.claim_ok,
    claim_fail:        metrics.claim_fail,
    send_ok:           metrics.send_ok,
    send_fail:         metrics.send_fail,
    soporte_tickets:   metrics.soporte_tickets_created,
    rpc_errors:        metrics.rpc_errors,
    circuit_open:      atCircuitOpen,
    limiter_running:   SB_LIMITER.running,
    limiter_queue:     SB_LIMITER.queue.length,
    last_error:        metrics.last_error,
    last_error_at:     metrics.last_error_at,
  });
});

// ─── ENDPOINTS DE MONITORING ────────────────────────────────────────────────
app.get("/", (_req, res) => res.json({
  status:       "ok",
  version:      VERSION,
  uptime_sec:   Math.floor((Date.now() - bootTime) / 1000),
  hoy_mx:       hoyMexico(),
  sesiones:     sesiones.size,
  stores_ready: storesCacheReady,
}));

app.get("/health", async (_req, res) => {
  const checks = {};
  let allOk = true;

  checks.stores_cache = storesCacheReady
    ? { status: "ok", count: storesCache.size }
    : { status: "warming", count: 0 };
  if (!storesCacheReady) allOk = false;

  const t0 = Date.now();
  const today = await sbRpc("today_mx", {});
  checks.supabase_rpc = today
    ? { status: "ok", today, latency_ms: Date.now() - t0 }
    : { status: "down" };
  if (!today) allOk = false;

  const t1 = Date.now();
  const recipients = await sbRpcArray("wa_broadcast_recipients", {});
  checks.supabase_broadcast_rpc = Array.isArray(recipients)
    ? { status: "ok", count: recipients.length, latency_ms: Date.now() - t1 }
    : { status: "down" };
  if (!Array.isArray(recipients)) allOk = false;

  const t2 = Date.now();
  const profCheck = await sbRpc("is_profane", { p_input: "chingar" });
  checks.supabase_profanity = (profCheck === true)
    ? { status: "ok", latency_ms: Date.now() - t2 }
    : { status: profCheck === null ? "down" : "wrong_result" };
  if (profCheck !== true) allOk = false;

  const t3 = Date.now();
  const efPing = await waAuth("ping", {});
  checks.edge_function = efPing
    ? { status: efPing.error === "unauthorized" ? "auth_broken"
              : efPing.error === "misconfigured" ? "env_missing"
              : "ok",
        latency_ms: Date.now() - t3 }
    : { status: "down" };
  if (!efPing || ["auth_broken","env_missing","down"].includes(checks.edge_function.status)) allOk = false;

  if (AIRTABLE_TOKEN) {
    const t4 = Date.now();
    try {
      const url = airtableUrl(AT_TABLES.BROADCASTS, { maxRecords: 1 });
      const r = await fetchTimeout(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
      checks.airtable = r.ok
        ? { status: "ok", latency_ms: Date.now() - t4 }
        : { status: "error", code: r.status };
      if (!r.ok) allOk = false;
    } catch (e) {
      checks.airtable = { status: "down", error: e.message };
      allOk = false;
    }
  } else {
    checks.airtable = { status: "no_token" };
  }

  const limiterUsage = (SB_LIMITER.running / SB_LIMITER.maxConcurrent * 100).toFixed(0);
  const queueUsage = (SB_LIMITER.queue.length / SB_LIMITER.maxQueue * 100).toFixed(0);
  checks.supabase_limiter = {
    status: SB_LIMITER.queue.length > 800 ? "near_saturation"
          : SB_LIMITER.running >= SB_LIMITER.maxConcurrent ? "all_busy"
          : "ok",
    running_pct: limiterUsage,
    queue_pct: queueUsage,
  };

  checks.memory = {
    sesiones: sesiones.size,
    userlocks: userLocks.size,
    dedup: processedMsgs.size,
    rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  };

  checks.airtable_circuit = atCircuitOpen
    ? { status: "open", since: atCircuitOpenedAt }
    : { status: "closed" };
  if (atCircuitOpen) allOk = false;

  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ok" : "degraded",
    version: VERSION,
    uptime_sec: Math.floor((Date.now() - bootTime) / 1000),
    hoy_mx: today,
    checks,
  });
});

app.get("/ready", (_req, res) => {
  res.status(storesCacheReady ? 200 : 503).send(storesCacheReady ? "OK" : "warming up");
});

app.get("/metrics", (req, res) => {
  if (METRICS_SECRET) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${METRICS_SECRET}`) {
      return res.status(401).send('unauthorized');
    }
  }
  metrics.at_queue_size = Object.values(atQueue).reduce((sum, q) => sum + q.length, 0);
  res.json({
    ...metrics,
    uptime_sec:        Math.floor((Date.now() - bootTime) / 1000),
    sesiones:          sesiones.size,
    stores:            storesCache.size,
    userlocks:         userLocks.size,
    processed_msgs:    processedMsgs.size,
    outbound_throttle: outboundLastSend.size,
    inbound_counter:   inboundCounter.size,
    ip_counter:        ipCounter.size,
    hmac_active:       !!META_APP_SECRET,
    metrics_protected: !!METRICS_SECRET,
    at_circuit_open:   atCircuitOpen,
    hoy_mx:            hoyMexico(),
  });
});

// ─── STARTUP ────────────────────────────────────────────────────────────────
function validarEnvVars() {
  const checks = {
    WHATSAPP_TOKEN:       typeof WHATSAPP_TOKEN === 'string' && WHATSAPP_TOKEN.length > 50,
    PHONE_NUMBER_ID:      typeof PHONE_NUMBER_ID === 'string' && PHONE_NUMBER_ID.length >= 10,
    AIRTABLE_TOKEN:       typeof AIRTABLE_TOKEN === 'string' && AIRTABLE_TOKEN.length > 20,
    SUPABASE_URL:         typeof SUPABASE_URL === 'string' && SUPABASE_URL.startsWith('https://'),
    SUPABASE_ANON_KEY:    typeof SUPABASE_ANON === 'string' && SUPABASE_ANON.length > 50,
    SUPABASE_BOT_SECRET:  isValidSecret(BOT_SECRET),
  };
  const fails = Object.entries(checks).filter(([_, ok]) => !ok).map(([k]) => k);
  if (fails.length > 0) {
    log.error(null, `⚠️ ENV VARS INVÁLIDAS: ${fails.join(", ")}`);
    return false;
  }
  log.info(null, `✅ Env vars OK`);
  if (!META_APP_SECRET) {
    log.warn(null, `⚠️ META_APP_SECRET no set — webhooks SIN validación HMAC`);
  } else {
    log.info(null, `🔐 META_APP_SECRET activo — webhooks validados con HMAC`);
  }
  if (!METRICS_SECRET) {
    log.warn(null, `⚠️ METRICS_SECRET no set — /metrics es público`);
  } else {
    log.info(null, `🔐 METRICS_SECRET activo — /metrics requiere bearer`);
  }
  if (!BC_SOPORTE) {
    log.warn(null, `⚠️ BC_SOPORTE_TABLE_ID no set — comando SOPORTE funcionará pero no sincronizará a Airtable`);
  } else {
    log.info(null, `🆘 BC_SOPORTE activo: ${BC_SOPORTE}`);
  }
  return true;
}

async function selfCheck() {
  log.info(null, "🔍 Self-check…");
  const checks = { supabase_rpc: false, edge_function: false, airtable: false };
  const sb = await sbRpc("today_mx", {});
  checks.supabase_rpc = sb !== null;
  try {
    const r = await fetchTimeout(`${SUPABASE_URL}/functions/v1/wa-auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SUPABASE_ANON },
      body: JSON.stringify({ action: "noop" }),
    }, 5000);
    checks.edge_function = r.status === 401 || r.status === 400;
  } catch { checks.edge_function = false; }
  try {
    const url = airtableUrl(AT_TABLES.BROADCASTS, { maxRecords: "1" });
    const r = await fetchTimeout(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } }, 5000);
    checks.airtable = r.ok;
  } catch { checks.airtable = false; }
  for (const [name, ok] of Object.entries(checks)) log.info(null, `  ${ok ? "✅" : "❌"} ${name}`);
  if (!Object.values(checks).every(Boolean)) log.warn(null, "⚠️ Sistemas degradados");
  return checks;
}

const PORT = process.env.PORT || 3000;

async function start() {
  log.info(null, `🚀 Gol v${VERSION} inicializando...`);
  log.info(null, `📡 Supabase: ${SUPABASE_URL}`);
  log.info(null, `🌐 Site: ${SITE_URL}`);
  log.info(null, `🕐 Hoy MX: ${hoyMexico()} | UTC: ${new Date().toISOString()}`);
  log.info(null, `🔧 Flags AT: LOGS=${AT_SYNC_LOGS} FOLIOS=${AT_SYNC_FOLIOS} JUGADORES=${AT_SYNC_JUGADORES} RONDAS=${AT_SYNC_RONDAS} ALERTAS=${AT_SYNC_ALERTAS}`);

  validarEnvVars();
  await selfCheck();
  await refreshStoresCache();
  await rescatarBroadcastsHuerfanos();

  const server = app.listen(PORT, () => log.info(null, `✅ Listening en puerto ${PORT}`));
  server.on('error', (err) => {
    log.error(null, "Server listen error:", err.message);
    process.exit(1);
  });

  setInterval(refreshStoresCache, 60 * 60 * 1000);
  setInterval(procesarBroadcasts, 30 * 1000);
  setInterval(cleanupMaps,        CLEANUP_INTERVAL_MS);
  setInterval(atFlush,            AT_QUEUE_FLUSH_MS);

  setInterval(async () => {
    try {
      const res = await sbRpc("bot_cleanup_sessions", {}, null);
      if (res?.released > 0) {
        log.info(null, `🧹 Cleanup liberó ${res.released} sesiones atoradas`);
      }
    } catch (e) {
      log.warn(null, `cleanup_stuck_sessions err: ${e.message}`);
    }
  }, 5 * 60 * 1000);

  let lastSnapshotDate = null;
  setInterval(() => {
    const now = new Date();
    const mxNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
    const hh = mxNow.getHours();
    const today = mxNow.toISOString().substring(0, 10);
    if (hh === 20 && lastSnapshotDate !== today) {
      lastSnapshotDate = today;
      log.info(null, `📊 Triggering daily leaderboard snapshot for ${today}`);
      runLeaderboardSnapshot().catch(e => log.error(null, "Leaderboard snapshot ERR:", e.message));
    }
  }, 5 * 60 * 1000);

  procesarBroadcasts().catch(() => {});
}

start().catch(e => {
  log.error(null, "Fatal startup error:", e);
  process.exit(1);
});
