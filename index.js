// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  GOL NUTRIZA — BOT v3.28 — PRODUCCIÓN                                        ║
// ║  Fanáticos del Sabor · Grupo Nutriza · WhatsApp-native                       ║
// ║                                                                              ║
// ║  v3.28: Copy refinement basado en feedback del stress test                   ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
//
// ─── NUEVO EN v3.28 (18 may 2026 PM2) ───────────────────────────────────────
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
// • Profanity filter mejorado:
//     - Bloquea personajes públicos (políticos, narcos, celebridades)
//     - Bloquea albures MX (BenitoCamelo, RosaCagalindo, etc.)
//     - Reduce false positives (KillerJack95 ya pasa)
// • Mensajes más cortos: regla "1 mensaje = 1 acción clara"
// • Tono unificado: mexa casual, "Gol" como personaje del bot
// • rondaCompletada ahora incluye posición en leaderboard
// • Bienvenidas: 4 → 2 variantes (nuevo / conocido con sub-estados)
// • Mensajes con menos tips innecesarios al final
// • Folio expirado: "tu ticket duró 2 días" (era "mándame en 2 días")
// • SITIO eliminado (ya no necesario tras fix de frontend)
//
// ─── HEREDADO DE v3.26 (17 may 2026 PM) ────────────────────────────────────
// Mientras se arreglan los bugs del sitio web (Mohammad), el bot ahora:
// • Mensaje del magic link incluye tips para los bugs visuales del sitio
// • Mensaje post-canje avisa que el puntaje aparece en 2-3 min
// • Comando PUNTOS dispara auto_sync_all_orphans (fuerza el ranking)
// • Si el usuario reporta error, sugerencias específicas y SOPORTE
//
// ─── HEREDADO DE v3.25 (17 may 2026) ────────────────────────────────────────
// UX REWRITE: cada mensaje rediseñado con personalidad mexicana, ejemplos
//   concretos, footers de discoverability, y micro-celebraciones. 22 mensajes
//   refinados. Footer rotativo invita a descubrir comandos (PREMIOS, PUNTOS,
//   AYUDA, FOLIO, SOPORTE).
// COMANDO SOPORTE: escape hatch humano. User escribe SOPORTE → bot pide
//   contexto → registra en Airtable Soporte → Jonny responde desde admin.
// PUNTAJE ACUMULADO: rondaCompletada ahora muestra puntos totales además
//   del puntaje de la ronda actual. Sense of progression.
// DETECCIÓN DE RE-ENGAGEMENT: si user no juega 3+ días, mensaje especial.
// ENDPOINTS ADMIN para Airtable:
//   POST /send-direct  → Jonny manda mensaje custom a un usuario
//   POST /admin-broadcast-trigger → fuerza procesamiento de cola broadcasts
//   GET  /admin-health-summary → datos compactos para dashboard de Jonny
//
// ─── HEREDADO DE v3.24 ──────────────────────────────────────────────────────
// FIX #1: session_active → regenera y reenvía magic link
// FIX #2: endpoint POST /game-complete cierra el loop WhatsApp ↔ Web
// FIX #3: copy "rondas completadas" (no "jugadas")
//
// ─── HEREDADO DE v3.23 ──────────────────────────────────────────────────────
// preview_ticket restaurado, 11 RPCs con GRANT a anon,
// bot_cleanup_sessions wrapper, get_wa_profile mejorado,
// wa_broadcast_recipients filtra ARCHIVADO, CHECK constraint wa_phase
//
// ─── HEREDADO DE v3.22 ──────────────────────────────────────────────────────
// Consolidación a Bot Control (apprLebqIDBaogjDJ). Engine v2 deprecado.
//
// ─── HEREDADO DE v3.21 ──────────────────────────────────────────────────────
// Profanidad unificada via is_profane RPC.
// wa_rondas_hoy se incrementa al COMPLETAR 4 minijuegos (no al canjear).
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
const VERSION         = "3.28";
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
// v3.25: NUEVA tabla Soporte — Jonny debe crearla en Airtable con estos field IDs
// (o ajustarlos aquí si Airtable asigna otros). Si la tabla NO existe, el bot
// silenciosamente no hace sync de soporte pero el flujo funciona igual.
const BC_SOPORTE     = process.env.BC_SOPORTE_TABLE_ID || ""; // setear cuando Jonny cree la tabla

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
// v3.25: Field IDs para Soporte. Si Jonny no los conoce aún, el bot usa
// nombres legibles (field names) como fallback — Airtable acepta ambos.
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
const DIAS_VALIDEZ         = 2;
const SITE_URL             = "https://fanaticosdelsabor.com";
const IMG_FOLIO            = "https://i.ibb.co/TDP6mnRz/Folio.jpg";
const CAMPAIGN_END_DATE    = "9 julio";  // v3.25: visible en varios mensajes
const DIAS_RE_ENGAGEMENT   = 3;          // v3.25: días sin jugar → mensaje especial

const FETCH_TIMEOUT_MS     = 8000;
const EDGE_FUNC_TIMEOUT_MS = 12000;

const SESSION_TTL_MS       = 24 * 60 * 60 * 1000;
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

// v3.25: máximo de caracteres para mensaje de soporte
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
const setSesion = (tel, data) => sesiones.set(tel, { ...getSesion(tel), ...data, lastSeen: Date.now() });

