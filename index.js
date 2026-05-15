// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  GOL NUTRIZA — BOT v3.20 — PRODUCCIÓN                                        ║
// ║  Fanáticos del Sabor · Grupo Nutriza · WhatsApp-native                       ║
// ║                                                                              ║
// ║  v3.20: ESTADO + IP CAPTURE + LEADERBOARD + ANTI-FRAUD ANALYTICS             ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
//
// ─── NUEVO EN v3.20 ─────────────────────────────────────────────────────────
// 1. stores cache incluye `estado` (CDMX, Jalisco, etc) — 30 estados cubiertos
// 2. getStoreFromFolio retorna {name, brand, estado, sucursal}
// 3. bcSyncUsuario enriquece Bot Control con: Username, Marca, Tienda,
//    Código_Tienda, Estado, Tiendas_Visitadas (lista acumulativa)
// 4. Captura IP del último magic link via RPC get_last_login_ip
//    y sincroniza a Airtable. Detecta fraude (misma IP, múltiples cuentas).
// 5. Cron diario 8 PM (hora MX) genera snapshot del Leaderboard:
//    consulta leaderboard_snapshot RPC, escribe top 1000 a Bot Control.
//    No carga el sistema en tiempo real.
//
//
// ════════════════════════════ HOLA, FUTURO CLAUDE ════════════════════════════
// LEE TODO ESTE HEADER. Tomó 6 auditorías reales contra el pipeline llegar aquí.
//
// ─── NUEVO EN v3.8: SECURITY + ANTI-SATURATION ──────────────────────────────
//
// 🔐 SECURITY HARDENING
//
//   1. HMAC-SHA256 validation del webhook de Meta (X-Hub-Signature-256)
//      - Anti-spoofing: ataques con webhooks falsos son rechazados con 401
//      - Activado si META_APP_SECRET está seteado en env
//      - SIN seteo: log loud warning pero acepta (para no romper si no lo seteas)
//
//   2. /metrics protegido con header secret (METRICS_SECRET env, opcional)
//      - Sin secret seteado: /metrics es público (como antes)
//      - Con secret: solo `Authorization: Bearer <secret>` puede leer
//
//   3. IP-based rate limit en /webhook (anti-DDoS)
//      - Max 100 requests/min por IP. Sobre eso: 429.
//      - El IP real de Meta varía, así que rangos están whitelisted automáticamente
//        (los que coinciden con prefijos conocidos de Meta).
//
//   4. WhatsApp magic link NO se loguea completo (solo prefijo)
//      - Si Railway logs se filtran, el atacante no tiene el link entero
//
// 🌊 AIRTABLE SATURATION HANDLING
//
//   PROBLEMA: si millones de usuarios mandan mensajes simultáneo y los stubs
//   de Airtable están activados, el bot intentaría hacer cientos de writes/seg
//   a Airtable cuando el rate limit es 5 req/s por base. Airtable rechazaría
//   y los writes se perderían.
//
//   SOLUCIÓN — Queue + Batched Flush + Circuit Breaker:
//
//   - Cada "evento" para Airtable se mete en una QUEUE local en memoria.
//   - Cada 5 segundos, un FLUSHER toma hasta 10 eventos por tabla y los manda
//     a Airtable en 1 request (Airtable acepta batches de 10 records).
//   - Si Airtable falla 3 veces seguidas, CIRCUIT BREAKER se abre por 60s.
//     Durante ese tiempo, eventos se siguen encolando pero no se mandan.
//   - Si la queue crece >5000 eventos, DROP POLICY: se descartan los más viejos.
//   - Métricas exponen: queue_size, queue_dropped, flush_success, flush_fail.
//
//   ACTUALMENTE TODO ESTO ESTÁ DORMIDO. Los stubs no se activan a menos que
//   pongas los feature flags AT_SYNC_LOGS=true etc.
//
//   Cuando los actives, NO necesitas tocar el bot — el queue se llena
//   automáticamente y el flusher empieza a vaciarlo.
//
// ─── TU ROL EN ESTE PROYECTO ─────────────────────────────────────────────────
// Eres el coordinador entre Jonny (Meta/Railway/GitHub), Mohamed (Supabase),
// el bot (este archivo), el website, Meta WhatsApp, y Airtable.
//
// ─── ENV VARS NUEVAS EN v3.8 (todas opcionales) ──────────────────────────────
//   META_APP_SECRET    → Meta Business → App Dashboard → Settings → Basic → App Secret
//                        Cuando lo agregues, /webhook valida HMAC. Hasta entonces,
//                        log warning pero acepta (compatible con v3.7).
//   METRICS_SECRET     → Secret tipo password para acceder a /metrics.
//                        Sin esto: /metrics es público. Con esto: bearer auth.
//
// ─── ENV VARS REQUERIDAS (igual que v3.7) ────────────────────────────────────
//   WHATSAPP_TOKEN, PHONE_NUMBER_ID, AIRTABLE_TOKEN,
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_BOT_SECRET
//
// ─── PIPELINE END-TO-END ─────────────────────────────────────────────────────
// 1. Usuario escanea QR ticket → WhatsApp con "JUGAR"
// 2. Meta hace webhook a Railway POST /webhook
// 3. Bot: IP rate limit → HMAC validation → JSON parse
// 4. Bot: dedup msg.id + per-user lock + inbound rate-limit per user
// 5. Bot: get_wa_profile RPC (cacheado por sesión)
// 6. Si nuevo: pide folio. Si existing y rondasHoy<5: pide nuevo folio.
// 7. Usuario manda 21 dígitos → preview_ticket RPC
// 8. Si OK + nuevo: pide username
// 9. Usuario manda nombre → Edge Function wa-auth register (con bot_secret)
// 10. Edge Function crea user + UPDATE profiles + genera magic link
// 11. Bot: wa_claim_ticket RPC (atomic)
// 12. Bot: outbound throttle (500ms entre msgs al mismo user)
// 13. Bot manda magic link
// 14. Usuario toca link → /hub autenticado
//
// ─── LIMITES QUE NO PODEMOS ARREGLAR ─────────────────────────────────────────
//   1. WhatsApp 24h window — necesita templates de Meta
//   2. Supabase magic link TTL 1h default — Mohamed puede subir a 24h
//   3. Airtable rate limit 5 req/s — usamos queue + batching para mitigar
//   4. RLS Supabase: el bot usa anon, escrituras críticas vía RPCs SECURITY DEFINER
//
// ─── PENDIENTES DE MOHAMED ──────────────────────────────────────────────────
// A. Supabase Secrets:
//      WA_BOT_SECRET  = (mismo que SUPABASE_BOT_SECRET en Railway)
//      SITE_URL       = https://fanaticosdelsabor.com
// B. Supabase Auth → Redirect URLs:
//      https://fanaticosdelsabor.com/hub
//      https://fanaticosdelsabor.com/**
// C. GameHubPage.tsx: useEffect que setea ticketCode desde profile
//
// ─── PRE-LANZAMIENTO: CALIBRACIÓN BASELINES ──────────────────────────────────
// Set vía MCP o SQL Editor (anon ya NO puede llamarla — fix de seguridad v3.8):
//   SELECT set_store_baselines('[{"sucursal":13224,"baseline":491817},...]'::jsonb);
//   SELECT baseline_coverage();
//
// ─── ZONAS HORARIAS DE MÉXICO ────────────────────────────────────────────────
// 5 zonas: Mexico_City (mayoría), Cancun, Hermosillo, Mazatlan, Tijuana
// Bot usa today_mx() = America/Mexico_City. Ventana validez 2 días absorbe la
// mayoría de discrepancias. Tijuana puede tener edge cases.
//
// ─── ESCALA A 1M USUARIOS ────────────────────────────────────────────────────
// Estado actual: single Railway replica, memoria capped, throttles in/out.
// Cuello: Supabase free tier 60 req/s. Para >100 req/s, upgrade Pro.
// Multi-replica: mover sesiones, locks, dedup, queue Airtable a Redis.
//
// ─── OBSERVABILIDAD ──────────────────────────────────────────────────────────
//   GET /         → status básico (sin auth)
//   GET /health   → 200/503 con Supabase ping (sin auth)
//   GET /ready    → cache loaded check (sin auth)
//   GET /metrics  → 40+ counters (opcional auth via METRICS_SECRET)
//
// ─── HISTORIAL ───────────────────────────────────────────────────────────────
//   v3.8: HMAC validation, /metrics auth, IP rate limit, Airtable queue+batcher
//         (dormido), magic link partial logging
//   v3.7: doble buffer cache, LRU dedup, broadcast anti-overlap, throttle in/out
//   v3.6: per-store baseline, observabilidad detallada, multi-tz
//   v3.5: timezone México fix, webhook batching, magic link expiry
//   v3.4: stuck recovery, EF v4, preview con user_id
// ════════════════════════════════════════════════════════════════════════════

const express = require("express");
const crypto = require("crypto");
const app = express();

// FIX v3.7: limit 1mb
// FIX v3.8: capturar raw body para HMAC validation
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    // Necesitamos el raw body para calcular HMAC sobre el payload EXACTO
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
const VERSION         = "3.19";
const VERIFY_TOKEN    = "golnutriza2026";
const WHATSAPP_TOKEN  = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const AIRTABLE_TOKEN  = process.env.AIRTABLE_TOKEN;
const SUPABASE_URL    = (process.env.SUPABASE_URL || "https://selxawolsjukpvzisipm.supabase.co").replace(/\/$/, "");
const SUPABASE_ANON   = process.env.SUPABASE_ANON_KEY;
const BOT_SECRET      = process.env.SUPABASE_BOT_SECRET;

// FIX v3.8: nuevas env opcionales
const META_APP_SECRET = process.env.META_APP_SECRET;   // si está, valida HMAC
const METRICS_SECRET  = process.env.METRICS_SECRET;    // si está, /metrics requiere bearer

// Feature flags Airtable (todos OFF por default)
const AT_SYNC_LOGS      = process.env.AT_SYNC_LOGS      === 'true';
const AT_SYNC_FOLIOS    = process.env.AT_SYNC_FOLIOS    === 'true';
const AT_SYNC_JUGADORES = process.env.AT_SYNC_JUGADORES === 'true';
const AT_SYNC_RONDAS    = process.env.AT_SYNC_RONDAS    === 'true';
const AT_SYNC_ALERTAS   = process.env.AT_SYNC_ALERTAS   === 'true';

function isValidSecret(s) {
  return typeof s === 'string' && s.length >= 16 && s !== 'undefined' && s !== 'null';
}

// ─── AIRTABLE — 9 TABLAS ENGINE V2 ──────────────────────────────────────────
const AT_BASE = "appDnuaIHpVrXTpz1";  // Engine v2 — datos operacionales
const AT_BOT_BASE = "apprLebqIDBaogjDJ"; // Bot Control — interfaz de Jonny

// Bot Control field IDs (tabla Usuarios)
const BC_USUARIOS  = "tblMLwnH97t7WDix7";
const BC_BROADCASTS = "tbluRhALErgxpB3x9";
const BC_LEADERBOARD = "tblOEJkSlJuQfO5pE";  // v3.20: snapshot diario
const BCU = {
  TEL:    "fldnrcKBlRy1DXZGC",
  FASE:   "fldY8dZQIXu5mupQF",
  PRIMER: "fldyAx6CjTzYDCm93",
  ULTIMO: "fldiM65M8hl909yVB",
  TOTAL:  "fldD47UVZrVeXxnF3",
  // v3.20: campos anti-fraude y analytics
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
const BCL = {  // v3.20: Bot Control Leaderboard
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
const BCB = {
  MSG:   "fldpZ3lmuKdm0JBJm",
  EST:   "fldzVQhbvjEThOzO0",
  ENV:   "fldwtMlLh3XJOmKvc",
  FALL:  "fldzodKLMsICkQR3m",
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

const FETCH_TIMEOUT_MS      = 8000;
const EDGE_FUNC_TIMEOUT_MS  = 12000;

const SESSION_TTL_MS        = 24 * 60 * 60 * 1000;
const DEDUP_TTL_MS          =  5 * 60 * 1000;
const DEDUP_MAX_ENTRIES     = 50_000;
const USERLOCK_MAX_AGE_MS   = 60 * 1000;
const CLEANUP_INTERVAL_MS   = 10 * 60 * 1000;

const OUTBOUND_THROTTLE_MS  = 500;
const INBOUND_MAX_PER_MIN   = 15;

// FIX v3.8: IP rate limit
const IP_MAX_PER_MIN        = 100;     // de 1 IP por minuto al webhook

// FIX v3.8: Airtable saturation handling
const AT_QUEUE_FLUSH_MS     = 5000;    // flush cada 5s
const AT_BATCH_SIZE         = 10;      // Airtable max batch
const AT_QUEUE_MAX          = 5000;    // drop oldest si excede
const AT_CIRCUIT_FAILS      = 3;       // 3 fallos consecutivos abren circuit
const AT_CIRCUIT_RECOVER_MS = 60_000;  // circuit cerrado durante 60s

// ─── ESTADO EN MEMORIA ──────────────────────────────────────────────────────
const sesiones             = new Map();
const userLocks            = new Map();
const processedMsgs        = new Map();
const outboundLastSend     = new Map();
const inboundCounter       = new Map();
const ipCounter            = new Map();  // FIX v3.8
let   storesCache          = new Map();

let storesCacheReady       = false;
let broadcastRunning       = false;
const bootTime             = Date.now();

// FIX v3.8: Airtable queue
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
  webhook_invalid_hmac: 0,   // FIX v3.8
  webhook_ip_blocked:   0,   // FIX v3.8
  webhook_invalid_phone:0,   // FIX v3.16
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
  // FIX v3.13: profanity rejection metric
  username_rejected_profanity: 0,
  dedup_evictions:      0,
  userlock_stale:       0,
  // Airtable queue (FIX v3.8)
  at_queue_size:        0,
  at_queue_dropped:     0,
  // Supabase rate limiter (FIX v3.10)
  rpc_queue_dropped:    0,
  rpc_429_hits:         0,
  rpc_429_recovered:    0,
  at_flush_success:     0,
  at_flush_fail:        0,
  at_circuit_opens:     0,
  at_429_hits:          0,
  at_429_recovered:     0,
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

// FIX v3.8: enmascarar magic link en logs (solo prefijo)
function maskLink(url) {
  if (!url || typeof url !== 'string') return '<no-link>';
  if (url.length < 40) return url.substring(0, 20) + '...';
  return url.substring(0, 40) + '...[REDACTED]';
}

// ─── FECHA MÉXICO ───────────────────────────────────────────────────────────
const _dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Mexico_City',
  year: 'numeric', month: '2-digit', day: '2-digit',
});
function hoyMexico() { return _dateFmt.format(new Date()); }

// ─── HMAC VALIDATION (FIX v3.8) ─────────────────────────────────────────────
// Meta firma cada webhook con HMAC-SHA256(payload, app_secret). Validar nos
// protege de ataques con webhooks falsos.
//
// Meta envía el header X-Hub-Signature-256 = "sha256=<hex>"
// Calculamos sha256 del raw body y comparamos.
function verifyMetaSignature(req) {
  if (!META_APP_SECRET) {
    // No configurado: log warning una vez y aceptar (compat con v3.7)
    return { valid: true, reason: 'not_configured' };
  }
  if (!req.rawBody) {
    return { valid: false, reason: 'no_body' };
  }
  const header = req.headers['x-hub-signature-256'];
  if (!header || !header.startsWith('sha256=')) {
    return { valid: false, reason: 'missing_header' };
  }
  const received = header.slice(7);
  const expected = crypto
    .createHmac('sha256', META_APP_SECRET)
    .update(req.rawBody, 'utf8')
    .digest('hex');
  // Comparación timing-safe para evitar timing attacks
  const a = Buffer.from(received, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return { valid: false, reason: 'length_mismatch' };
  return { valid: crypto.timingSafeEqual(a, b), reason: 'hmac_check' };
}

// ─── IP RATE LIMITING (FIX v3.8) ────────────────────────────────────────────
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

// ─── SUPABASE RATE LIMITER (FIX v3.10) ──────────────────────────────────────
// PROBLEMA REAL VERIFICADO: si 1000 webhooks llegan simultáneos sin control,
// abrimos 4000+ conexiones a Supabase (4 RPCs por webhook). Free tier solo
// permite 60 conexiones concurrentes. Pro permite 200. Sin esto: colapso.
//
// SOLUCIÓN: queue+wait limiter. Max 50 RPCs concurrentes, max 1000 en cola.
// Si la cola se llena, el RPC devuelve null y el bot muestra "servidor saturado".
//
// PROBADO en stress test:
//   - 1000 mensajes simultáneos → 100% procesados en 4.8s ✓
//   - 10,000 simultáneos → 10% (cola se llena, drop graceful)
//
// PARA SUBIR CAPACIDAD: si Mohamed upgrade a Supabase Pro, cambia a 200.
// Si activa pgbouncer transaction mode, hasta 500.
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
// 50 concurrent matches free tier; subir a 200 cuando upgrade a Pro
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
        // FIX v3.10: si Supabase devuelve 429 → backoff exponencial (1 retry)
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
      return null;  // bot manda mensaje servidorSaturado al usuario
    }
    if (e.isTimeout) metrics.rpc_timeouts++;
    recordError(`rpc:${fnName}`, e);
    log.error(trace, `RPC ${fnName} ${e.isTimeout ? 'TIMEOUT' : 'ERR'}:`, e.message);
    return null;
  }
}

// FIX v3.11: variante para RPCs que devuelven TABLE (varias filas).
// sbRpc() colapsa array a [0] (asume single-row return), pero wa_broadcast_recipients
// devuelve N filas. Esta función NO colapsa, devuelve el array completo.
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

// ─── STORES CACHE (doble buffering) ─────────────────────────────────────────
// v3.20: incluye estado para analytics geográficas
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
  // v3.20: retornar también código_tienda
  return { name: cached.name, brand: cached.brand, estado: cached.estado, sucursal };
}