// ─── MÉTRICAS ───────────────────────────────────────────────────────────────
const metrics = {
  startup_at:           new Date().toISOString(),
  webhook_total:        0,
  webhook_dedup_hit:    0,
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
  // v3.25: métricas UX nuevas
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
  // v3.25: admin endpoints
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

// v3.25: formateo de números con coma (1240 → "1,240")
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
  const match = (texto || '').match(/\d{21,22}/);
  if (match) {
    const f = match[0];
    if (!f.startsWith("84")) {
      const prefix = f.substring(0, 2);
      metrics[`folio_wrong_prefix_${prefix}`] = (metrics[`folio_wrong_prefix_${prefix}`] || 0) + 1;
      return { ok: false, error: "prefijo" };
    }
    return { ok: true, folio: f.length === 22 ? f.substring(0, 21) : f };
  }
  const onlyDigits = (texto || '').replace(/[^0-9]/g, "");
  if (/^\d{21,22}$/.test(onlyDigits)) {
    if (!onlyDigits.startsWith("84")) {
      const prefix = onlyDigits.substring(0, 2);
      metrics[`folio_wrong_prefix_${prefix}`] = (metrics[`folio_wrong_prefix_${prefix}`] || 0) + 1;
      return { ok: false, error: "prefijo" };
    }
    return { ok: true, folio: onlyDigits.length === 22 ? onlyDigits.substring(0, 21) : onlyDigits };
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

// v3.25: registrar ticket de soporte en Airtable Bot Control tabla Soporte
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
// v3.25 — MENSAJES AL USUARIO (UX rewrite completo)
// ════════════════════════════════════════════════════════════════════════════
// Filosofía:
//   • Personalidad mexicana de Gol (directo, divertido, sin ser zalamero)
//   • Discoverability: footers que invitan a descubrir comandos
//   • Ejemplos concretos en vez de instrucciones abstractas
//   • Acumulado de puntos para sense of progression
//   • Escape hatch a SOPORTE cuando algo falla
// ════════════════════════════════════════════════════════════════════════════

const M = {
  // ─── BIENVENIDA NUEVA ────────────────────────────────────────────────────
  bienvenidaNuevo: () =>
`¡Hola! ⚽ Soy *Gol*, tu guía oficial en *Fanáticos del Sabor*.

Para registrarte y empezar a jugar necesito el folio de tu ticket 🎫

📍 *Dónde encontrarlo:*
↳ Está en la parte de arriba del ticket
↳ Empieza con *84* y tiene *21 dígitos*
↳ Cópialo directo del ticket (no me mandes la foto, solo los números)

⏱️ *Importante:* tu ticket debe ser de los últimos *${DIAS_VALIDEZ} días*.

¡Mándamelo cuando lo tengas!`,

  // ─── BIENVENIDA CONOCIDO (3 variantes) ───────────────────────────────────
  bienvenidaConocido: (username, rondasHoy) => {
    if (rondasHoy >= RONDAS_MAX) {
      return `¡Qué onda *${username}*! 🏆

Ya jugaste tus *${RONDAS_MAX} rondas* de hoy. Se reinician mañana a *medianoche CDMX*.

Mira tu posición → *PUNTOS*`;
    }
    if (rondasHoy === 0) {
      return `¡Qué onda *${username}*! 👋

Tienes *${RONDAS_MAX} rondas* disponibles hoy.

🎫 Manda un folio para empezar, o escribe *PUNTOS* para ver tu posición.`;
    }
    return `¡Qué onda *${username}*! 👋

Vas en *${rondasHoy}/${RONDAS_MAX}* rondas hoy. Te quedan *${RONDAS_MAX - rondasHoy}*.

🎫 Manda tu siguiente folio, o escribe *PUNTOS* para ver tu posición.`;
  },

  // v3.25: re-engagement (3+ días sin jugar)
  bienvenidaReEngagement: (username) =>
`*${username}*, te extrañábamos 👀

La campaña sigue y hay *81 premios* en juego. Termina el *${CAMPAIGN_END_DATE}*.

🎫 Manda un folio para jugar, o escribe *PUNTOS* para ver tu posición.`,

  // v3.25: bienvenida nuevo día (rondas se acaban de resetear)
  bienvenidaNuevoDia: (username) =>
`☀️ ¡Hola, *${username}*!

Tienes *${RONDAS_MAX} rondas nuevas* para hoy. Manda un folio cuando estés listo.`,

  // ─── ATAJO DESDE WEB ─────────────────────────────────────────────────────
  atajoConocido: (username, rondasHoy) =>
`Mándame el folio, *${username}* 🎫

${rondasHoy < RONDAS_MAX
  ? `Llevas *${rondasHoy}/${RONDAS_MAX}* rondas hoy. Te quedan *${RONDAS_MAX - rondasHoy}*.`
  : `Ya jugaste tus *${RONDAS_MAX} rondas* de hoy 🏆\nMañana a *medianoche CDMX* se reinician.`}`,

  // ─── FOLIO VÁLIDO — PIDE APODO ───────────────────────────────────────────
  folioOkPideNombre: (storeName, brand) => {
    const tienda = storeName ? `*${brand}* — ${storeName}` : "*Grupo Nutriza*";
    return `✅ Folio válido — compra en ${tienda} 🥑

🎯 *Último paso:* elige tu *apodo* para el ranking.

Reglas: 3-20 caracteres, sin espacios, sin acentos. Solo letras, números y _.

Ejemplos: *Goleador26*, *NutriFan*, *MoyoQueen*, *ChilimRey*

💡 Ese apodo te identifica toda la campaña. Elige bueno.`;
  },

  // ─── USERNAME RECHAZADO — FORMATO ────────────────────────────────────────
  usernameInvalido: (razon, sugerencia) =>
`Ese apodo no funciona 😅
*${razon}*

${sugerencia ? `¿Qué tal *${sugerencia}*? O escribe otro tú.` : "Escribe otro nombre."}

💡 Si quieres empezar de cero, escribe *reiniciar*.`,

  // ─── USERNAME RECHAZADO — PROFANITY (caso Sheila) ────────────────────────
  usernameProfanity: (sugerencia) =>
`Ese apodo no funciona 😅
*Nuestro filtro lo marcó por error o por tener una palabra restringida.*

${sugerencia ? `¿Qué tal *${sugerencia}*? O escribe otro.` : "Prueba con otro apodo."}

💡 Si crees que es un error, escribe *SOPORTE* y dime tu nombre real para revisarlo.`,

  // ─── USERNAME YA TOMADO ──────────────────────────────────────────────────
  usernameTomado: (sugerencia) =>
`Ese apodo ya tiene dueño 😅

Cada apodo es único — primer fanático que lo elige se lo queda.

¿Qué tal *${sugerencia}*? O inventa uno propio.

🎯 Tip: agregar números o tu marca favorita ayuda — *NutriQueen*, *MoyoKing*, *ChilimChef*`,

  // ─── REGISTRO COMPLETO (PRIMERA RONDA) ───────────────────────────────────
  registroCompleto: (username, magicLink, rondasHoy) =>
`¡Listo, *${username}*! 🎉 Ya eres oficial *Fanático del Sabor*.

🎮 *Toca aquí para jugar:*
${magicLink}

⏱️ El link es solo tuyo. Expira en *1 hora* y funciona *una sola vez*.

Vas en la ronda *${rondasHoy}/${RONDAS_MAX}* de hoy.`,

  // ─── FOLIO ADICIONAL (RONDAS 2+) ─────────────────────────────────────────
  folioAdicional: (username, rondaNum, magicLink) =>
`✅ ¡Otra ronda, *${username}*!

🎮 *Ronda ${rondaNum}/${RONDAS_MAX}* — toca aquí:
${magicLink}

${rondaNum < RONDAS_MAX
  ? `Te quedan *${RONDAS_MAX - rondaNum} rondas* hoy. ¡A subir en el ranking!`
  : `🔥 Última ronda de hoy. Mañana a medianoche se reinician.`}`,

  // ─── RE-ENVÍO DE MAGIC LINK (FIX v3.24 #1) ───────────────────────────────
  reenvioLink: (username, magicLink) =>
`Aún no terminaste tu ronda actual, *${username || "Fanático"}* 🎮

Te reenvío el link para que termines los 4 minijuegos:
${magicLink}

✅ Cuando completes esa ronda, mándame el folio nuevo y lo registro.

⏱️ Tienes hasta *15 minutos* para terminar antes de que el folio se libere automático.
🔄 Si recibiste varios links, *usa el más reciente* — los anteriores ya no funcionan.`,

  // ─── RONDA COMPLETADA (FIX v3.24 #2, con acumulado en v3.25, con posición en v3.27) ─────────────
  rondaCompletada: (username, score, rondasHoy, puntosTotal, posicion, totalJugadores) => {
    let posLine = "";
    if (posicion && totalJugadores) {
      posLine = `\n🏆 Vas en el lugar *#${posicion}* de ${fmt(totalJugadores)}`;
    }
    return `🎉 *¡Cerraste la ronda, ${username}!*

⚽ Esta partida: *${fmt(score)} pts*
🔥 Total acumulado: *${fmt(puntosTotal)} pts*${posLine}

Te quedan *${RONDAS_MAX - rondasHoy} rondas* hoy — manda otro folio para subir más.`;
  },

  rondaCompletadaMaxDia: (username, score, puntosTotal, posicion, totalJugadores) => {
    let posLine = "";
    if (posicion && totalJugadores) {
      posLine = `\n🏆 Vas en el lugar *#${posicion}* de ${fmt(totalJugadores)}`;
    }
    return `🏆 *¡Todas tus rondas, ${username}!*

⚽ Última ronda: *${fmt(score)} pts*
🔥 Total del día: *${fmt(puntosTotal)} pts*${posLine}

Mañana a *medianoche CDMX* se reinician las rondas.

💡 Comparte con tus amigos para que jueguen — pero *no compartas tus folios* (cada uno es único).`;
  },

  // ─── MAX RONDAS (si manda folio nuevo después de 5) ──────────────────────
  maxRondas: (username) =>
`Ya jugaste tus *${RONDAS_MAX} rondas* de hoy, *${username}* 🏆

Guarda ese folio — sigue válido por *${DIAS_VALIDEZ} días*. Mañana lo canjeas.

🌅 Las rondas se reinician a *medianoche CDMX*.

📊 Mira tu posición → *PUNTOS*`,

  // ─── ERRORES DE FOLIO ────────────────────────────────────────────────────
  folioError: (error) => {
    const msgs = {
      formato:
`🤔 No vi un folio válido en tu mensaje.

Lo que busco:
↳ *21 dígitos* exactos
↳ Empieza con *84*
↳ Solo los números (sin foto, sin texto extra)

¿No sabes dónde está? Escribe *FOLIO* y te muestro 📋

💡 Si estabas escribiendo otra cosa, escribe *AYUDA* para ver opciones.`,

      prefijo:
`Tu folio debe empezar con *84* 📋

Si empieza con otro número, no es de las marcas participantes.

Si lo copiaste mal, revisa el ticket e inténtalo de nuevo.

💡 Las marcas son: Nutrisa, Moyo, Cielito Café, Chilim Balam. Escribe *TIENDAS* para más info.`,

      invalid_format:
`El folio no tiene formato correcto.

Debe ser *21 dígitos* exactos, empezando con *84*.

Si copiaste el ticket entero, mándame *solo* los dígitos.

💡 Escribe *FOLIO* si necesitas ayuda para ubicarlo en tu ticket.`,

      invalid_empresa:
`Ese folio no es de una marca participante.

Solo aceptamos folios de: *Nutrisa*, *Moyo*, *Cielito Café*, *Chilim Balam*.

💡 Escribe *TIENDAS* para más detalle.`,

      invalid_date:
`La fecha en ese folio no es válida 🤔

Revisa que copiaste todos los dígitos correctamente.

💡 Si crees que tu ticket está dañado, escribe *SOPORTE*.`,

      unknown_store:
`Esa tienda no aparece en mi lista de participantes 🧐

¿Es un ticket de Nutrisa, Moyo, Cielito Café o Chilim Balam?
Si sí: el ticket podría estar dañado, intenta con otro.

💡 ¿Crees que es un error nuestro? Escribe *SOPORTE*.`,

      expired:
`😕 Ese ticket ya tiene más de *${DIAS_VALIDEZ} días*.

Los tickets duran *${DIAS_VALIDEZ} días* desde la compra. Después no se pueden canjear.

🎫 ¿Tienes uno más reciente? Mándame ese.

💡 *Pro tip:* manda tu folio el mismo día de la compra. Así nunca se vence.`,

      not_yet_valid:
`La fecha del ticket todavía no llega 🤔

Revisa la fecha en tu ticket — debe ser de *hoy o ayer*.

💡 Si la fecha está bien y aun así da error, escribe *SOPORTE*.`,

      date_too_early:
`Ese ticket es anterior al inicio de la campaña 📅

*Fanáticos del Sabor* arrancó hace poco. Solo cuentan tickets desde entonces.

🎫 ¿Tienes uno más reciente? Mándame ese.`,

      campaign_ended:
`Ya terminó *Fanáticos del Sabor* 🏁

La campaña concluyó. ¡Gracias por jugar! ⚽
Mira los ganadores en ${SITE_URL}.`,

      folio_too_low:
`Ese folio es de antes del inicio de la campaña 📋

Solo se aceptan compras hechas durante *Fanáticos del Sabor*.

🎫 ¿Tienes uno más reciente? Mándame ese.`,

      already_used:
`🔒 Ese folio ya fue canjeado.

Cada folio se usa una sola vez, por una sola persona.

⚠️ Si lo compartiste con alguien:
↳ Esa persona pudo haberlo usado antes que tú
↳ Avísanos por *SOPORTE* si crees que fue robo

💡 *Tu folio = tu llave personal.* Nunca lo compartas.

🎫 ¿Tienes otro ticket? Mándame ese.`,

      ticket_limit_reached:
`Ya jugaste tus *${RONDAS_MAX} rondas* de hoy 🏆
Cada persona tiene *${RONDAS_MAX} rondas diarias*.

🌅 Se reinician a *medianoche (hora CDMX)*.
La hora de tu celular no importa — siempre es hora México.

💡 Guarda tu folio: sigue siendo válido por ${DIAS_VALIDEZ} días.`,

      // Fallback si get_link falla en handler v3.24 #1
      session_active:
`Aún no terminaste tu ronda actual 🎮

👉 Entra a *${SITE_URL}* con el link que te mandé y *termina los 4 minijuegos*.

Cuando completes esa ronda, podrás canjear otro folio.

(Si no completas en 15 minutos, el folio se libera automático.)

💡 ¿Perdiste el link? Mándame de nuevo el folio que ya canjeaste para reenviártelo.`,
    };
    return msgs[error] || `No pude validar ese folio. ¿Revisas que esté completo y mándamelo de nuevo?

💡 Si crees que algo no está bien, escribe *SOPORTE*.`;
  },

  // ─── ERRORES TÉCNICOS ────────────────────────────────────────────────────
  errorRegistro: () =>
`Tuve un problema técnico al registrarte 😞
*No es culpa tuya.* Intenta de nuevo en 1-2 minutos.

Si el problema persiste, escribe *SOPORTE*.`,

  errorEdgeFunction: () =>
`Estamos teniendo un problema temporal 🙏
Inténtalo en 1-2 minutos.

Si sigue fallando, escribe *SOPORTE*.`,

  servidorSaturado: () =>
`Mucha gente está jugando ahora mismo 🔥
Inténtalo en *30 segundos*. Tu folio no se ha perdido.

(No me lo reenvíes, solo espera. Yo te respondo cuando se libere.)`,

  // ─── AYUDA / COMANDOS ────────────────────────────────────────────────────
  ayuda: (u) =>
`👋 Soy *Gol*${u ? `, tu apodo es *${u}*` : ""}.

Esto es lo que sé hacer:

🎫 *Manda un folio* → Jugar una ronda
📊 *PUNTOS* → Tu puntaje y posición
🔗 *MI LINK* → Reenvío tu último link
🎮 *OTRA RONDA* → Pedir otro folio
🏆 *PREMIOS* → Lo que puedes ganar
🏪 *TIENDAS* → Marcas participantes
📋 *REGLAS* → Cómo funciona
🔍 *FOLIO* → Dónde está en el ticket
🔄 *REINICIAR* → Empezar de cero

⚠️ *No leo:* fotos, audios, videos, ni stickers.

🆘 *SOPORTE* → Hablar con un humano de Grupo Nutriza.`,

  // ─── PUNTOS (v3.27: muestra puntaje + posición DIRECTO en WA) ────────────
  puntos: (username, stats) => {
    // Si no jugó nada todavía
    if (!stats || stats.puntos_total === 0 || !stats.posicion) {
      return `📊 Aún no tienes puntaje, *${username}*.

🎫 Manda un folio para jugar tu primera ronda y aparecer en el ranking.

💡 Cada folio = 1 ronda de 4 minijuegos.`;
    }

    const top3 = (stats.top_3 || []).slice(0, 3);
    const top3Lines = top3.map((u, i) => {
      const medal = ["🥇", "🥈", "🥉"][i] || "•";
      const isYou = u.username === username ? " ← tú" : "";
      return `${medal} *${u.username}* — ${fmt(u.puntos)} pts${isYou}`;
    }).join("\n");

    const inTop3 = top3.some(u => u.username === username);
    const youLine = inTop3 ? "" : `\n\nTu lugar: *#${stats.posicion}* de ${fmt(stats.total_jugadores)} jugadores`;

    return `📊 *${username}*, esto vas:

⚽ Total acumulado: *${fmt(stats.puntos_total)} pts*
🎯 Mejor ronda: *${fmt(stats.mejor_ronda)} pts*${youLine}

🏆 *Top 3 ahora:*
${top3Lines}

🎫 ¿Quieres subir? Manda otro folio para jugar.`;
  },

  // ─── PREMIOS ─────────────────────────────────────────────────────────────
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
↳ *Merch firmado por La Cotorrisa* 👕
↳ Edición limitada de la campaña

💪 *¿Cómo subir en el ranking?*
↳ Juega tus *${RONDAS_MAX} rondas diarias*
↳ Mejora tu puntaje en cada juego
↳ Acumula puntos toda la campaña

🔥 La campaña termina el *${CAMPAIGN_END_DATE}*. ¡A jugar!

📊 Ver mi posición → *PUNTOS*`,

  // ─── TIENDAS ─────────────────────────────────────────────────────────────
  tiendas: () =>
`🏪 *Las 4 marcas participantes:*

🥑 *Nutrisa* → yogurts y helados saludables
🍦 *Moyo* → yogurt helado con toppings
☕ *Cielito Café* → café y panadería
🌮 *Chilim Balam* → cocina mexicana

🎫 Compra en cualquiera → guarda el ticket → mándame el folio en *${DIAS_VALIDEZ} días*.

💡 Cada marca cuenta igual para tus puntos.`,

  // ─── REGLAS ──────────────────────────────────────────────────────────────
  reglas: () =>
`📋 *Las reglas en 30 segundos:*

🎫 *1 folio = 1 ronda* (4 minijuegos)
🎮 Máximo *${RONDAS_MAX} rondas* al día
📅 Ticket válido *${DIAS_VALIDEZ} días* desde la compra
🏆 Puntos *se acumulan* toda la campaña
🌅 Rondas se reinician a *medianoche CDMX*
🔒 Cada folio *una sola vez* — no lo compartas
👤 *Un WhatsApp = una cuenta* (no hagas trampa)

📅 La campaña termina el *${CAMPAIGN_END_DATE}*.

💡 ¿Algo no te queda claro? Escribe *AYUDA* o *SOPORTE*.`,

  // ─── DÓNDE ESTÁ EL FOLIO ─────────────────────────────────────────────────
  dondeFolio: () =>
`📋 *Cómo encontrar tu folio:*

🧾 Mira la *parte de arriba del ticket*
🔢 Busca *21 dígitos seguidos*
🟢 Siempre empieza con *84*
📍 Está antes de la lista de productos

📷 Te mandé una imagen de ejemplo arriba — fíjate en los números marcados.

⚠️ *Importante:*
↳ ❌ No me mandes la foto, no puedo leerla
↳ ❌ No me mandes el ticket completo escrito
↳ ✅ Solo los 21 números pegados

💡 Tip iOS/Android: mantén presionado el número en tu ticket fotografiado para copiarlo.`,

  // ─── GRACIAS ─────────────────────────────────────────────────────────────
  gracias: (u) =>
`¡Con gusto${u ? `, *${u}*` : ""}! ⚽

💡 Si necesitas algo más, escribe *AYUDA*.`,

  // ─── NO TEXTO (foto/audio/video) ─────────────────────────────────────────
  noTexto: () =>
`😅 Soy un bot de texto — no leo fotos, audios ni videos.

🎫 *¿Querías mandar tu folio?*
↳ Cópialo directo del ticket (los *21 números*)
↳ Pégalo aquí como texto
↳ ¿No sabes cómo? Escribe *FOLIO*

💬 *¿Querías otra cosa?*
↳ Escribe *AYUDA* para ver todas mis opciones
↳ Escribe *SOPORTE* si necesitas hablar con un humano`,

  // ─── PIDE FOLIO (genérico) ───────────────────────────────────────────────
  pedirFolio: () =>
`Para continuar necesito tu *folio* 🎫

📍 *Cómo encontrarlo:*
↳ 21 dígitos
↳ Empieza con *84*
↳ Arriba del ticket

✅ *Cópialo y pégalo directo* — no me mandes la foto.

¿Dudas? Escribe *FOLIO* para que te explique mejor.
¿Necesitas otra cosa? Escribe *AYUDA*.`,

  // ─── SOPORTE (v3.25 nuevos) ──────────────────────────────────────────────
  soporteIntro: () =>
`🆘 *Te pongo en contacto con un humano de Grupo Nutriza.*

Cuéntame en una sola frase qué necesitas:
↳ "Mi folio está dañado"
↳ "Alguien usó mi folio"
↳ "No me llega el link"
↳ "Quiero reportar un problema"
↳ Lo que sea

📩 Recibimos tu mensaje y un humano te contesta en *menos de 24 horas* (lunes a viernes 9-6 CDMX).

💡 Mientras tanto: si tu problema es no recibir el link, manda otro folio para generar uno nuevo.

(Si cambias de opinión, escribe *cancelar*.)`,

  soporteConfirmado: () =>
`✅ *Reporte recibido.*

Un humano de Grupo Nutriza revisará tu caso. Te contactamos pronto.

🎫 Mientras tanto puedes seguir jugando si tienes otro folio.`,

  soporteCancelado: () =>
`Va, cancelado 👌

Si cambias de opinión, escribe *SOPORTE* otra vez.

¿Otra cosa que necesites? Escribe *AYUDA*.`,

  // ─── MI LINK (v3.27 nuevo) — reenvía último link activo ──────────────────
  miLink: (username, magicLink) =>
`🔗 Aquí va tu link, *${username}*:

${magicLink}

⏱️ Expira en *1 hora*. Si ya pasó, manda otro folio y te genero uno nuevo.`,

  miLinkNoActivo: (username) =>
`No tienes una ronda abierta ahorita, *${username || "Fanático"}* 🤔

🎫 Para jugar, *manda un folio*. Te genero un link nuevo al momento.

📊 ¿Solo querías ver tu puntaje? Escribe *PUNTOS*.`,

  // ─── OTRA RONDA (v3.27 nuevo) — hype + recordatorio del folio ────────────
  otraRonda: (username, rondasHoy) => {
    if (rondasHoy >= RONDAS_MAX) {
      return `Ya jugaste tus *${RONDAS_MAX} rondas* de hoy, *${username}* 🏆

Mañana a *medianoche CDMX* se reinician.

📊 Mira tu posición → *PUNTOS*`;
    }
    return `¡Va, *${username}*! 🔥

Cáele por otro yogurt, café o snack a *Nutrisa, Moyo, Cielito Café o Chilim Balam* — cada compra = otra oportunidad de subir en el ranking.

🎫 *Manda los 21 dígitos del folio* de tu nuevo ticket (te paso la imagen de dónde buscarlo arriba ⬆️).

Te quedan *${RONDAS_MAX - rondasHoy} rondas* hoy.`;
  },
};

// ─── DETECCIÓN DE INTENCIÓN ─────────────────────────────────────────────────
function detectarIntencion(texto) {
  const t = texto.toUpperCase().trim();
  const inc = (...w) => w.some(p => t.includes(p));
  const num = texto.replace(/\s/g, "");
  if (/^84\d{10,20}$/.test(num)) return "folio_input";
  // v3.27: atajo_codigo solo para los explícitos de "ingresar código" desde el sitio.
  // OTRA RONDA y JUGAR OTRA ahora caen en el intent "otra_ronda" (más abajo) que
  // manda hype + imagen del folio.
  if (inc("INGRESAR CÓDIGO","INGRESAR CODIGO","INGRESAR FOLIO","NUEVO FOLIO")) return "atajo_codigo";
  // v3.25: SOPORTE antes que AYUDA (porque "AYUDA HUMANA" matchea ambos)
  if (inc("SOPORTE","AYUDA HUMANA","HABLAR CON ALGUIEN","HABLAR CON HUMANO","REPORTAR PROBLEMA","CONTACTAR HUMANO")) return "soporte";
  // v3.27: MI LINK / LINK — reenvía el último magic link activo
  if (inc("MI LINK","MILINK","MI ENLACE","REENVIAR LINK","NUEVO LINK","DAME EL LINK","DAME EL ENLACE","NO ME LLEGA EL LINK","SE PERDIO EL LINK","ENVIA LINK")) return "mi_link";
  if (t === "LINK" || t === "ENLACE") return "mi_link";
  // v3.27: OTRA RONDA — el usuario pide otra ronda (sin folio aún)
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
  const data = await sbRpc("get_wa_profile", { p_phone: tel }, trace);
  if (data && data.found) { metrics.get_profile_found++; return data; }
  metrics.get_profile_notfound++;
  return null;
}

// v3.25: detecta días sin actividad para re-engagement
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

  if (!s.cargado) {
    const jugador = await cargarSesion(tel, trace);
    if (jugador) {
      if (jugador.wa_bloqueado === true) {
        metrics.user_blocked = (metrics.user_blocked || 0) + 1;
        log.warn(trace, `🚫 Usuario bloqueado, ignorando: ${tel}`);
        return;
      }

      let recoveredPhase = jugador.wa_phase || "nuevo";
      if (recoveredPhase === "esperando_username") {
        log.warn(trace, `Sesión recuperada en esperando_username sin pendingFolio — reset a esperando_folio`);
        recoveredPhase = "esperando_folio";
      }
      setSesion(tel, {
        cargado:     true,
        fase:        recoveredPhase,
        username:    jugador.wa_username || jugador.username || null,
        userId:      jugador.user_id || null,
        rondasHoy:   typeof jugador.wa_rondas_hoy === 'number' ? jugador.wa_rondas_hoy : 0,
        rondasTotal: typeof jugador.wa_rondas_total === 'number' ? jugador.wa_rondas_total : 0,
        fechaReset:  jugador.wa_fecha_reset || null,
        bloqueado:   jugador.wa_bloqueado === true,
        diasSinJugar: diasSinActividad(jugador),
      });
    } else {
      setSesion(tel, { cargado: true, fase: "nuevo" });
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

  if (s.fechaReset && s.fechaReset !== hoy && userId) {
    rondasHoy = 0;
    setSesion(tel, { rondasHoy: 0, fechaReset: hoy });
    sbRpc("update_wa_profile", { p_phone: tel, p_user_id: userId, p_rondas_hoy: 0, p_fecha_reset: hoy }, trace).catch(() => {});
  }

  // v3.25: SOPORTE — escape hatch humano
  if (intencion === "soporte") {
    metrics.cmd_soporte_invoked++;
    setSesion(tel, { fase: "esperando_soporte" });
    return enviar(tel, M.soporteIntro(), trace);
  }
  if (s.fase === "esperando_soporte") {
    if (intencion === "cancelar") {
      setSesion(tel, { fase: username ? "activo" : "nuevo" });
      return enviar(tel, M.soporteCancelado(), trace);
    }
    // Registrar ticket
    await bcSyncSoporte(tel, username, texto, "Otro").catch(() => {});
    setSesion(tel, { fase: username ? "activo" : "nuevo" });
    return enviar(tel, M.soporteConfirmado(), trace);
  }

  if (intencion === "reiniciar") {
    metrics.cmd_reiniciar_invoked++;
    setSesion(tel, { fase: username ? "activo" : "nuevo", intentos: 0, pendingFolio: null });
    return enviar(tel, username ? M.bienvenidaConocido(username, rondasHoy) : M.bienvenidaNuevo(), trace);
  }
  if (intencion === "ayuda")       { metrics.cmd_ayuda_invoked++;   return enviar(tel, M.ayuda(username), trace); }
  // v3.27: PUNTOS muestra puntaje + posición directo en WhatsApp
  if (intencion === "puntos")      {
    metrics.cmd_puntos_invoked++;
    if (!userId) {
      // Usuario no registrado todavía
      return enviar(tel, M.bienvenidaNuevo(), trace);
    }
    // Forzar sync de orfanos por si hay canjes sin sesión (legacy safety net)
    sbRpc("auto_sync_all_orphans", {}, trace).catch(() => {});
    let statsRes = null;
    let rpcFailed = false;
    try {
      statsRes = await sbRpc("get_user_stats_for_bot", { p_user_id: userId }, trace);
    } catch (e) {
      rpcFailed = true;
      log.error(trace, `get_user_stats_for_bot failed: ${e.message}`);
    }
    // RPC técnica falló → mensaje de error temporal (no "sin puntaje")
    if (rpcFailed) {
      return enviar(tel, M.errorEdgeFunction(), trace);
    }
    // No registrado o sin puntaje → mensaje "aún no tienes puntaje"
    if (!statsRes || statsRes.found === false) {
      return enviar(tel, M.puntos(username || "Fanático", null), trace);
    }
    return enviar(tel, M.puntos(username || statsRes.username, statsRes), trace);
  }
  // v3.27: MI LINK — reenvía el último link activo (si hay ronda abierta)
  if (intencion === "mi_link")     {
    metrics.cmd_mi_link_invoked++;
    if (!userId) {
      return enviar(tel, M.bienvenidaNuevo(), trace);
    }
    const linkRes = await waAuth("get_link", { phone: tel }, trace).catch(() => null);
    if (linkRes?.ok && linkRes.magic_link) {
      return enviar(tel, M.miLink(username || "Fanático", linkRes.magic_link), trace);
    }
    return enviar(tel, M.miLinkNoActivo(username), trace);
  }
  // v3.27: OTRA RONDA — hype + recuerda dónde está el folio + imagen
  if (intencion === "otra_ronda")  {
    metrics.cmd_otra_ronda_invoked++;
    if (!userId) {
      return enviar(tel, M.bienvenidaNuevo(), trace);
    }
    // Manda primero la imagen de dónde está el folio, luego el mensaje
    await enviarImagen(tel, IMG_FOLIO, "📋 Aquí está el folio en tu ticket — los 21 dígitos que empiezan con 84", trace);
    return enviar(tel, M.otraRonda(username || "Fanático", rondasHoy), trace);
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
    if (username) {
      // v3.25: detectar re-engagement vs nuevo día vs normal
      if (diasSinJugar >= DIAS_RE_ENGAGEMENT) {
        metrics.reengagement_triggered++;
        return enviar(tel, M.bienvenidaReEngagement(username), trace);
      }
      if (diasSinJugar === 1 && rondasHoy === 0) {
        return enviar(tel, M.bienvenidaNuevoDia(username), trace);
      }
      return enviar(tel, M.bienvenidaConocido(username, rondasHoy), trace);
    }
    setSesion(tel, { fase: "esperando_folio" });
    await enviarImagen(tel, IMG_FOLIO, "📋 Tu folio: 21 dígitos que empiezan con 84", trace);
    return enviar(tel, M.bienvenidaNuevo(), trace);
  }

  if (intencion === "atajo_codigo") {
    if (username) {
      setSesion(tel, { fase: "esperando_folio" });
      return enviar(tel, M.atajoConocido(username, rondasHoy), trace);
    }
    setSesion(tel, { fase: "esperando_folio" });
    await enviarImagen(tel, IMG_FOLIO, "📋 Tu folio: 21 dígitos que empiezan con 84", trace);
    return enviar(tel, M.bienvenidaNuevo(), trace);
  }

  if (s.fase === "esperando_username") {
    if (intencion === "folio_input") {
      log.info(trace, `Folio recibido en esperando_username — pidiendo username del folio anterior`);
      return enviar(tel,
        `Antes mándame *un apodo* para tu folio anterior 👤\n\n` +
        `O escribe *reiniciar* si prefieres empezar con este folio nuevo.`,
        trace
      );
    }

    const nombrePropuesto = texto.trim().substring(0, 20);
    const val = validarUsername(nombrePropuesto);
    if (!val.valido) return enviar(tel, M.usernameInvalido(val.razon, val.sugerencia), trace);

    log.info(trace, `→ register username="${nombrePropuesto}" phone=${tel}`);
    const regRes = await waAuth("register", { phone: tel, username: nombrePropuesto }, trace);

    if (regRes?.error === "username_taken") return enviar(tel, M.usernameTomado(generarSugerencia(nombrePropuesto)), trace);
    if (regRes?.error === "inappropriate_username") {
      metrics.username_rejected_profanity++;
      log.info(trace, `Username rechazado por profanity: "${nombrePropuesto}"`);
      // v3.25: usa M.usernameProfanity con sugerencia + escape a SOPORTE
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
      return enviar(tel, `Hubo un problema. Mándame tu folio de nuevo 🎫`, trace);
    }

    const claimRes = await sbRpc("validate_and_claim_ticket", {
      p_code: pendFolio, p_user_id: newUserId,
    }, trace);

    if (!claimRes?.success) {
      metrics.claim_fail++;
      log.error(trace, "Claim fallido tras register:", JSON.stringify(claimRes));
      setSesion(tel, { fase: "activo", username: finalUsername, userId: newUserId, pendingFolio: null });
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
      return enviar(tel, `¡Listo *${finalUsername}*! 🎉\n\nVe a *${SITE_URL}* para entrar a jugar.\nRonda *${rondaNum}* de *${RONDAS_MAX}* hoy 🎮`, trace);
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

    if (username && userId) {
      let localRondasTotal = s.rondasTotal || 0;
      const freshProfile = await sbRpc("get_wa_profile", { p_phone: tel }, trace);
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

        // FIX v3.24 #1 — Sesión activa: regenerar magic link
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
        return enviar(tel, `✅ ¡Folio registrado, *${username}*!\nVe a *${SITE_URL}* para jugar.\nRonda *${rondaParaMostrar}* de *${RONDAS_MAX}* hoy.`, trace);
      }
      log.info(trace, `Magic link generado: ${maskLink(linkRes.magic_link)}`);
      return enviar(tel, M.folioAdicional(username, rondaParaMostrar, linkRes.magic_link), trace);
    }

    const storeInfo = getStoreFromFolio(folio);
    setSesion(tel, { fase: "esperando_username", pendingFolio: folio, intentos: 0 });
    return enviar(tel, M.folioOkPideNombre(storeInfo?.name, storeInfo?.brand || "Grupo Nutriza"), trace);
  }

  if (s.fase === "activo" && username) {
    return enviar(tel, `¿Tienes un folio nuevo, *${username}*? Mándamelo 🎫\n\nO escribe *AYUDA* si necesitas algo.`, trace);
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
        if (msg.id && processedMsgs.has(msg.id)) {
          metrics.webhook_dedup_hit++;
          log.info(trace, `⏭️ Dup msg ${msg.id}`);
          continue;
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

        procesarMensaje(tel, texto, trace).catch(e => {
          metrics.msg_errors++;
          recordError("procesarMensaje", e);
          log.error(trace, "procesarMensaje top:", e);
        });
      }
    }
  }
});

// ════════════════════════════════════════════════════════════════════════════
// FIX v3.24 #2 — Endpoint /game-complete (cierra el loop)
// v3.25: ahora incluye puntos acumulados en el mensaje
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

      // v3.27: obtener posición en el leaderboard para incluirla en el mensaje
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

      // v3.25: pasar puntosTotal al mensaje para mostrar acumulado
      // v3.27: pasar también posición y total de jugadores
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
// v3.25 — ENDPOINTS ADMIN PARA AIRTABLE
// ════════════════════════════════════════════════════════════════════════════

// POST /send-direct
// Jonny manda mensaje custom a un usuario desde Airtable.
// Body: { phone, message, secret }
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

  const msg = String(message).substring(0, 1500); // límite de WA template
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

// POST /admin-broadcast-trigger
// Fuerza procesamiento inmediato de la cola de broadcasts (no espera el cron de 30s)
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

// GET /admin-health-summary
// Resumen compacto del estado del bot para Airtable Dashboard.
// Pasar secret como query param o header (no es endpoint super sensible).
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