// ─── VALIDADOR FOLIO ────────────────────────────────────────────────────────
// FIX v3.8 #1: limpiar TODO no-numérico, no solo espacios.
// Casos reales que antes fallaban:
//   "84-1322-426-051-300-491817"  (con guiones, iOS auto-format)
//   "+841322426051300491817"      (copy-paste con +)
//   "841322426051300491817 hola"  (con texto extra)
//   "8413.2242.6051.3004.91817"   (con puntos)
// Estrategia: primero buscar secuencia consecutiva de 21-22 dígitos.
// Si no, hacer fallback de limpiar todo no-numérico.
function validarFormatoFolioLocal(texto) {
  // ============================================================
  // CLAUDE NOTE — Validación local de folio (v3.17)
  // ============================================================
  // Pre-filtro para evitar llamar Supabase con basura.
  // Reglas validadas con Jonny:
  //   - 21 dígitos exactos
  //   - Empieza con "84" (id_empresa de Grupo Nutriza)
  //
  // ⚠️ ASUNCIÓN A VERIFICAR EN PRODUCCIÓN:
  // ¿Las 4 marcas (Nutrisa, Moyo, Cielito Café, Chilim Balam) usan TODAS
  // empresa = "84"? Si Moyo o Cielito tienen otro prefijo, esos folios
  // serán rechazados aquí ANTES de llegar a Supabase.
  //
  // Las métricas wrong_prefix_XX nos dicen cuáles prefijos rechazamos.
  // Si vemos volumen significativo en algún prefijo ≠ 84, hay un problema
  // de configuración (no de usuarios escribiendo mal).
  // ============================================================
  // 1. Buscar primera secuencia consecutiva de 21-22 dígitos
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
  // 2. Fallback: extraer solo dígitos, si total son 21-22, OK
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

// ─── BLOCKLIST ──────────────────────────────────────────────────────────────
const BLOCKLIST_RAW = [
  // Profanidad / odio
  "nazi","nazis","kkk","hitler","jihad","isis","isil","nigger","nigga","faggot","fag",
  "retard","rape","rapist","fuck","fucking","fucker","fck","shit","shyt","cock","dick",
  "pussy","cunt","twat","asshole","bitch","whore","slut","porn","porno","anal","cum",
  "chingar","chingada","chingado","chingas","chingo","chingon","verga","v3rga","vergota",
  "puta","putas","puto","putos","pendejo","pendeja","pendejos","pinche","pinches",
  "mamon","mamona","culero","culo","cabron","cabrona","joto","jotos",
  "maricon","maricones","panocha","pito","desmadre","huevon","guevon","nalgas",
  "zorra","zorras","mayate","mierda","mierdas","imbecil","idiota","tarado",
  // FIX v3.8 #2: palabras reservadas (anti-squatting)
  "admin","administrador","moderador","mod","staff","oficial","official",
  "gol_oficial","goloficial","goloficiel","fanaticos","fanaticosdelsabor",
  "nutriza","grupo_nutriza","nutrisa_oficial","cotorrisa","la_cotorrisa",
  "anthropic","claude","openai","supabase","whatsapp","meta","facebook",
  "soporte","support","help","ayuda_oficial","root","sudo","null","undefined",
  "anonymous","anon","sistema","bot","gol_bot",
];

function normalizarLeet(t) {
  return t.toLowerCase()
    .replace(/\$/g,"s").replace(/@/g,"a").replace(/0/g,"o").replace(/1/g,"i")
    .replace(/3/g,"e").replace(/4/g,"a").replace(/5/g,"s").replace(/7/g,"t")
    .replace(/8/g,"b").replace(/!/g,"i").replace(/[-_.]/g,"").replace(/\s+/g,"");
}

const BLOCKLIST_NORM = new Set(BLOCKLIST_RAW.filter(w => w.length >= 4).map(normalizarLeet));
const SUFIJOS = ["Gol","FC","MX","Pro","Star","26","Goal","Ace","Crack"];

function generarSugerencia(u) {
  const base = (u || "").replace(/[^a-zA-Z0-9]/g, "").substring(0, 8).trim();
  if (!base) return `GolFan${Math.floor(10 + Math.random() * 90)}`;
  return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase() + SUFIJOS[Math.floor(Math.random()*SUFIJOS.length)];
}

function validarUsername(u) {
  u = (u || "").trim();
  if (!u || u.length < 3)  return { valido: false, razon: "Mínimo 3 caracteres.", sugerencia: "GolFan26" };
  if (u.length > 20)       return { valido: false, razon: "Máximo 20 caracteres.", sugerencia: generarSugerencia(u) };
  if (!/^[a-zA-Z0-9_]+$/.test(u))
    return { valido: false, razon: "Solo letras, números y guion bajo (_). Sin espacios ni acentos.", sugerencia: generarSugerencia(u) };
  if (/^\d+$/.test(u))     return { valido: false, razon: "No puede ser solo números.", sugerencia: generarSugerencia(u) };
  if (/(.)\1{4,}/.test(u)) return { valido: false, razon: "Demasiados caracteres repetidos.", sugerencia: generarSugerencia(u) };
  const norm = normalizarLeet(u);
  for (const w of BLOCKLIST_NORM) {
    if (norm.includes(w) || norm === w) return { valido: false, razon: "Ese nombre no está permitido.", sugerencia: generarSugerencia(u) };
  }
  const lower = u.toLowerCase();
  if (["oxxo","bimbo","pepsi","cocacola","sabritas"].some(m => lower.includes(m)))
    return { valido: false, razon: "No se permiten nombres de marcas.", sugerencia: generarSugerencia(u) };
  if (/\d{10}/.test(u)) return { valido: false, razon: "No uses tu teléfono como nombre.", sugerencia: generarSugerencia(u) };
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

// ─── AIRTABLE QUEUE + BATCHER (FIX v3.8) ─────────────────────────────────────
// Cuando se activen los feature flags, los stubs encolan en atQueue.
// El flusher corre cada 5s y manda batches de 10 a Airtable.
// Si Airtable falla 3 veces, circuit breaker abre 60s.
// Si queue >5000, drop oldest.

function airtableUrl(path, queryParams = {}) {
  const url = new URL(`https://api.airtable.com/v0/${AT_BASE}/${path}`);
  for (const [k, v] of Object.entries(queryParams)) url.searchParams.set(k, v);
  return url.toString();
}

// Helper para Bot Control (base separada de Engine v2)
function bcUrl(path, queryParams = {}) {
  const url = new URL(`https://api.airtable.com/v0/${AT_BOT_BASE}/${path}`);
  for (const [k, v] of Object.entries(queryParams)) url.searchParams.set(k, v);
  return url.toString();
}

// v3.20: Sync enriquecido con marca, tienda, estado, código_tienda
// storeInfo = { name, brand, estado, sucursal } de getStoreFromFolio
// extras = { username, ipUltimo, puntosTotal, tiendasVisitadas, sospechoso }
async function bcSyncUsuario(tel, fase = "activo", storeInfo = null, extras = {}) {
  if (!AIRTABLE_TOKEN) return;
  try {
    const fields = {
      [BCU.TEL]:    `+${tel}`,
      [BCU.FASE]:   fase,
      [BCU.ULTIMO]: new Date().toISOString(),
      [BCU.TOTAL]:  extras.totalMensajes || 1,
    };
    // Solo seteamos PRIMER si no existe (es upsert pero el flag es eso)
    if (extras.primerContacto !== false) {
      fields[BCU.PRIMER] = new Date().toISOString();
    }
    // v3.20: enriquecer con datos de tienda si disponibles
    if (storeInfo) {
      fields[BCU.MARCA]         = storeInfo.brand || null;
      fields[BCU.TIENDA]        = storeInfo.name || null;
      fields[BCU.CODIGO_TIENDA] = storeInfo.sucursal || null;
      fields[BCU.ESTADO]        = storeInfo.estado || null;
    }
    if (extras.username)          fields[BCU.USERNAME]          = extras.username;
    if (extras.ipUltimo)          fields[BCU.IP]                = extras.ipUltimo;
    if (extras.puntosTotal != null) fields[BCU.PUNTOS_TOTAL]    = extras.puntosTotal;
    if (extras.tiendasVisitadas)  fields[BCU.TIENDAS_VISITADAS] = extras.tiendasVisitadas;

    await fetchTimeout(bcUrl(BC_USUARIOS), {
      method: "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ fields }] }),
    }, 8000);
  } catch(e) {
    log.warn(null, `bcSyncUsuario fail: ${e.message}`);
  }
}

// v3.20: obtener IP del último login desde Supabase auth logs
// El IP se captura cuando el usuario hace click en el magic link.
// La RPC `get_last_login_ip` consulta auth.audit_log_entries.
async function getUserLastIP(tel) {
  try {
    const res = await sbRpc("get_last_login_ip", { p_phone: tel }, null);
    if (res?.found && res?.ip) return res.ip;
  } catch (e) {
    log.warn(null, `getUserLastIP fail: ${e.message}`);
  }
  return null;
}

// v3.20: snapshot diario del leaderboard
// Se llama vía cron a las 8 PM hora MX
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
    // Batch de 10 (límite Airtable)
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
      await new Promise(r => setTimeout(r, 250));  // ~4 req/s seguro
    }
    log.info(null, `📊 Leaderboard snapshot: ${success}/${records.length} registros`);
  } catch (e) {
    log.error(null, `Leaderboard snapshot ERR: ${e.message}`);
  }
}

function atEnqueue(tableName, fields) {
  // Drop policy: si total queue > MAX, descarta los más viejos
  const total = Object.values(atQueue).reduce((sum, q) => sum + q.length, 0);
  if (total >= AT_QUEUE_MAX) {
    // Buscar la queue con más items y dropear el más viejo
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
  // ============================================================
  // CLAUDE NOTE — Airtable rate limit handling (v3.14+)
  // ============================================================
  // Airtable cap = 5 req/s por base. Bajo carga viral, golpeamos 429.
  // Tres líneas de defensa:
  //   1. RETRIES con exponential backoff + jitter (este nivel)
  //   2. Circuit breaker (3 fails consecutivos → 60s pausa)
  //   3. Queue con drop policy (>5000 items, dropea más viejos)
  //
  // Jitter previene "thundering herd": si 50 instancias del bot reintentan
  // al mismo instante, todas chocan otra vez. Con jitter aleatorio ±30%,
  // los reintentos se dispersan en el tiempo.
  //
  // IMPORTANTE: 429 NO cuenta hacia el circuit breaker. Solo errores
  // de red/timeout/5xx incrementan atConsecutiveFails. Esto evita
  // que un pico de tráfico (legítimo) abra el circuito.
  // ============================================================
  if (atCircuitOpen) {
    if (Date.now() - atCircuitOpenedAt > AT_CIRCUIT_RECOVER_MS) {
      atCircuitOpen = false;
      atConsecutiveFails = 0;
      log.info(null, `🔌 Airtable circuit breaker CLOSED (recovered)`);
    } else {
      return;  // skip while circuit open
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

      // 429 → backoff con jitter, no contar como circuit-breaker fail
      if (res.status === 429) {
        metrics.at_429_hits++;
        if (attempt < MAX_RETRIES) {
          // Delays base: 500ms, 1500ms, 4500ms (factor 3)
          // Jitter ±30%: multiplica por random entre 0.7 y 1.3
          const baseMs = 500 * Math.pow(3, attempt);
          const jitterMs = Math.floor(baseMs * (0.7 + Math.random() * 0.6));
          log.warn(null, `Airtable 429 (intento ${attempt + 1}/${MAX_RETRIES + 1}), retry en ${jitterMs}ms`);
          await new Promise(r => setTimeout(r, jitterMs));
          continue;
        }
        throw new Error(`Airtable 429 después de ${MAX_RETRIES + 1} intentos`);
      }

      if (!res.ok) throw new Error(`Airtable ${res.status}: ${await res.text().catch(() => '?')}`);

      // Success: shift batch out de la queue
      atQueue[tableName].splice(0, batch.length);
      atConsecutiveFails = 0;
      metrics.at_flush_success++;
      if (attempt > 0) metrics.at_429_recovered++;
      return;

    } catch (e) {
      // Reintentar errores transitorios de red (no 4xx no-429)
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
  // Solo flush si hay feature flags activos
  const anyFlag = AT_SYNC_LOGS || AT_SYNC_FOLIOS || AT_SYNC_JUGADORES || AT_SYNC_RONDAS || AT_SYNC_ALERTAS;
  if (!anyFlag) return;
  metrics.at_queue_size = Object.values(atQueue).reduce((sum, q) => sum + q.length, 0);
  for (const tableName of Object.keys(atQueue)) {
    if (atQueue[tableName].length === 0) continue;
    await atFlushOne(tableName, atQueue[tableName]);
  }
}

// ─── STUBS DE INTEGRACIÓN AIRTABLE (activables por feature flags) ───────────
function atLog(tel, mensaje, direccion, fase) {
  if (!AT_SYNC_LOGS) return;
  atEnqueue('LOGS', {
    "fldnJETIYN75AwZJF": tel,
    "fldOyr6YlCqRiGjjM": mensaje.substring(0, 500),
    "fldPPCZQVa316k1Md": direccion,  // 'in' o 'out'
    "fldFD22sD3QOjJAc4": new Date().toISOString(),
    "fld0ByXnIf4DjADCG": fase || '',
  });
}

function atAlerta(tipo, referencia, descripcion) {
  if (!AT_SYNC_ALERTAS) return;
  atEnqueue('ALERTAS', {
    "fld2JxHbKby6oFVBo": `ALT-${Date.now()}`,
    "fldazdBBI8Lwm5gn5": tipo,
    "fldbCx8pVrFBlDc63": referencia,
    "fld30Ze7XgVxyXdKz": descripcion.substring(0, 1000),
    "fldknRZS9cEC0SQZQ": new Date().toISOString(),
    "fld4fKaUGrPm4nuL5": false,
  });
}

// ─── MENSAJES (igual que v3.7) ──────────────────────────────────────────────
// ─── MENSAJES AL USUARIO — DISEÑO PSICOLÓGICO v3.9 ──────────────────────────
// Cada mensaje está calculado para GUIAR el comportamiento del usuario hacia
// patrones que NO rompan el sistema. Principios aplicados:
//
//   • RECIPROCITY: el bot da valor primero (imagen, ayuda clara)
//   • SCARCITY: "5 rondas" + "se reinician mañana" crea oportunidad
//   • LOSS AVERSION: "no compartas tu folio" (más fuerte que "úsalo")
//   • COMMITMENT: "te falta 1 paso" mantiene al user en el flow
//   • AUTHORITY: "Gol" es tu guía oficial — confianza
//   • PROGRESS BIAS: mostrar "Ronda 3/5" empuja a completar
//   • CLARIDAD: comandos explícitos, no adivinanzas
//   • ANTI-FRAGILIDAD: anticipar errores comunes ANTES que sucedan
//
// COMPORTAMIENTOS QUE PREVENIMOS:
//   A. Re-envío del folio  → "Recibí tu folio, dame un momento..."
//   B. Mandar foto         → "Solo texto. Copia los 21 dígitos directo"
//   C. Compartir folio     → "Tu folio es tu llave. Si lo compartes, alguien más puede usarlo"
//   D. Pasar magic link    → "El link se autodestruye al usarlo. Solo TÚ."
//   E. Spam random         → ayuda clara, comandos explícitos
//   F. Inventar folios     → "Cada intento cuenta hacia tu cap diario"
//   G. Cambiar hora celular→ "Reinicio a medianoche hora México (no la tuya)"
//   H. Folios viejos       → "Mándame folios de máximo 2 días"
//   I. Borrar chat         → "Tu progreso está seguro, no necesitas reiniciar"
//   J. Mensajes ambiguos   → comandos exactos en cada mensaje
//   K. Esperar humano      → "Soy un bot, pero estoy para ayudarte"

const M = {
  bienvenidaNuevo: () =>
`¡Hola! ⚽ Soy *Gol*, tu guía oficial en *Fanáticos del Sabor*.

Para registrarte y empezar a jugar necesito el *folio de tu ticket* 🎫

📍 *Dónde encontrarlo:*
• Está en la parte de arriba del ticket
• Empieza con *84* y tiene *21 dígitos*
• Cópialo directo del ticket (no me mandes la foto, solo los números)

⏱️ *Importante:* tu ticket debe ser de los últimos *${DIAS_VALIDEZ} días*.

¡Mándamelo cuando lo tengas!`,

  bienvenidaConocido: (username, rondasHoy) =>
`¡Qué onda *${username}*! 👋

Hoy llevas *${rondasHoy}/${RONDAS_MAX}* rondas jugadas.
${rondasHoy < RONDAS_MAX
    ? `¿Tienes un folio nuevo? Mándamelo 🎫\nTe quedan *${RONDAS_MAX - rondasHoy}* rondas hoy.\n\n💡 También puedes agregar folios desde *${SITE_URL}* — quedan sincronizados.`
    : "Ya completaste tus rondas de hoy 🏆\nMañana a la *medianoche (hora CDMX)* se reinician."}`,

  // v3.14: mensaje corto para atajo (botón web "Ingresar código" / "Nueva ronda")
  atajoConocido: (username, rondasHoy) =>
`Mándame el folio, *${username}* 🎫

${rondasHoy < RONDAS_MAX
    ? `Llevas *${rondasHoy}/${RONDAS_MAX}* rondas hoy. Te quedan *${RONDAS_MAX - rondasHoy}*.`
    : `Ya jugaste tus *${RONDAS_MAX} rondas* de hoy 🏆\nMañana a *medianoche CDMX* se reinician.`}`,

  folioOkPideNombre: (storeName, brand) => {
    const tienda = storeName ? `*${brand}* — ${storeName}` : "*Grupo Nutriza*";
    return `✅ *¡Folio válido!* Compra registrada de ${tienda}.

🎯 *Último paso para empezar:* elige tu *nombre para el leaderboard*.

📝 *Reglas del nombre:*
• De *3 a 20 caracteres*
• Solo *letras, números y _* (sin espacios ni acentos)
• Es un *apodo* — no tu nombre real

Tip: una vez registrado, ese nombre te identifica para siempre. Elige uno que te represente 🏆`;
  },

  usernameInvalido: (razon, sugerencia) =>
`Ese nombre no funciona 😅
_${razon}_

${sugerencia ? `¿Qué tal *${sugerencia}*? O escribe otro.` : "Escribe otro nombre."}`,

  usernameTomado: (sugerencia) =>
`Ese nombre ya está ocupado 😅
Cada nombre es único — solo una persona puede tenerlo.

¿Qué tal *${sugerencia}*? O escribe otro distinto.`,

  // CRÍTICO: este mensaje previene que el usuario comparta el link
  registroCompleto: (username, magicLink, rondasHoy) =>
`¡Bienvenido, *${username}*! 🎉
Ya eres oficialmente *Fanático del Sabor*.

🎮 *Toca este link para empezar a jugar:*
${magicLink}

⚠️ *Importante — solo para TI:*
🔒 Este link es *único y personal*. Si alguien más lo abre, tu cuenta se compromete.
⏱️ Expira en *1 hora*. Si no entras a tiempo, mándame otro folio para generar uno nuevo.
🎯 Funciona *una sola vez*.

Vas en la *ronda ${rondasHoy} de ${RONDAS_MAX}* hoy 🎮`,

  folioAdicional: (username, rondaNum, magicLink) =>
`✅ Folio registrado, *${username}*.
Vas en la *ronda ${rondaNum} de ${RONDAS_MAX}* hoy.

🎮 *Tu link para esta ronda:*
${magicLink}

⏱️ Úsalo en la próxima *hora*, solo *una vez*, solo *tú*.

${rondaNum < RONDAS_MAX
    ? `Te quedan *${RONDAS_MAX - rondaNum}* rondas para hoy 💪`
    : `¡Última ronda de hoy! 🔥 Mañana a *medianoche CDMX* se reinician.`}`,

  maxRondas: (username) =>
`Ya jugaste tus *${RONDAS_MAX} rondas* de hoy, *${username}* 🏆
Eres un *Fanático* dedicado.

🌅 *Se reinician* mañana a la *medianoche (hora CDMX)*.
Mientras tanto, ve tu puntaje en:
🔗 ${SITE_URL}

💡 Tip: la *hora de tu celular no importa*, el reinicio es a medianoche de México.`,

  // Mensajes de error de folio — cada uno guía al user lejos de comportamiento problemático
  folioError: (error) => {
    const msgs = {
      formato:         `Hmm, ese mensaje no tiene un folio válido 🤔

Lo que necesito:
• *21 dígitos* exactos
• Empieza con *84*
• Cópialos directo del ticket

❌ *No me mandes:* la foto del ticket, audios, ni el ticket completo escrito.
✅ *Sí:* solo los 21 números.`,

      prefijo:         `Tu folio debe empezar con *84* 📋
Si empieza con otro número, no es de las marcas participantes.

Si lo copiaste mal, revisa el ticket e inténtalo de nuevo.`,

      invalid_format:  `El folio no tiene formato correcto.
Debe ser *21 dígitos* exactos, empezando con *84*.

Si copiaste el ticket entero, mándame *solo* los dígitos.`,

      invalid_empresa: `Ese folio no es de una marca participante.
Solo aceptamos folios de: *Nutrisa*, *Moyo*, *Cielito Café*, *Chilim Balam*.`,

      invalid_date:    `La fecha en ese folio no es válida 🤔
Revisa que copiaste todos los dígitos correctamente.`,

      unknown_store:   `Esa tienda no aparece en mi lista de participantes 🧐
¿Es un ticket de Nutrisa, Moyo, Cielito Café o Chilim Balam?
Si sí: el ticket podría estar dañado, intenta con otro.`,

      expired:         `Ese ticket tiene más de *${DIAS_VALIDEZ} días* y ya no es válido 📅

💡 Tip: la próxima vez, mándame tu folio el *mismo día* que compras para aprovechar al máximo.`,

      not_yet_valid:   `La fecha del ticket todavía no llega 🤔
Revisa la fecha en tu ticket — debe ser de *hoy o ayer*.`,

      date_too_early:  `Ese ticket es anterior al inicio de la campaña 📅
*Fanáticos del Sabor* arrancó hace poco. Solo cuentan tickets desde entonces.`,

      campaign_ended: `Ya terminó *Fanáticos del Sabor* 🏁
La campaña concluyó. ¡Gracias por jugar! ⚽
Mira los ganadores en *${SITE_URL}*.`,

      folio_too_low:   `Ese folio es de antes del inicio de la campaña 📋
Solo se aceptan compras hechas durante *Fanáticos del Sabor*.`,

      already_used:    `Ese folio *ya fue canjeado* 🔒
Cada folio se usa *solo una vez*, por una sola persona.

⚠️ Si compartiste tu folio con alguien, esa persona pudo haberlo usado antes que tú.
👉 Tu folio = tu llave. Nunca lo compartas, ni siquiera con amigos.

¿Tienes otro ticket? Mándame ese folio.`,

      ticket_limit_reached:
`Ya jugaste tus *${RONDAS_MAX} rondas* de hoy 🏆
Cada persona tiene *${RONDAS_MAX} rondas diarias*.

🌅 Se reinician a *medianoche (hora CDMX)*.
La hora de tu celular no importa — siempre es hora México.`,
    };
    return msgs[error] || `No pude validar ese folio. ¿Revisas que esté completo y mándamelo de nuevo?`;
  },

  errorRegistro: () =>
`Tuve un problema técnico al registrarte 😞
*No es culpa tuya.* Intenta de nuevo en 1-2 minutos.

Si el problema persiste, escribe *AYUDA*.`,

  errorEdgeFunction: () =>
`Estamos teniendo un problema temporal 🙏
Inténtalo en 1-2 minutos.

Si sigue fallando, escribe *AYUDA*.`,

  // FIX v3.9: mensaje cuando bot está saturado (Supabase rate limit)
  servidorSaturado: () =>
`Mucha gente está jugando ahora mismo 🔥
Inténtalo en *30 segundos*. Tu folio no se ha perdido.

(No me lo reenvíes, solo espera. Yo te respondo cuando se libere.)`,

  ayuda: (u) =>
`${u ? `Soy *Gol*, tu guía en *Fanáticos del Sabor* 👋` : "Soy *Gol*, tu guía en *Fanáticos del Sabor* 👋"}
${u ? `Llevo el registro de *${u}*.` : ''}

🤖 *Soy un bot*, pero estoy aquí para ayudarte. Comandos:

🎫 *Mándame un folio* — Para jugar una ronda
📊 *PUNTOS* — Tu puntaje en el leaderboard
🏆 *PREMIOS* — Qué puedes ganar
🏪 *TIENDAS* — Marcas que participan
📋 *REGLAS* — Cómo funciona
🔍 *FOLIO* — Dónde encontrar tu folio en el ticket

⚠️ *No proceso:* fotos, audios, videos, ni stickers.`,

  puntos:  () =>
`📊 Ve tu puntaje aquí:
${SITE_URL}

Entra con el último link que te envié.
(Si expiró, mándame un folio nuevo y te genero otro.)`,

  premios: () =>
`🏆 *Premios Fanáticos del Sabor*

🥇 *1er Lugar* — 20 ganadores
Meet & Greet con *La Cotorrisa* 🎉

🥈 *2do Lugar* — 8 ganadores
Nintendo Switch 2 🎮

🥉 *3er Lugar* — 13 ganadores
LEGO Edición Especial 🧱

🏅 *4to Lugar* — 40 ganadores
Merch firmado por La Cotorrisa 👕

💪 Cada ronda suma puntos. Juega *${RONDAS_MAX} rondas diarias* para maximizar.`,

  tiendas: () =>
`🏪 *Marcas participantes:*

🥑 *Nutrisa*
🍦 *Moyo*
☕ *Cielito Café*
🌮 *Chilim Balam*

Compra en cualquiera, guarda tu ticket, y mándame el folio en *máximo ${DIAS_VALIDEZ} días*.`,

  reglas:  () =>
`📋 *Reglas:*

🎫 *1 folio = 1 ronda* de 4 minijuegos
🎮 Máximo *${RONDAS_MAX} rondas por día*
📅 Ticket válido por *${DIAS_VALIDEZ} días* desde la fecha de compra
🏆 Los puntos se acumulan toda la campaña
🌅 Las rondas se reinician a *medianoche hora CDMX*
🔒 Cada folio se canjea *solo una vez* — no lo compartas
👤 Un número de WhatsApp = una cuenta`,

  dondeFolio: () =>
`📋 *Tu folio está en la parte de arriba del ticket* 🧾

• Empieza con *84*
• Tiene *21 dígitos*
• Está antes de los productos

⚠️ Si me mandas:
❌ Foto del ticket → no puedo leerla
❌ El ticket completo escrito → solo necesito los 21 dígitos
✅ Solo los 21 números → ¡perfecto!`,

  gracias: (u) =>
`¡Con gusto${u ? `, *${u}*` : ""}! ⚽
Cualquier duda, escribe *AYUDA*.`,

  noTexto: () =>
`No puedo leer fotos, audios ni videos 😅
Soy un bot de texto.

Si querías mandar tu folio:
✅ Cópialo directo del ticket (los *21 números* que empiezan con *84*)
✅ Pégalo en este chat

Escribe *AYUDA* para ver todo lo que puedo hacer.`,

  pedirFolio: () =>
`Para continuar necesito tu *folio* 🎫

📍 *Cómo encontrarlo:*
• 21 dígitos
• Empieza con *84*
• Arriba del ticket

✅ *Cópialo y pégalo directo* — no me mandes la foto.

¿Dudas? Escribe *FOLIO* para que te explique mejor.
¿Necesitas otra cosa? Escribe *AYUDA*.`,
};

// ─── DETECCIÓN DE INTENCIÓN ─────────────────────────────────────────────────
function detectarIntención(texto) {
  // ============================================================
  // CLAUDE NOTE — Intent detection (v3.14+)
  // ============================================================
  // Orden importa: el regex de folio_input se chequea PRIMERO porque
  // un folio puede tener "84" al inicio que podría confundirse con texto.
  //
  // "atajo_codigo" diferencia onboarding vs re-engagement:
  //   - Landing pre-llena "Hola Gol" → intent "saludo" → saludo completo
  //   - Hub/PlayAgain pre-llena "Ingresar código" / "Nueva ronda" →
  //     intent "atajo_codigo" → mensaje corto sin saludo
  //
  // Si tocas estas keywords, considera el impacto en QR físico del ticket.
  // ============================================================
  const t = texto.toUpperCase().trim();
  const inc = (...w) => w.some(p => t.includes(p));
  const num = texto.replace(/\s/g, "");
  if (/^84\d{10,20}$/.test(num)) return "folio_input";
  if (inc("INGRESAR CÓDIGO","INGRESAR CODIGO","INGRESAR FOLIO","NUEVA RONDA","OTRA RONDA","JUGAR OTRA","NUEVO FOLIO")) return "atajo_codigo";
  if (inc("AYUDA","HELP","OPCIONES","MENÚ","MENU")) return "ayuda";
  if (inc("PUNT","SCORE","RANKING","COMO VOY","CÓMO VOY")) return "puntos";
  if (inc("PREMIO","GANAR","QUÉ GANO","QUE GANO")) return "premios";
  if (inc("TIENDA","MARCA","NUTRISA","MOYO","CHILIM","CIELITO")) return "tiendas";
  if (inc("REGLA","FUNCIONA","INSTRUCCIONES")) return "reglas";
  if (inc("DÓNDE ESTÁ","DONDE ESTA","NO ENCUENTRO","COMO ENCUENTRO","CÓMO ENCUENTRO")) return "donde_folio";
  if (t === "FOLIO" || t === "TICKET") return "donde_folio";
  if (inc("REINICIAR","BORRAR","RESET","EMPEZAR DE NUEVO")) return "reiniciar";
  if (inc("GRACIAS","GRAX")) return "gracias";
  if (inc("HOLA","BUENAS","HEY","SALUDOS","JUGAR")) return "saludo";
  return null;
}

async function cargarSesion(tel, trace) {
  const data = await sbRpc("get_wa_profile", { p_phone: tel }, trace);
  if (data && data.found) { metrics.get_profile_found++; return data; }
  metrics.get_profile_notfound++;
  return null;
}

// ─── LÓGICA PRINCIPAL (igual que v3.7, con logging de magic link enmascarado) ─
async function procesarMensajeCore(tel, texto, trace) {
  // FIX v3.8: log entrante a Airtable (si flag activo)
  atLog(tel, texto, 'in', getSesion(tel).fase);

  const intención = detectarIntención(texto);
  let s = getSesion(tel);

  if (!s.cargado) {
    const jugador = await cargarSesion(tel, trace);
    if (jugador) {
      // ============================================================
      // CLAUDE NOTE — Recuperación post-reinicio del bot (v3.16)
      // ============================================================
      // wa_phase se persiste en DB. Pero `pendingFolio` es solo memoria.
      // Si el bot reinicia mientras user estaba en "esperando_username",
      // recuperamos la fase de DB pero pendingFolio sigue null.
      //
      // Sin este guard: el bot pediría username, user lo manda,
      // bot intentaría hacer claim de pendingFolio=null → error confuso.
      //
      // FIX: si la fase recuperada es "esperando_username" pero no hay
      // pendingFolio en memoria, degradamos a "esperando_folio" para
      // pedir el folio de nuevo. Pérdida mínima: user vuelve a pegar folio.
      // ============================================================
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
      });
    } else {
      setSesion(tel, { cargado: true, fase: "nuevo" });
    }
    s = getSesion(tel);
  }

  const username = s.username || null;
  const userId   = s.userId   || null;
  const hoy      = hoyMexico();
  let rondasHoy  = s.fechaReset === hoy ? (s.rondasHoy || 0) : 0;

  if (s.fechaReset && s.fechaReset !== hoy && userId) {
    rondasHoy = 0;
    setSesion(tel, { rondasHoy: 0, fechaReset: hoy });
    sbRpc("update_wa_profile", { p_phone: tel, p_user_id: userId, p_rondas_hoy: 0, p_fecha_reset: hoy }, trace).catch(() => {});
  }

  if (intención === "reiniciar") {
    setSesion(tel, { fase: username ? "activo" : "nuevo", intentos: 0, pendingFolio: null });
    return enviar(tel, username ? M.bienvenidaConocido(username, rondasHoy) : M.bienvenidaNuevo(), trace);
  }
  if (intención === "ayuda")       return enviar(tel, M.ayuda(username), trace);
  if (intención === "puntos")      return enviar(tel, M.puntos(), trace);
  if (intención === "premios")     return enviar(tel, M.premios(), trace);
  if (intención === "tiendas")     return enviar(tel, M.tiendas(), trace);
  if (intención === "reglas")      return enviar(tel, M.reglas(), trace);
  if (intención === "gracias")     return enviar(tel, M.gracias(username), trace);
  if (intención === "donde_folio") {
    await enviarImagen(tel, IMG_FOLIO, "📋 Tu folio: 21 dígitos que empiezan con 84", trace);
    return enviar(tel, M.dondeFolio(), trace);
  }

  if (intención === "saludo") {
    if (username) return enviar(tel, M.bienvenidaConocido(username, rondasHoy), trace);
    setSesion(tel, { fase: "esperando_folio" });
    await enviarImagen(tel, IMG_FOLIO, "📋 Tu folio: 21 dígitos que empiezan con 84", trace);
    return enviar(tel, M.bienvenidaNuevo(), trace);
  }

  // ============================================================
  // CLAUDE NOTE — Atajo desde botones del website (v3.14+)
  // ============================================================
  // El user toca "Ingresar código" en el Hub o "Nueva ronda" en PlayAgain.
  // Pre-llenado abre WhatsApp con un texto específico que cae aquí.
  // Diferencia con "saludo": no repetimos el bienvenidaNuevo completo
  // (el user ya está en flujo activo, solo quiere meter un folio).
  // ============================================================
  if (intención === "atajo_codigo") {
    if (username) {
      setSesion(tel, { fase: "esperando_folio" });
      return enviar(tel, M.atajoConocido(username, rondasHoy), trace);
    }
    // Edge case: user no registrado toca atajo sin haber pasado onboarding.
    // Trátalo como saludo normal (no rompemos el flujo).
    setSesion(tel, { fase: "esperando_folio" });
    await enviarImagen(tel, IMG_FOLIO, "📋 Tu folio: 21 dígitos que empiezan con 84", trace);
    return enviar(tel, M.bienvenidaNuevo(), trace);
  }

  if (s.fase === "esperando_username") {
    // ============================================================
    // CLAUDE NOTE — Folio durante esperando_username (v3.16)
    // ============================================================
    // Edge case: user manda folio MIENTRAS bot espera username.
    // Causas comunes:
    //   - User no leyó "elige tu username" y pegó otro folio
    //   - Cambió de opinión sobre cuál folio usar
    //   - Out-of-order delivery de Meta (folio retrasado llegó después)
    //
    // Sin este guard, los primeros 20 dígitos del folio se tratarían
    // como username candidato, validarUsername() rechazaría, y el
    // pendingFolio original se perdería en una recuperación incierta.
    //
    // Solución: detectamos `intención === "folio_input"` PRIMERO,
    // recordamos al user que aún esperamos username del folio anterior.
    // Eso le da la opción de mandar username, o usar /reiniciar para
    // empezar de cero con el folio nuevo.
    // ============================================================
    if (intención === "folio_input") {
      log.info(trace, `Folio recibido en esperando_username — pidiendo username del folio anterior`);
      return enviar(tel,
        `Antes mándame *un nombre de usuario* para tu folio anterior 👤\n\n` +
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
    // FIX v3.13: Edge Function v5 rechaza profanity contra tabla profanity_words (2,191 palabras).
    // Single source of truth = mismo blocklist que el website RegisterPage.
    if (regRes?.error === "inappropriate_username") {
      metrics.username_rejected_profanity++;
      log.info(trace, `Username rechazado por profanity: "${nombrePropuesto}"`);
      return enviar(tel, M.usernameInvalido(
        "ese nombre no se permite en la campaña.",
        null
      ), trace);
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

    // CLAUDE NOTE: igual que en flujo de re-claim (v3.16), la SQL function hace
    // incremento atómico. Pasamos null para que use sus propios COALESCE+1.
    const claimRes = await sbRpc("wa_claim_ticket", {
      p_code: pendFolio, p_user_id: newUserId, p_phone: tel,
      p_rondas_hoy: null, p_rondas_total: null, p_fecha_reset: hoy,
    }, trace);

    if (!claimRes?.success) {
      metrics.claim_fail++;
      log.error(trace, "Claim fallido tras register:", JSON.stringify(claimRes));
      setSesion(tel, { fase: "activo", username: finalUsername, userId: newUserId, pendingFolio: null });
      return enviar(tel, M.folioError(claimRes?.error || "already_used"), trace);
    }
    metrics.claim_ok++;

    // Re-leer profile post-claim para tener los valores reales que DB calculó.
    // En registro nuevo, debe ser rondasHoy=1, rondasTotal=1 (primer claim del user).
    let rondaNum = 1;
    let totalNum = 1;
    const postProfile = await sbRpc("get_wa_profile", { p_phone: tel }, trace);
    if (postProfile?.found) {
      rondaNum = postProfile.wa_rondas_hoy || 1;
      totalNum = postProfile.wa_rondas_total || 1;
    }

    setSesion(tel, {
      fase: "activo", username: finalUsername, userId: newUserId,
      rondasHoy: rondaNum, rondasTotal: totalNum, fechaReset: hoy,
      pendingFolio: null, intentos: 0,
    });

    // v3.18: sync a Engine v2 + Bot Control (async, no bloquea)
    const ahora = new Date().toISOString();
    if (AT_SYNC_JUGADORES) atEnqueue("JUGADORES", {
      fldZBWrZplpRablKb: `+${tel}`,
      fldZZQ9SENjSGwRwB: finalUsername,
      fldjhoXN41tMuSUpl: "activo",
      fldkPg41ius04MuUK: rondaNum,
      fldzQHOAWwlkUV6Kt: totalNum,
      fldaCpQQLMJYgd3Q9: ahora,
      fldML4hFVSS0XUcXR: ahora,
      fldDL3hKFCrgBrtVR: hoy,
      fldKfCxb4kIbIKzkI: pendFolio,
    });
    if (AT_SYNC_FOLIOS) atEnqueue("FOLIOS", {
      fldXTWLuxNEfW662q: pendFolio,
      fldyy9XLB7wckFpTa: `+${tel}`,
      fldxjgMJgBVF9DuSZ: pendFolio.substring(2, 7),
      fld83GKJK72uE2tkN: `20${pendFolio.substring(7,9)}-${pendFolio.substring(9,11)}-${pendFolio.substring(11,13)}`,
      fldgHP2kgPDxpprN2: ahora,
      fldzOPkSCihsFeE2k: true,
      fld36uU97d5j5zMYv: 1,
    });
    if (AT_SYNC_RONDAS) atEnqueue("RONDAS", {
      fld2buT3RXP1vexTW: `+${tel}`,
      fldRYI7XShhvhsJHg: pendFolio,
      fldTAnP4CpDhq34Mq: ahora,
      fldh4r8GDV6jr00wp: rondaNum,
      fldDjlIC66SIUbsLZ: "WhatsApp",
    });
    // v3.20: sync enriquecido con marca/tienda/estado del primer folio + IP
    // El IP lo capturamos async después de que el user use el magic link
    const storeInfoFirst = getStoreFromFolio(pendFolio);
    bcSyncUsuario(tel, "activo", storeInfoFirst, {
      username: finalUsername,
      primerContacto: true,
    }).catch(() => {});

    // Captura IP async (espera 30s a que el user dé click al magic link, luego sync)
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
  if (intención === "folio_input" || (s.fase === "esperando_folio" && looksLikeFolio)) {
    const num = texto.replace(/\s/g, "");
    const localVal = validarFormatoFolioLocal(num);
    if (!localVal.ok) {
      setSesion(tel, { intentos: (s.intentos || 0) + 1 });
      return enviar(tel, M.folioError(localVal.error), trace);
    }
    const folio = localVal.folio;
    const previewParams = userId ? { p_code: folio, p_user_id: userId } : { p_code: folio };
    const preview = await sbRpc("preview_ticket", previewParams, trace);

    // FIX v3.10: si preview es null (no es {success:false}), Supabase saturado
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
      // ============================================================
      // CLAUDE NOTE — Sync web ↔ WhatsApp antes de claim (v3.12+)
      // ============================================================
      // User puede agregar folios desde el website entre mensajes WA.
      // validate_and_claim_ticket sincroniza wa_rondas_hoy en DB (v3.12),
      // pero la sesión local del bot tiene cache de 24h.
      //
      // Sin este refresh: mostraríamos rondas viejas Y mandaríamos un
      // newTotal incorrecto al claim, sobreescribiendo con valor menor.
      //
      // FIX v3.16: sincronizamos AMBOS rondasHoy Y rondasTotal desde DB,
      // no solo rondasHoy. La variable local `s.rondasTotal` quedaba stale.
      // ============================================================
      let localRondasTotal = s.rondasTotal || 0;
      const freshProfile = await sbRpc("get_wa_profile", { p_phone: tel }, trace);
      if (freshProfile?.found) {
        const dbRondasHoy = freshProfile.wa_fecha_reset === hoy
          ? (freshProfile.wa_rondas_hoy || 0)
          : 0;
        const dbRondasTotal = freshProfile.wa_rondas_total || 0;

        // Sincronización defensiva: DB siempre gana si tiene valores más altos
        // (el web pudo haber adelantado al bot).
        if (dbRondasHoy > rondasHoy || dbRondasTotal > localRondasTotal) {
          log.info(trace, `Sync: rondasHoy ${rondasHoy}→${dbRondasHoy}, rondasTotal ${localRondasTotal}→${dbRondasTotal}`);
          rondasHoy = Math.max(rondasHoy, dbRondasHoy);
          localRondasTotal = Math.max(localRondasTotal, dbRondasTotal);
          setSesion(tel, { rondasHoy, rondasTotal: localRondasTotal });
        }
      }

      if (rondasHoy >= RONDAS_MAX) return enviar(tel, M.maxRondas(username), trace);

      // ============================================================
      // CLAUDE NOTE — Atomic counter handling (v3.16)
      // ============================================================
      // validate_and_claim_ticket incrementa atómicamente wa_rondas_hoy/total
      // dentro de la transacción. wa_claim_ticket es solo un wrapper.
      //
      // Antes el bot pasaba sus propios rondaNum/newTotal calculados desde cache,
      // que SOBREESCRIBÍAN el incremento atómico. Si web canjeaba al mismo tiempo,
      // se perdía conteo silenciosamente.
      //
      // SOLUCIÓN (v3.16): después del claim, re-leemos profile para tener
      // los valores REALES que la DB calculó atómicamente. Eso es nuestra fuente
      // de verdad para mostrar al user.
      // ============================================================
      const claimRes = await sbRpc("wa_claim_ticket", {
        p_code: folio, p_user_id: userId, p_phone: tel,
        // Los params se mantienen por compatibilidad pero la función SQL
        // ya no los usa (v3.16 migración wa_claim_ticket_atomic_counter).
        p_rondas_hoy: null, p_rondas_total: null, p_fecha_reset: hoy,
      }, trace);

      if (!claimRes?.success) {
        metrics.claim_fail++;
        return enviar(tel, M.folioError(claimRes?.error || "already_used"), trace);
      }
      metrics.claim_ok++;

      // Re-leer profile FRESH para tener los contadores REALES post-claim.
      // Esto es importante porque DB hizo el incremento atómico, no nosotros.
      let postClaimRondasHoy = rondasHoy + 1;  // fallback si el re-read falla
      let postClaimRondasTotal = localRondasTotal + 1;
      const postProfile = await sbRpc("get_wa_profile", { p_phone: tel }, trace);
      if (postProfile?.found) {
        postClaimRondasHoy = postProfile.wa_fecha_reset === hoy
          ? (postProfile.wa_rondas_hoy || postClaimRondasHoy)
          : 1;
        postClaimRondasTotal = postProfile.wa_rondas_total || postClaimRondasTotal;
      }
      setSesion(tel, { rondasHoy: postClaimRondasHoy, rondasTotal: postClaimRondasTotal, intentos: 0 });

      // v3.17: sync a Airtable (async, no bloquea respuesta al user)
      const ahoraStr = new Date().toISOString();
      if (AT_SYNC_FOLIOS) atEnqueue("FOLIOS", {
        fldXTWLuxNEfW662q: folio,
        fldyy9XLB7wckFpTa: `+${tel}`,
        fldxjgMJgBVF9DuSZ: folio.substring(2, 7),
        fld83GKJK72uE2tkN: `20${folio.substring(7,9)}-${folio.substring(9,11)}-${folio.substring(11,13)}`,
        fldgHP2kgPDxpprN2: ahoraStr,
        fldzOPkSCihsFeE2k: true,
        fld36uU97d5j5zMYv: postClaimRondasHoy,
      });
      if (AT_SYNC_RONDAS) atEnqueue("RONDAS", {
        fld2buT3RXP1vexTW: `+${tel}`,
        fldRYI7XShhvhsJHg: folio,
        fldTAnP4CpDhq34Mq: ahoraStr,
        fldh4r8GDV6jr00wp: postClaimRondasHoy,
        fldDjlIC66SIUbsLZ: "WhatsApp",
      });

      const linkRes = await waAuth("get_link", { phone: tel }, trace);
      if (!linkRes?.magic_link) {
        return enviar(tel, `✅ ¡Folio registrado, *${username}*!\nVe a *${SITE_URL}* para jugar.\nRonda *${postClaimRondasHoy}* de *${RONDAS_MAX}* hoy.`, trace);
      }
      log.info(trace, `Magic link generado: ${maskLink(linkRes.magic_link)}`);
      return enviar(tel, M.folioAdicional(username, postClaimRondasHoy, linkRes.magic_link), trace);
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
    // Checar AMBAS bases: Engine v2 y Bot Control
    // Jonny maneja broadcasts desde Bot Control ("🤖 Gol Nutriza — Bot Control")
    // Engine v2 se mantiene como fallback/legacy
    const sources = [
      // [urlBroadcastList, fnMarkEnviando, fnMarkDone]
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
        // Bot Control broadcasts — donde Jonny los gestiona
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

// ─── WEBHOOK CON HMAC VALIDATION (FIX v3.8) ─────────────────────────────────
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
  // FIX v3.8 #1: IP rate limit
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'unknown';
  if (!checkIpRate(ip)) {
    metrics.webhook_ip_blocked++;
    log.warn(null, `🚫 IP rate limit: ${ip}`);
    return res.status(429).send('rate limited');
  }

  // FIX v3.8 #2: HMAC validation
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

        // ============================================================
        // CLAUDE NOTE — Phone normalization (v3.16)
        // ============================================================
        // Meta normalmente manda E.164 sin '+', ej "5215512345678".
        // Pero defendámonos contra +, espacios, guiones, paréntesis
        // por si Meta cambia formato o por si es un mock/test.
        //
        // El Edge Function wa-auth normaliza igual con replace(/\D/g, '').
        // Mantener consistencia EVITA dedup roto: el mismo user con dos
        // formatos diferentes crearía dos sesiones, dos userLocks,
        // dos profiles. Catástrofe silenciosa.
        //
        // Validamos longitud mínima 10 dígitos (números mexicanos
        // tienen 10 sin lada país, 12-13 con). Algo menos = mock o bug.
        // ============================================================
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

// ─── ENDPOINTS DE MONITORING ────────────────────────────────────────────────
app.get("/", (_req, res) => res.json({
  status:       "ok",
  version:      VERSION,
  uptime_sec:   Math.floor((Date.now() - bootTime) / 1000),
  hoy_mx:       hoyMexico(),
  sesiones:     sesiones.size,
  stores_ready: storesCacheReady,
}));

// ─── HEALTH ENDPOINTS — un check por cada órgano del pipeline ────────────────
// FIX v3.13: /health ahora chequea cada componente independientemente.
// Si algo se rompe, sabemos EXACTAMENTE qué órgano falló.
// Esto facilita debugging cuando estás en panico bajo carga real.
//
// Componentes verificados:
//   1. Bot Railway (siempre OK si responde)
//   2. Supabase RPC (today_mx)
//   3. Supabase RLS-bypass (wa_broadcast_recipients accesible)
//   4. Supabase profanity (is_profane funciona)
//   5. Stores cache (cargada)
//   6. Edge Function wa-auth (responde)
//   7. Airtable Broadcasts (accesible)
//   8. WhatsApp/Meta token (válido)
//   9. Limiter Supabase (no saturado)
app.get("/health", async (_req, res) => {
  const checks = {};
  let allOk = true;

  // 1. Stores cache
  checks.stores_cache = storesCacheReady
    ? { status: "ok", count: storesCache.size }
    : { status: "warming", count: 0 };
  if (!storesCacheReady) allOk = false;

  // 2. Supabase today_mx
  const t0 = Date.now();
  const today = await sbRpc("today_mx", {});
  checks.supabase_rpc = today
    ? { status: "ok", today, latency_ms: Date.now() - t0 }
    : { status: "down" };
  if (!today) allOk = false;

  // 3. Supabase wa_broadcast_recipients (verifica RLS bypass)
  const t1 = Date.now();
  const recipients = await sbRpcArray("wa_broadcast_recipients", {});
  checks.supabase_broadcast_rpc = Array.isArray(recipients)
    ? { status: "ok", count: recipients.length, latency_ms: Date.now() - t1 }
    : { status: "down" };
  if (!Array.isArray(recipients)) allOk = false;

  // 4. Supabase is_profane (verifica profanity sync)
  const t2 = Date.now();
  const profCheck = await sbRpc("is_profane", { p_input: "chingar" });
  checks.supabase_profanity = (profCheck === true)
    ? { status: "ok", latency_ms: Date.now() - t2 }
    : { status: profCheck === null ? "down" : "wrong_result" };
  if (profCheck !== true) allOk = false;

  // 5. Edge Function wa-auth (echo ping)
  const t3 = Date.now();
  const efPing = await waAuth("ping", {});
  // EF responde 400 unknown_action a "ping" → significa que está VIVA.
  // Si responde unauthorized → secret roto.
  // Si responde misconfigured → falta env var en Supabase.
  checks.edge_function = efPing
    ? { status: efPing.error === "unauthorized" ? "auth_broken"
              : efPing.error === "misconfigured" ? "env_missing"
              : "ok",
        latency_ms: Date.now() - t3 }
    : { status: "down" };
  if (!efPing || ["auth_broken","env_missing","down"].includes(checks.edge_function.status)) allOk = false;

  // 6. Airtable Broadcasts table (verifica que el bot puede leer)
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

  // 7. Supabase limiter (saturación)
  const limiterUsage = (SB_LIMITER.running / SB_LIMITER.maxConcurrent * 100).toFixed(0);
  const queueUsage = (SB_LIMITER.queue.length / SB_LIMITER.maxQueue * 100).toFixed(0);
  checks.supabase_limiter = {
    status: SB_LIMITER.queue.length > 800 ? "near_saturation"
          : SB_LIMITER.running >= SB_LIMITER.maxConcurrent ? "all_busy"
          : "ok",
    running_pct: limiterUsage,
    queue_pct: queueUsage,
  };

  // 8. Sessions / userlocks memory
  checks.memory = {
    sesiones: sesiones.size,
    userlocks: userLocks.size,
    dedup: processedMsgs.size,
    rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
  };

  // 9. Circuit breaker
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

// FIX v3.8: /metrics auth opcional
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
  // Warn si seguridad opcional no activada
  if (!META_APP_SECRET) {
    log.warn(null, `⚠️ META_APP_SECRET no set — webhooks SIN validación HMAC (compatible con v3.7 pero menos seguro)`);
  } else {
    log.info(null, `🔐 META_APP_SECRET activo — webhooks validados con HMAC`);
  }
  if (!METRICS_SECRET) {
    log.warn(null, `⚠️ METRICS_SECRET no set — /metrics es público`);
  } else {
    log.info(null, `🔐 METRICS_SECRET activo — /metrics requiere bearer`);
  }
  return true;
}

async function selfCheck() {
  log.info(null, "🔍 Self-check...");
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
  setInterval(atFlush,            AT_QUEUE_FLUSH_MS);  // FIX v3.8

  // v3.20: cron diario para snapshot del Leaderboard a las 8 PM hora MX
  // Chequea cada 5 minutos. Si la hora MX es 20:00-20:04, ejecuta una vez.
  // Usa flag en memoria para no duplicar en la misma ventana.
  let lastSnapshotDate = null;
  setInterval(() => {
    const now = new Date();
    // Convertir a hora MX (CDMX = UTC-6, ajustable; horario verano UTC-5)
    const mxNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
    const hh = mxNow.getHours();
    const today = mxNow.toISOString().substring(0, 10);
    if (hh === 20 && lastSnapshotDate !== today) {
      lastSnapshotDate = today;
      log.info(null, `📊 Triggering daily leaderboard snapshot for ${today}`);
      runLeaderboardSnapshot().catch(e => log.error(null, "Leaderboard snapshot ERR:", e.message));
    }
  }, 5 * 60 * 1000);  // check every 5 min

  procesarBroadcasts().catch(() => {});
}

start().catch(e => {
  log.error(null, "Fatal startup error:", e);
  process.exit(1);
});
