// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  GOL NUTRISA — BOT v3.48 — PRODUCCIÓN                                        ║
// ║  Fanáticos del Sabor · Grupo Nutrisa · WhatsApp-native                       ║
// ║                                                                              ║
// ║  v3.48: Cooldown progresivo + folio cap dinámico (anti-fraude pentest)       ║
// ║  v3.47: Cap superior de folios por marca (mitigación brute-force)            ║
// ║  v3.46: User Blocking System — admin BLOQUEAR/DESBLOQUEAR + descalificación  ║
// ║  v3.45: Master Key infinito + refactor por secciones con candados            ║
// ║  v3.44: Dashboard ejecutivo Airtable + sync hourly                           ║
// ║  v3.43: Legal compliance — timeout sesión 6h + nombres minijuegos + fechas   ║
// ║  v3.42: Smart filters + admin commands + alerts                              ║
// ║  v3.41: Cross-réplica esperando_username refresh + MI LINK fallback BD       ║
// ║  v3.40: Anti-ghost — verificación post-op + soporte respaldo + recordatorios ║
// ║  v3.39: Short links /j/CODE — fix tap único en WhatsApp iOS                  ║
// ║  v3.38: Copy review (emojis + flechas + lenguaje formal sin slang)           ║
// ║  v3.37: Last-resort BD recovery en handlers + UX continuidad                 ║
// ║  v3.36: pendingFolio en BD + regex 21 dígitos estricto                       ║
// ║  v3.35: Caché stale-aware + retry robusto + ortografía Nutrisa               ║
// ║  v3.34: Multi-réplica safe — dedupe distribuido + fase en BD                 ║
// ╚══════════════════════════════════════════════════════════════════════════════╝
//
// ════════════════════════════════════════════════════════════════════════════════
// 📑 TABLA DE CONTENIDOS (use Ctrl+F con el §N para saltar a una sección)
// ════════════════════════════════════════════════════════════════════════════════
//
//   §0  CHANGELOG DETALLADO POR VERSIÓN
//   §1  CONFIG & CONSTANTES         — env vars, IDs, constantes legales
//   §2  CONEXIÓN A BD / SERVICIOS   — Supabase, Airtable, WhatsApp API, throttling
//   §3  HELPERS                     — logging, fetch, fechas, validators
//   §4  MENSAJES DEL BOT (M.xxx)    — todos los textos que envía el bot
//   §5  FILTROS ANTI-FRAUDE         — smart filters 6-capas + profanity
//   §6  ADMIN COMMANDS              — ESTADO, TOP10, SALUD, LIBERAR + alerts
//   §7  HANDLERS DE FASE            — esperando_username, esperando_folio, etc.
//   §8  WEBHOOK ENTRY (Meta API)    — entrada de mensajes WhatsApp
//   §9  ENDPOINTS HTTP              — /j/:code, /game-complete, /health, etc.
//   §10 BROADCASTS + CLEANUP        — procesos asíncronos
//   §11 STARTUP                     — validación env + arranque servidor
//
// ════════════════════════════════════════════════════════════════════════════════
// 🔒 CANDADOS — qué tocar y qué NO tocar
// ════════════════════════════════════════════════════════════════════════════════
//
//   ✏️ ZONAS SEGURAS PARA EDITAR:
//      • §4 MENSAJES (M.xxx): copy de los mensajes del bot. Cambiarlo no afecta
//        lógica, solo lo que el usuario lee.
//      • §1 constantes legales (fechas, premios, teléfonos): texto/datos.
//
//   ⚠️ ZONAS DE CUIDADO (editar con cautela):
//      • §5 SMART FILTERS: lógica de defensa contra abuso. Romperla = fraude.
//      • §7 HANDLERS DE FASE: máquina de estados del usuario. Romper una fase
//        rompe el flow completo.
//      • §6 ADMIN COMMANDS: si tocas los códigos o nombres, los admins pierden
//        acceso desde WhatsApp.
//
//   🔴 ZONAS PROHIBIDAS (no tocar sin tener clarísimo qué hace):
//      • §2 sbRpc, waAuth: capa de comunicación con backends. Si falla, todo
//        el bot deja de funcionar.
//      • §3 verifyMetaSignature, checkIpRate: seguridad. Romper = riesgo grave.
//      • §8 webhook handler: punto de entrada. Cualquier error = mensajes
//        perdidos.
//      • §11 startup: si falla, el bot ni arranca.
//
//   📝 REGLA GENERAL: cualquier cambio en §5, §6, §7, §8 debe probarse en
//      desarrollo antes de subir a producción. Editar §4 (mensajes) es seguro
//      hot-deploy. El frontend lo maneja un equipo separado.
//
// ════════════════════════════════════════════════════════════════════════════════
//
// ─── NUEVO EN v3.48 (26 may 2026 — Cooldown progresivo anti-fraude) ──────────
// Sistema que escala bloqueos cuando un usuario mete folios incorrectos
// repetidamente. La lógica vive en BD (preview_ticket / validate_and_claim_ticket).
// El bot solo maneja los nuevos error codes que la BD devuelve:
//
// NUEVO ERROR CODE `cooldown_active`:
//    BD responde: { error: 'cooldown_active', cooldown_level: N,
//                   minutes_remaining: X.X, cooldown_until: 'ISO' }
//    • Nivel 1 (3 errores consecutivos) → 10 min
//    • Nivel 2 (2 errores más)          → 30 min
//    • Nivel 3 (2 errores más)          → 60 min
//    • 1+ hora sin errores              → reset a nivel 0
//    Bot muestra mensaje específico con minutos restantes.
//
// ─── NUEVO EN v3.47 (26 may 2026 — Cap de folios por marca) ──────────────────
// Evita brute-force de folios futuros. La BD calcula techo dinámico por marca:
//    Nutrisa: baseline + 150 × días_desde_24may · Cielito: +100/día
//    Chilim/Moyo: +50/día · Testers/master_key exentos
//
// NUEVO ERROR CODE `folio_too_high`:
//    Folio sobrepasa el cap dinámico de la marca → mensaje específico.
//
// ─── NUEVO EN v3.46 (24 may 2026 — User Blocking System) ─────────────────────
// Sistema completo de bloqueo de usuarios por incumplimiento de T&Cs:
//
// 1) COMANDOS ADMIN desde WhatsApp:
//    • BLOQUEAR <user_or_phone> [razón opcional]  → bloquea + notifica
//    • DESBLOQUEAR <user_or_phone>                → desbloquea + limpia cache
//    • BLOQUEADOS                                 → lista todos los bloqueados
//
// 2) NOTIFICACIÓN AL BLOQUEADO:
//    • Proactiva: al momento del bloqueo, el bot envía mensaje al usuario
//      diciendo que ha sido descalificado + motivo + cómo apelar (soporte).
//    • Reactiva: si el bloqueado intenta usar el bot después, recibe mensaje
//      de recordatorio (rate-limited a 1 cada 5min para evitar spam).
//
// 3) BD: columnas blocked_at, blocked_reason, blocked_by_phone, 
//    blocked_notified_at en profiles. RPCs admin_block_user, admin_unblock_user,
//    check_user_blocked, mark_blocked_notified, admin_list_blocked_users.
//
// 4) DASHBOARD: usuarios bloqueados aparecen con status "Bloqueado" en
//    Airtable, separados de "Activo" / "Inactivo 7d+" / "Sospechoso".
//
// ─── NUEVO EN v3.45 (24 may 2026 — Master Key + Refactor) ────────────────────
// 1) MASTER KEY infinito: folios que empiezan con `999` son master keys
//    reservados para testing del equipo. Saltan TODAS las validaciones
//    (fecha, tienda, expiración, ya usado, límite diario). Cada uso:
//    • Marca al user como master_key_user (excluido del leaderboard)
//    • Se registra en master_key_log (auditable: quién, cuándo)
//    • Genera código sintético sucursal=32000 (interna)
//    Pool actual: 999000000000000000001 a 999000000000000000100
//
// 2) REFACTOR de organización con secciones §1-§11 y candados.
//    Sin cambios funcionales. Solo headers/comentarios para que el código
//    sea mantenible. Ver tabla de contenidos arriba.
//
// 3) NOMBRES PERSONALES removidos del código (Mohamed, etc.) — referencias
//    cambiadas a "equipo web" / "frontend dev" genérico.
//
// ─── NUEVO EN v3.44 (24 may 2026 — Dashboard ejecutivo) ──────────────────────
// Dashboard Airtable independiente (base appkr4nVF1hFsTWy4) con 5 tablas:
//   Snapshots Diarios, Usuarios, Tiendas, Leaderboard Top 100, Alertas Fraude.
// Edge function `dashboard-sync-airtable` con cron horario + 6h para fraude.
// 6 RPCs read-only de aggregación. CERO impacto en bot/producción.
//
// ─── NUEVO EN v3.43 (23 may 2026 — legal compliance del doc oficial) ─────────
// Auditoría del documento legal "ByMP - PIN - FANATICOS DEL SABOR - Promo
// multimarca 28_04_2026.docx" reveló inconsistencias técnicas y de copy.
// Fixes aplicados:
//
// 1) TIMEOUT SESIÓN (BD): bot_cleanup_sessions ahora usa 360 min (6h) en lugar
//    de 15 min. El documento NO marca límite para completar los 4 minijuegos
//    una vez iniciada la sesión — solo "1 hora para iniciar sesión". El timeout
//    de 15 min borraba sesión + ticket + scores si el user no completaba en
//    ese tiempo, causando pérdida de folio por interrupciones razonables.
//
// 2) NOMBRES OFICIALES DE MINIJUEGOS (copy): documentados en M.reglas según doc:
//    - Penales (Nutrisa) — ya estaba "Penalty" en frontend
//    - Paredones (Chilim Balam) — antes "Pongoal"
//    - Tiro a Puerta (Cielito Querido Café) — antes "Free Throw"
//    - La Afición (Moyo) — ya estaba correcto
//    (El cambio en frontend lo aplica el equipo web; aquí solo el copy del bot.)
//
// 3) FECHAS LEGALES (constantes): separadas CAMPAIGN_PURCHASE_END (9 jul) y
//    CAMPAIGN_REGISTER_END (12 jul, 3 días después). WINNERS_ANNOUNCE_DATE,
//    EVENTO_COTORRISA, EVENTO_LUGAR documentados.
//
// 4) TELÉFONO SOPORTE OFICIAL (copy): TELEFONO_SOPORTE_OFICIAL = 800.024.0340
//    agregado a soporteIntro como alternativa de contacto (antes solo estaba
//    en soporteTiendaContacto).
//
// 5) PREMIOS — DESCRIPCIÓN PRECISA (copy): M.premios actualizado con:
//    - "Cascarita con La Cotorrisa" (no solo "Meet & Greet")
//    - Fecha jueves 30 jul 2026
//    - Lugar Cuajimalpa CDMX
//    - 20+8+13+40 = 81 ganadores con conteos exactos por categoría
//    - Fecha anuncio ganadores 18 jul
//
// 6) MAYORÍA DE EDAD + T&Cs (copy): folioOkPideNombre agrega disclaimer:
//    "Al continuar confirmas que eres mayor de 18 años y aceptas T&Cs."
//
// ─── NUEVO EN v3.42 (23 may 2026 — defensa en profundidad para folios) ────────
// Construye 6 capas de protección que NUNCA permiten que un folio se procese
// dos veces, ni que dos usuarios racing claimen el mismo, ni que un user spamee
// folios para abusar del sistema.
//
// SMART FILTERS LAYER:
//   1) Dedup local in-memory: mismo folio del mismo user en <15s → silent skip
//   2) Dedup BD (90s window): query a folio_attempt_log para detectar duplicates
//      cross-réplica que el cache local no vió.
//   3) Spam detection: 3+ folios distintos en 90s → throttle + alerta
//   4) Insistencia detection: mismo folio rechazado 4+ veces → mensaje especial
//   5) Cross-user collision: mismo folio intentado por 2+ teléfonos → alerta
//   6) Lock distribuido en BD (folio_inflight): solo una réplica procesa a la vez
//   7) Extracción inteligente: folio en texto libre, multi-folio, truncado,
//      con dígitos de más, todos con mensajes específicos en lugar de "formato".
//
// ADMIN COMMANDS (solo desde teléfonos en admin_phones):
//   • ESTADO <username>  — info detallada de usuario
//   • TOP10              — leaderboard
//   • SALUD              — health check del sistema
//   • LIBERAR <folio>    — libera un folio canjeado (no jugado)
//
// ALERT SYSTEM:
//   • Cron anomaly_detector cada 5 min detecta ghost claims, webhooks failed,
//     tickets stuck, colisiones. Inserta en admin_alerts.
//   • Bot tiene poller que cada 30s envía alertas pendientes a admin_phones
//     via WhatsApp.
//
// ─── NUEVO EN v3.41 (22 may 2026 — cross-réplica robustness) ─────────────────
// Fixes para que el bot nunca quede "atascado" con caché viejo entre réplicas:
//
// 1) esperando_username AGREGADO al safe-phases del cache_stale_reload.
//    Bug original: réplica B tenía caché viejo (fase=esperando_username) por >3 min
//    y NO refrescaba de BD. Usuario ya registrado → respondía "Antes envíame
//    un apodo para tu folio anterior" cuando enviaba folio adicional.
//
// 2) DEFENSIVE BD CHECK en esperando_username handler: si llega folio_input,
//    consultar BD antes de responder. Si BD dice registered=true → refrescar
//    caché y re-enrutar al folio_input handler normal.
//
// 3) MI LINK FALLBACK: si waAuth("get_link") no devuelve magic_link (rate limit
//    de Supabase Auth o edge function caída), buscar el short_link activo del
//    usuario en BD y reenviarlo en lugar de decir "no tienes ronda activa".
//    Requiere RPC get_user_active_short_link.
//
// ─── NUEVO EN v3.40 (22 may 2026 — anti-ghost messages) ──────────────────────
// Objetivo: que el bot NUNCA diga "OK" cuando algo realmente falló.
// Fixes invisibles que evitan que usuarios se vayan frustrados:
//
// 1) VERIFICACIÓN POST-CLAIM: tras validate_and_claim_ticket, consultar BD
//    para confirmar que el ticket SÍ se guardó antes de enviar magic link.
//    Bug original: race con cleanup, ticket borrado pero bot decía éxito.
//
// 2) MI LINK validado: antes de mandar magic link, get_ticket_status() verifica
//    que el ticket sigue en BD. Si no → "tu folio caducó, manda otro" en lugar
//    de mandar link a sesión que el frontend va a rechazar.
//
// 3) OTRA RONDA con state real: si hay current_ticket_code pero no sesión
//    completa, reenviar link existente en vez de aceptar folio nuevo (que
//    chocaba con session_active).
//
// 4) SOPORTE con respaldo en BD: si Airtable falla, guardar en wa_support_reports
//    y decir "Reporte recibido" honestamente (la BD sí lo tiene). Antes:
//    decía "Reporte recibido" siempre, aunque Airtable estuviera caído.
//
// 5) RECORDATORIO 30 min: cron interno detecta usuarios con ticket pendiente
//    sin sesión por 30-35 min y manda nudge. Evita el caso goalsmundial_14
//    (perdió ticket porque nunca abrió link y cleanup lo borró).
//
// 6) cleanup_stuck_sessions FIX (BD): al borrar sesiones, recalcular
//    wa_puntos_total/wa_rondas_total. Antes dejaba "puntos fantasma" (ej.
//    AndySG con 930 pts sin sessions).
//
// 7) Orphan timeout 60min → 6h (BD): da tiempo a usuarios con problemas de
//    auth/browser para resolver antes de perder el ticket.
//
// ─── NUEVO EN v3.39 (22 may 2026 — short links) ─────────────────────────────
// Reemplaza el magic link largo de Supabase por un short link propio:
//   Antes: https://selxawolsjukpvzisipm.supabase.co/auth/v1/verify?token=... (250+ chars)
//   Ahora: https://fanaticosdelsabor.com/j/AB3K9X (40 chars)
//
// Flujo:
//   1. Bot recibe magic link de la edge function wa-auth
//   2. crearShortLink() genera código de 6 chars y guarda en BD (wa_short_links)
//   3. Bot envía short URL al usuario
//   4. Usuario toca link → Netlify redirect → bot endpoint GET /j/:code
//   5. Bot reclama el código → 302 al magic link real → frontend
//
// Razón del cambio: WhatsApp in-app browser (WKWebView) en iOS falla al primer
// tap con URLs largas (200+ chars con muchos query params). Con el short link,
// el primer tap funciona consistentemente.
//
// 4 puntos actualizados: registroCompleto, folioAdicional, reenvioLink, miLink
// Fallback automático: si crearShortLink falla, se envía el magic link directo.
//
// El equipo web configuró el Netlify redirect: /j/* → Railway bot /j/*
//
// ─── NUEVO EN v3.38 (22 may 2026 — copy review) ─────────────────────────────
// Pasada completa a todos los mensajes para tono más formal y profesional:
// - Eliminado slang: "qué onda" → "hola", "va" → "perfecto", "cáele" → "compra"
// - Eliminado "ahorita" → "ahora", "manda" → "envía"
// - Comandos siempre en MAYÚSCULAS (REINICIAR, CANCELAR, SOPORTE, etc)
// - Mantenidos emojis funcionales y decorativos + flechas ↳ + formato visual
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

// ════════════════════════════════════════════════════════════════════════════
// §1 · CONFIG & CONSTANTES
// ════════════════════════════════════════════════════════════════════════════
// 🔒 CANDADO: cambiar valores aquí afecta toda la lógica del bot.
//    ✏️ Seguro: VERSION, fechas legales, IMG_FOLIO, IDs de Airtable.
//    ⚠️ Cuidado: RONDAS_MAX, DIAS_VALIDEZ — afectan flow del usuario.
//    🔴 NO TOCAR: SUPABASE_URL, SECRETS, env vars — rompe todo si están mal.

// ─── ENV VARS ───────────────────────────────────────────────────────────────
const VERSION         = "3.48";
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
// IDs de tablas Airtable usadas para sincronizar tickets + estado del bot.
// 🔒 NO modificar IDs salvo que se renombren tablas en el workspace.
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

// ─── CONSTANTES DE NEGOCIO ──────────────────────────────────────────────────
// Reglas del juego, fechas legales, URLs, soporte.
// ✏️ Seguro editar: fechas legales (cuando cambie el doc), URLs, premios.
// ⚠️ Cuidado: RONDAS_MAX y DIAS_VALIDEZ afectan flow del usuario.
const RONDAS_MAX           = 5;
const DIAS_VALIDEZ         = 3;
const SITE_URL             = "https://fanaticosdelsabor.com";
const IMG_FOLIO            = "https://i.ibb.co/QFXjYbV6/6-B4-B857-F-4-DA5-47-DD-B10-A-3-CA358-ADE46-E.jpg";

// v3.43 LEGAL COMPLIANCE — fechas oficiales del doc legal
const CAMPAIGN_PURCHASE_END = "9 julio";       // último día de compra
const CAMPAIGN_REGISTER_END = "12 julio";       // último día de registro (compra + 3 días)
const CAMPAIGN_END_DATE     = CAMPAIGN_PURCHASE_END;  // alias retrocompatible
const WINNERS_ANNOUNCE_DATE = "18 de julio";    // fecha anuncio ganadores
const EVENTO_COTORRISA      = "jueves 30 de julio de 2026";
const EVENTO_LUGAR          = "Cuajimalpa, CDMX";
const TELEFONO_SOPORTE_OFICIAL = "800.024.0340";
const SOPORTE_HORARIO       = "lunes a viernes de 9:00 a 17:00 hrs (CDMX)";

const DIAS_RE_ENGAGEMENT   = 3;

const FETCH_TIMEOUT_MS     = 8000;
const EDGE_FUNC_TIMEOUT_MS = 12000;

const SESSION_TTL_MS       = 24 * 60 * 60 * 1000;
const CACHE_STALE_MS       = 3 * 60 * 1000;  // v3.35: re-cargar de BD si caché no se ha tocado en 3 min
const DEDUP_TTL_MS         =  5 * 60 * 1000;
const DEDUP_MAX_ENTRIES    = 50_000;
const USERLOCK_MAX_AGE_MS  = 60 * 1000;
const CLEANUP_INTERVAL_MS  = 10 * 60 * 1000;

// v3.42 SMART FILTERS — folio safety constants
const FOLIO_DEDUP_WINDOW_MS = 15 * 1000;     // dentro de 15s, mismo folio del mismo user → ignored
const FOLIO_INFLIGHT_TTL_MS = 30 * 1000;     // claim lock dura 30s máx
const FOLIO_RAPID_FIRE_LIMIT = 3;            // ≥3 folios distintos en 90s = throttle
const FOLIO_INSISTENT_LIMIT = 4;             // mismo folio rechazado ≥4 veces = mensaje especial
const ALERT_POLL_INTERVAL_MS = 30 * 1000;    // cada 30s, bot revisa alertas pendientes

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
    "activo", "esperando_soporte", "esperando_soporte_menu"
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

// ════════════════════════════════════════════════════════════════════════════
// §3 · HELPERS — funciones de soporte
// ════════════════════════════════════════════════════════════════════════════
// Utilidades reutilizables: logging, fechas México, validators, dedup.
// ⚠️ Cuidado al editar: si rompes verifyMetaSignature o checkIpRate, pierdes
//    protecciones de seguridad. El resto son utilitarios seguros.

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

// ════════════════════════════════════════════════════════════════════════════
// §2 · CONEXIÓN A BD / SERVICIOS EXTERNOS
// ════════════════════════════════════════════════════════════════════════════
// Capa de comunicación con Supabase, WhatsApp Cloud API, Airtable.
// 🔴 ZONA PROHIBIDA: si rompes esto, el bot no puede hablar con nada.
//    Cambios aquí requieren testing exhaustivo.

// ─── SUPABASE RATE LIMITER ──────────────────────────────────────────────────
// Throttle interno para no saturar Supabase RPC. Default: 30 req/s.
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

// ─── SHORT LINKS (v3.39) ────────────────────────────────────────────────────
const SHORT_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O/1/I para evitar confusión
function genShortCode(len = 6) {
  return Array.from({ length: len }, () =>
    SHORT_CHARS[Math.floor(Math.random() * SHORT_CHARS.length)]
  ).join("");
}

async function crearShortLink(userId, magicLinkUrl, trace) {
  try {
    const code = genShortCode();
    await sbRpc("upsert_short_link", {
      p_code:       code,
      p_user_id:    userId,
      p_magic_link: magicLinkUrl,
    }, trace);
    return `${SITE_URL}/j/${code}`;
  } catch (e) {
    log.warn(trace, "crearShortLink falló — usando magic link directo:", e.message);
    return magicLinkUrl; // fallback: enviar link largo si algo falla
  }
}

// ─── ANTI-GHOST: verificación de estado real del ticket (v3.40) ──────────────
// Devuelve { has_ticket, has_session, session_complete, ticket_code, ... }
// Usado antes de mensajes optimistas (MI LINK, OTRA RONDA, post-registro).
async function getTicketStatus(userId, code, trace) {
  if (!userId) return null;
  try {
    const result = await sbRpc("get_ticket_status", {
      p_user_id: userId,
      p_code: code || null,
    }, trace);
    return result;
  } catch (e) {
    log.warn(trace, `getTicketStatus error: ${e.message}`);
    return null;
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
  if (!AIRTABLE_TOKEN) return false;
  if (!BC_SOPORTE) {
    log.warn(null, `bcSyncSoporte: BC_SOPORTE_TABLE_ID no configurado en env, skipping`);
    return false;
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

    const res = await fetchTimeout(bcUrl(BC_SOPORTE), {
      method: "POST",
      headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ records: [{ fields }] }),
    }, 8000);
    if (!res.ok) {
      throw new Error(`Airtable HTTP ${res.status}`);
    }
    metrics.soporte_tickets_created++;
    log.info(null, `🆘 Ticket soporte creado: ${tel} - "${String(mensaje).substring(0, 40)}..."`);
    return true;
  } catch (e) {
    log.warn(null, `bcSyncSoporte fail: ${e.message}`);
    throw e;  // v3.40: propagar para que el caller pueda registrar respaldo en BD
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
// §4 · MENSAJES DEL BOT (M.xxx)
// ════════════════════════════════════════════════════════════════════════════
// Todos los textos que el bot envía al usuario por WhatsApp.
// ✏️ ZONA SEGURA: cambiar copy aquí solo afecta lo que el usuario lee.
//    Hot-deploy sin riesgo. Mantener las claves (bienvenidaNuevo, folioError,
//    etc.) — son las que se invocan desde los handlers.

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

🎫 *Envíame tu folio para jugar.*

(O escribe *PUNTOS* para ver tu posición.)`;
    }
    return `¡Hola, *${username}*! 👋

Llevas *${rondasHoy}/${RONDAS_MAX}* rondas hoy. Te quedan *${RONDAS_MAX - rondasHoy}*.

🎫 *Envíame tu siguiente folio para jugar otra ronda.*

(O escribe *PUNTOS* para ver tu posición.)`;
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

💡 Ese apodo te identificará durante toda la campaña. Elígelo con cuidado.

🔞 _Al continuar confirmas que eres mayor de 18 años y aceptas los términos y condiciones de la promoción._`;
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

⏱️ Tienes hasta *6 horas* para completar la ronda antes de que el folio se libere.
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

La campaña concluyó el *${CAMPAIGN_PURCHASE_END}*. ¡Gracias por jugar! ⚽

📢 Los ganadores se anunciarán el *${WINNERS_ANNOUNCE_DATE}* en las redes oficiales de Nutrisa, Moyo, Cielito Querido Café y Chilim Balam.

🔗 Consulta el sitio en ${SITE_URL}`,

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

(Si no completas en 6 horas, el folio se libera automáticamente.)

💡 ¿Perdiste el link? Escribe *MI LINK* para reenviártelo.`,

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

      // v3.47: folio supera el cap dinámico por marca
      folio_too_high:
`Ese folio no es válido para esta campaña 📋

El número de folio está fuera del rango esperado para esta marca.

💡 Verifica que copiaste el folio completo — debe ser *21 dígitos* exactos empezando con *84*.

Si el ticket es reciente y legítimo, escribe *SOPORTE*.`,
    };
    return msgs[error] || `No pude validar ese folio. Verifica que esté completo y envíalo de nuevo.

💡 Si consideras que algo no está bien, escribe *SOPORTE*.`;
  },

  // v3.48: cooldown progresivo — recibe nivel y minutos restantes de la BD
  cooldownActivo: (level, minutesRemaining) => {
    const mins = Math.ceil(minutesRemaining || 1);
    const levelMsgs = {
      1: `Mandaste varios folios incorrectos seguidos 🛑`,
      2: `Sigues mandando folios incorrectos 🛑`,
      3: `Tu cuenta está en bloqueo temporal por múltiples intentos fallidos 🛑`,
    };
    const intro = levelMsgs[level] || `Tu cuenta está en pausa temporal 🛑`;
    return `${intro}

Puedes volver a intentarlo en *${mins} minuto${mins !== 1 ? 's' : ''}*.

💡 Si tienes un folio válido y crees que es un error, escribe *SOPORTE*.`;
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

  // v3.46: mensajes para usuarios bloqueados/descalificados
  usuarioBloqueado: (reason) =>
`🚫 *Tu cuenta ha sido descalificada*

Tu participación en la promoción *Fanáticos del Sabor* ha sido suspendida por incumplimiento de los Términos y Condiciones de la campaña.

📝 *Motivo:* ${reason || 'Incumplimiento de términos y condiciones'}

Esto significa que:
• No podrás canjear más folios
• No serás elegible para premios
• Tu puntuación queda invalidada

Si consideras que esto es un error y quieres apelar la decisión, contacta a soporte:
📞 *800.024.0340* (L-V 9:00 a 17:00 CDMX)

_Esta es una decisión final tomada por los administradores de la promoción conforme a las bases publicadas en fanaticosdelsabor.com_`,

  usuarioBloqueadoRecordatorio: () =>
`🚫 *Cuenta descalificada*

Tu participación sigue suspendida. Para apelar, contacta soporte: *800.024.0340* (L-V 9-17h CDMX).`,

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

🥇 *Premio Mayor* (20 ganadores)
↳ Pase a una *cascarita con La Cotorrisa* ⚽
↳ ${EVENTO_COTORRISA}
↳ ${EVENTO_LUGAR}

🥈 *Primer Premio Adicional* (8 ganadores)
↳ *Nintendo Switch 2* 🎮

🥉 *Segundo Premio Adicional* (13 ganadores)
↳ *Set LEGO WC 26* 🧱

🏅 *Tercer Premio Adicional* (40 ganadores)
↳ *Playera autografiada por La Cotorrisa* 👕

💪 *Cómo subir en el ranking:*
↳ Juega tus *${RONDAS_MAX} rondas diarias*
↳ Mejora tu puntaje en cada juego
↳ Acumula puntos durante toda la campaña

📅 *Fechas clave:*
↳ Compra hasta el *${CAMPAIGN_PURCHASE_END}*
↳ Registro de tickets hasta el *${CAMPAIGN_REGISTER_END}*
↳ Ganadores anunciados el *${WINNERS_ANNOUNCE_DATE}*

📊 Para ver tu posición → *PUNTOS*`,

  tiendas: () =>
`🏪 *Tiendas participantes:*

🥑 *Nutrisa*
↳ Todas las tiendas a nivel nacional
↳ _Excepto:_ Liverpool y Fábricas de Francia

🍦 *Moyo*
↳ Todas las tiendas a nivel nacional
↳ _Excepto:_ Palacio de Hierro y Mini Moyo

☕ *Cielito Querido Café*
↳ Todas las cafeterías a nivel nacional
↳ _Excepto:_ Cinemex Market

🌮 *Chilim Balam*
↳ Todas las tiendas a nivel nacional
↳ _Excepto:_ Cinemex

🎫 Cualquier compra te da un ticket con folio para jugar.

💡 *Importante:* solo aceptamos folios emitidos durante la vigencia de la promoción.`,

  reglas: () =>
`📋 *Reglas de la campaña:*

🎫 *1 folio = 1 ronda* (4 minijuegos)
🎮 Máximo *${RONDAS_MAX} rondas* al día (5 tickets por día)
📅 Ticket válido por *${DIAS_VALIDEZ} días* desde la compra
🏆 Los puntos *se acumulan* durante toda la campaña
🌅 Las rondas se reinician a *medianoche (hora CDMX)*
🔒 Cada folio se usa *una sola vez* — no lo compartas
👤 *Un WhatsApp = una cuenta* — no se permiten cuentas duplicadas
🔞 Solo para *mayores de 18 años*

⚽ *Los 4 minijuegos:*
↳ *Penales* (Nutrisa)
↳ *Paredones* (Chilim Balam)
↳ *Tiro a Puerta* (Cielito Querido Café)
↳ *La Afición* (Moyo)

📅 *Fechas clave:*
↳ Compra hasta el *${CAMPAIGN_PURCHASE_END}*
↳ Registro de tickets hasta el *${CAMPAIGN_REGISTER_END}*

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

  soporteMenu: () =>
`🆘 *¿Sobre qué necesitas ayuda?*

*1️⃣* Problemas con el juego, folio, link o registro
*2️⃣* Dudas sobre productos, tienda, servicio Nutrisa

Responde con *1* o *2*.

(Si cambias de opinión, escribe *CANCELAR*.)`,

  soporteIntro: () =>
`🎮 *Te pondremos en contacto con un humano de Grupo Nutrisa.*

Descríbenos en una sola frase qué necesitas. Por ejemplo:
↳ "Mi folio está dañado"
↳ "Alguien usó mi folio"
↳ "No me llega el link"
↳ "El juego no guardó mi puntaje"

📩 Un humano te contestará en *menos de 24 horas* (lunes a viernes, 9:00 a 18:00 CDMX).

📞 ¿Prefieres llamar? *${TELEFONO_SOPORTE_OFICIAL}* (${SOPORTE_HORARIO}).

💡 Sugerencia: si no has recibido tu link, escribe *MI LINK* para generar uno nuevo.

(Si cambias de opinión, escribe *CANCELAR*.)`,

  soporteTiendaContacto: () =>
`🛍️ *Para dudas de tienda, producto o servicio Nutrisa:*

📞 *Teléfono:* ${TELEFONO_SOPORTE_OFICIAL}
📧 *Correo:* mesadeayuda@nutrisa.com
🕐 *Horario:* ${SOPORTE_HORARIO}

Atención disponible durante la vigencia de la promoción.

🎮 Si tu duda era del juego, escribe *SOPORTE* otra vez y elige la opción *1*.`,

  soporteMenuReintenta: () =>
`Por favor responde con *1* o *2*:

*1️⃣* Problemas con el juego
*2️⃣* Dudas de tienda, producto, servicio

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

// ════════════════════════════════════════════════════════════════════════════
// §5 · FILTROS ANTI-FRAUDE — Smart Filters Layer (6 capas)
// ════════════════════════════════════════════════════════════════════════════
// Defensa en profundidad contra folio reuse, race conditions, spam.
// 🔴 ZONA CRÍTICA: romper esto = fraude posible. No editar sin testear.
//
// Capas:
//  1. lastFolioByUser  — cache local in-memory de último folio por user (15s)
//  2. tryAcquireFolioLock — lock distribuido en BD (evita race cross-réplica)
//  3. detectFolioSpamPattern — rapid-fire, insistencia
//  4. detectCrossUserCollision — dos users + mismo folio (posible robo)
//  5. extraerFolioInteligente — multi-folio, embedded en texto, formato
//  6. logFolioAttempt — auditoría de TODO intento
//
// La idea: si esta capa intercepta un problema, NUNCA llegamos a
// validate_and_claim_ticket dos veces para el mismo (user, folio).

// ── Capa 1: cache local in-memory (rápido, sin RTT a BD) ────────
// Map<phone, { folio, ts, outcome }>
const lastFolioByUser = new Map();

// v3.46: rate-limit del mensaje de descalificación a usuarios bloqueados.
// Evita spam si el usuario manda muchos mensajes seguidos.
// Map<phone, last_notify_ts_ms>. TTL: 5 minutos.
const blockedNotifyRateLimit = new Map();
const BLOCKED_NOTIFY_COOLDOWN_MS = 5 * 60 * 1000;

function registerLastFolio(tel, folio, outcome) {
  lastFolioByUser.set(tel, { folio, ts: Date.now(), outcome });
  // Limpieza simple: si crece >5000, recorta los más viejos
  if (lastFolioByUser.size > 5000) {
    const entries = [...lastFolioByUser.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 1000; i++) lastFolioByUser.delete(entries[i][0]);
  }
}

function checkLocalFolioDedup(tel, folio) {
  const last = lastFolioByUser.get(tel);
  if (!last) return { duplicate: false };
  if (last.folio !== folio) return { duplicate: false };
  const ageMs = Date.now() - last.ts;
  if (ageMs > FOLIO_DEDUP_WINDOW_MS) return { duplicate: false };
  return { duplicate: true, ageMs, outcome: last.outcome };
}

// ── Capa 2: lock distribuido en BD ──────────────────────────────
async function tryAcquireFolioLock(folio, userId, tel, trace) {
  try {
    const res = await sbRpc("try_lock_folio_inflight", {
      p_folio: folio,
      p_user_id: userId,
      p_phone: tel,
      p_trace: trace || null,
    }, trace);
    return res || { acquired: false };
  } catch (e) {
    log.warn(trace, `tryAcquireFolioLock failed: ${e.message} — proceeding anyway`);
    return { acquired: true, soft_fallback: true }; // si BD falla, no bloqueamos
  }
}

async function releaseFolioLock(folio, trace) {
  try {
    await sbRpc("release_folio_inflight", { p_folio: folio }, trace);
  } catch (e) {
    log.warn(trace, `releaseFolioLock failed: ${e.message}`);
  }
}

// ── Capa 3: detección de patrones de spam ───────────────────────
async function detectFolioSpam(tel, folio, trace) {
  try {
    return await sbRpc("detect_folio_spam_pattern", {
      p_phone: tel, p_current_folio: folio,
    }, trace);
  } catch (e) {
    log.warn(trace, `detectFolioSpam failed: ${e.message}`);
    return null;
  }
}

// ── Capa 4: colisión cross-user ─────────────────────────────────
async function detectCrossUserCollision(folio, userId, trace) {
  if (!userId) return { collision_detected: false };
  try {
    return await sbRpc("detect_cross_user_collision", {
      p_folio: folio, p_current_user_id: userId,
    }, trace);
  } catch (e) {
    log.warn(trace, `detectCrossUserCollision failed: ${e.message}`);
    return { collision_detected: false };
  }
}

// ── Capa 5: extracción inteligente de folios ────────────────────
// Maneja: folio en texto libre, multi-folio, folios truncados, typos comunes
function extraerFolioInteligente(texto) {
  if (!texto || typeof texto !== 'string') return { found: false, reason: 'no_folio' };

  // Quitar espacios, guiones, puntos comunes — pero no dígitos
  const normalized = texto.replace(/[\s\-\.\,]/g, '');
  
  // Caso 1: exactamente 21 dígitos, sin nada más
  if (/^\d{21}$/.test(normalized)) {
    if (normalized.startsWith('84')) {
      return { found: true, folio: normalized, confidence: 'high', method: 'exact' };
    } else {
      return { found: false, reason: 'wrong_prefix', value: normalized.substring(0, 2) };
    }
  }

  // Detectar TODAS las "runs" de dígitos en el texto
  const allRuns = [...texto.matchAll(/\d+/g)].map(m => ({ value: m[0], idx: m.index }));
  
  // Folios válidos = runs de exactamente 21 dígitos empezando con 84
  const validFolios = allRuns
    .filter(r => r.value.length === 21 && r.value.startsWith('84'))
    .map(r => r.value);
  
  // Caso 2: múltiples folios distintos detectados
  if (validFolios.length > 1) {
    const unique = [...new Set(validFolios)];
    if (unique.length > 1) {
      return { 
        found: true, 
        folio: unique[0], 
        confidence: 'medium', 
        method: 'multi',
        others: unique.slice(1),
      };
    }
    return { found: true, folio: unique[0], confidence: 'high', method: 'exact_repeated' };
  }
  
  // Caso 3: exactamente un folio válido embebido en texto
  if (validFolios.length === 1) {
    return { found: true, folio: validFolios[0], confidence: 'high', method: 'embedded' };
  }
  
  // Caso 4: hay run(s) de dígitos pero ninguno es 21+84. Diagnóstico:
  // Considerar runs de 17 a 60 dígitos (cubrir hasta 3 folios pegados)
  const candidateRun = allRuns
    .map(r => r.value)
    .filter(v => v.length >= 17 && v.length <= 60)
    .reduce((longest, current) => current.length > longest.length ? current : longest, '');
  
  if (candidateRun) {
    if (candidateRun.length < 21) {
      return { 
        found: false, 
        reason: 'too_short', 
        missing_digits: 21 - candidateRun.length,
        value: candidateRun,
      };
    } else if (candidateRun.length > 21) {
      return { 
        found: false, 
        reason: 'too_long', 
        extra_digits: candidateRun.length - 21,
        value: candidateRun,
      };
    } else if (candidateRun.length === 21) {
      return { found: false, reason: 'wrong_prefix', value: candidateRun.substring(0, 2) };
    }
  }

  return { found: false, reason: 'no_folio' };
}

// ── Capa 6: log de intentos (fire-and-forget) ───────────────────
function logFolioAttempt(tel, userId, folio, attemptType, outcome, trace) {
  sbRpc("log_folio_attempt", {
    p_phone: tel,
    p_user_id: userId || null,
    p_folio: folio,
    p_attempt_type: attemptType,
    p_outcome: outcome,
  }, trace).catch(() => {
    metrics.folio_attempt_log_fail = (metrics.folio_attempt_log_fail || 0) + 1;
  });
}

// ── Helper: orquestador completo para procesar un folio ─────────
// Devuelve { allow: bool, response?: string, reason?: string, telemetry?: {} }
// Si allow=false, response contiene mensaje a enviar al user (o null si silent skip).
async function smartFolioGate(tel, folio, userId, trace) {
  // Filtro 1: dedup local (mismo folio del mismo user en <15s)
  const localDup = checkLocalFolioDedup(tel, folio);
  if (localDup.duplicate) {
    metrics.smart_filter_dedup_local = (metrics.smart_filter_dedup_local || 0) + 1;
    log.info(trace, `SMART FILTER: dedup local — folio ${folio} repetido ${Math.round(localDup.ageMs/1000)}s atrás`);
    logFolioAttempt(tel, userId, folio, 'duplicate_send', 'blocked_local', trace);
    // Si la primera fue exitosa, recordatorio amable
    if (localDup.outcome === 'success') {
      return { 
        allow: false, 
        response: `Ya recibí ese folio hace unos segundos ✅\n\nDame un momento para procesarlo. Si no recibes el link en 30s, escribe *MI LINK*.`,
      };
    }
    return { 
      allow: false, 
      response: null, // silent skip — el primero ya está procesando
    };
  }

  // Filtro 2: patrón de spam en BD (últimos 90s)
  const spam = await detectFolioSpam(tel, folio, trace);
  if (spam?.is_duplicate_send && spam.same_folio_recent_count > 1) {
    metrics.smart_filter_dedup_bd = (metrics.smart_filter_dedup_bd || 0) + 1;
    log.info(trace, `SMART FILTER: dedup BD — ${spam.same_folio_recent_count} intentos del mismo folio`);
    logFolioAttempt(tel, userId, folio, 'duplicate_send', 'blocked_bd', trace);
    return { 
      allow: false,
      response: `Estoy procesando ese folio, *espera un momento* 🕐\n\nSi no recibes respuesta en 30s, escribe *MI LINK*.`,
    };
  }

  if (spam?.is_rapid_fire) {
    metrics.smart_filter_rapid_fire = (metrics.smart_filter_rapid_fire || 0) + 1;
    log.warn(trace, `SMART FILTER: rapid-fire detected — ${spam.distinct_folios_in_90s} folios distintos en 90s`);
    logFolioAttempt(tel, userId, folio, 'preview', 'rate_limited', trace);
    // Crear alerta crítica si es un patrón muy agresivo (5+ folios)
    if (spam.distinct_folios_in_90s >= 5) {
      sbRpc("create_alert", {
        p_severity: 'warn',
        p_category: 'spam',
        p_message: `Usuario ${tel} mandó ${spam.distinct_folios_in_90s} folios en 90s — posible abuso`,
        p_metadata: { phone: tel, count: spam.distinct_folios_in_90s },
      }, trace).catch(() => {});
    }
    return {
      allow: false,
      response: `Estás enviando muchos folios muy rápido 🛑\n\nEspera 1 minuto antes de mandar otro.\n\nSi tienes problemas, escribe *SOPORTE*.`,
    };
  }

  if (spam?.is_insistent) {
    metrics.smart_filter_insistent = (metrics.smart_filter_insistent || 0) + 1;
    log.info(trace, `SMART FILTER: insistencia — ${spam.same_folio_recent_count} intentos del mismo folio`);
    logFolioAttempt(tel, userId, folio, 'duplicate_send', 'blocked_insistent', trace);
    return {
      allow: false,
      response: `Ese folio ya lo intentamos varias veces 🤔\n\nSi crees que es un error, escribe *SOPORTE* y un humano lo revisará.\n\n¿Tienes otro ticket? Mándalo.`,
    };
  }

  // Filtro 3: colisión cross-user (si tenemos userId)
  if (userId) {
    const collision = await detectCrossUserCollision(folio, userId, trace);
    if (collision?.collision_detected && collision.other_attempters_count > 0) {
      metrics.smart_filter_collision = (metrics.smart_filter_collision || 0) + 1;
      log.warn(trace, `SMART FILTER: colisión cross-user — folio ${folio} también intentado por ${collision.other_attempters_count} otros teléfonos`);
      // No bloqueamos, pero alertamos a admins
      sbRpc("create_alert", {
        p_severity: 'critical',
        p_category: 'collision',
        p_message: `Folio ${folio.slice(-6)} intentado por ${collision.other_attempters_count + 1} teléfonos en 5 min`,
        p_metadata: { folio, current_user: userId, other_phones: collision.other_phones },
      }, trace).catch(() => {});
    }
  }

  // Filtro 4: lock distribuido — adquirir antes de procesar
  if (userId) {
    const lock = await tryAcquireFolioLock(folio, userId, tel, trace);
    if (!lock.acquired) {
      metrics.smart_filter_inflight_blocked = (metrics.smart_filter_inflight_blocked || 0) + 1;
      log.info(trace, `SMART FILTER: folio ${folio} ya está in-flight (${lock.held_seconds}s, same_phone=${lock.same_phone})`);
      logFolioAttempt(tel, userId, folio, 'inflight_blocked', 'blocked', trace);
      // Si el lock es del MISMO phone, es retry duplicado
      if (lock.same_phone) {
        return {
          allow: false,
          response: `Ya estoy procesando ese folio, dame ${Math.max(5, Math.round(30 - lock.held_seconds))}s ⏱️`,
        };
      }
      // Si es de OTRO phone, alguien más lo tiene — race entre users (cross-user)
      sbRpc("create_alert", {
        p_severity: 'critical',
        p_category: 'collision',
        p_message: `RACE detectado: ${tel} intentó folio ${folio.slice(-6)} mientras ${lock.held_by_phone} lo procesaba`,
        p_metadata: { folio, attempter: tel, holder: lock.held_by_phone },
      }, trace).catch(() => {});
      return {
        allow: false,
        response: `Hubo un problema temporal con ese folio 🔄\n\nIntenta de nuevo en 30 segundos. Si persiste, escribe *SOPORTE*.`,
      };
    }
  }

  return { allow: true, telemetry: { spam, has_lock: !!userId } };
}

// ════════════════════════════════════════════════════════════════════════════
// §6 · ADMIN COMMANDS — comandos especiales desde teléfono admin
// ════════════════════════════════════════════════════════════════════════════
// Permite que admins manejen el bot por WhatsApp sin entrar a BD.
// Comandos: ESTADO <user>, TOP10, SALUD, LIBERAR <folio>.
// ⚠️ Cuidado: si tocas los códigos o el cache de admin_phones, los admins
//    pierden acceso. Para agregar admin nuevo: INSERT en tabla admin_phones.
const adminPhonesCache = new Set();
let adminPhonesLastSync = 0;

async function refreshAdminPhones(trace) {
  if (Date.now() - adminPhonesLastSync < 5 * 60 * 1000) return;
  try {
    const res = await sbGet('admin_phones?active=eq.true&select=phone', trace);
    if (Array.isArray(res)) {
      adminPhonesCache.clear();
      res.forEach(r => adminPhonesCache.add(r.phone));
      adminPhonesLastSync = Date.now();
      log.info(trace, `Admin phones refreshed: ${adminPhonesCache.size} active`);
    }
  } catch (e) {
    log.warn(trace, `refreshAdminPhones failed: ${e.message}`);
  }
}

function isAdminPhoneLocal(tel) {
  return adminPhonesCache.has(tel);
}

// Comandos admin reconocidos:
//   ESTADO <username>     — info de usuario
//   TOP10                  — leaderboard top 10
//   SALUD                  — health check
//   LIBERAR <folio>        — liberar folio canjeado
function detectAdminCommand(texto) {
  const t = texto.trim();
  const upper = t.toUpperCase();

  // ESTADO <username>
  const mEstado = t.match(/^ESTADO\s+([a-zA-Z0-9_]{3,20})$/i);
  if (mEstado) return { cmd: 'estado', arg: mEstado[1] };

  // TOP <n> o TOP10 etc.
  const mTop = upper.match(/^TOP\s*(\d{1,3})?$/);
  if (mTop) return { cmd: 'top', arg: parseInt(mTop[1] || '10', 10) };

  if (upper === 'SALUD' || upper === 'HEALTH' || upper === 'STATUS') return { cmd: 'salud' };

  // LIBERAR <folio>
  const mLib = t.match(/^LIBERAR\s+(84\d{19})$/i);
  if (mLib) return { cmd: 'liberar', arg: mLib[1] };

  // BLOQUEAR <user_or_phone> [razón opcional]
  const mBlock = t.match(/^BLOQUEAR\s+(\S+)(?:\s+(.+))?$/i);
  if (mBlock) return { cmd: 'bloquear', arg: mBlock[1], reason: mBlock[2] };

  // DESBLOQUEAR <user_or_phone>
  const mUnblock = t.match(/^DESBLOQUEAR\s+(\S+)$/i);
  if (mUnblock) return { cmd: 'desbloquear', arg: mUnblock[1] };

  // BLOQUEADOS — listar todos los bloqueados
  if (upper === 'BLOQUEADOS') return { cmd: 'bloqueados' };

  return null;
}

async function handleAdminCommand(tel, cmd, trace) {
  log.info(trace, `Admin command from ${tel}: ${cmd.cmd}(${cmd.arg || ''})`);
  metrics.admin_commands = (metrics.admin_commands || 0) + 1;

  try {
    switch (cmd.cmd) {
      case 'estado': {
        const res = await sbRpc("admin_get_user_state", { p_admin_phone: tel, p_username: cmd.arg }, trace);
        if (!res?.found) {
          return enviar(tel, `❌ No encontré usuario *${cmd.arg}*.\n\nPrueba con otro apodo o revisa que esté bien escrito.`, trace);
        }
        const p = res.profile;
        const tickets = res.tickets || [];
        const sessions = res.sessions || [];
        const attempts = res.recent_attempts || [];
        const blocked = p.wa_blocked ? `\n🚫 BLOQUEADO: ${p.wa_block_reason || '(sin razón)'}` : '';
        const ticketsStr = tickets.length === 0 ? '_(sin tickets)_' :
          tickets.slice(0, 5).map(t => 
            `  · ${t.code.slice(-6)} ${t.has_session ? (t.session_complete ? '✅' : '🎮') : '⏳'}`
          ).join('\n');
        const attemptsStr = attempts.length === 0 ? '_(sin intentos recientes)_' :
          attempts.slice(0, 5).map(a => 
            `  · ${a.folio.slice(-6)} → ${a.outcome}`
          ).join('\n');
        const msg = `📋 *Estado de ${p.wa_username}*\n\n` +
          `📱 ${p.wa_phone}\n` +
          `📊 ${p.wa_puntos_total} pts · ${p.wa_rondas_total} rondas (hoy: ${p.wa_rondas_hoy})\n` +
          `🎫 Folio actual: ${p.current_ticket_code ? p.current_ticket_code.slice(-6) : '_(ninguno)_'}\n` +
          `📍 Fase: ${p.wa_phase || 'desconocido'}${blocked}\n\n` +
          `*Tickets recientes:*\n${ticketsStr}\n\n` +
          `*Intentos últimas 24h:*\n${attemptsStr}`;
        return enviar(tel, msg, trace);
      }

      case 'top': {
        const n = Math.min(Math.max(cmd.arg || 10, 1), 25);
        const list = await sbRpc("admin_top_n", { p_admin_phone: tel, p_n: n }, trace);
        if (!Array.isArray(list)) {
          return enviar(tel, `❌ Error obteniendo top ${n}`, trace);
        }
        const lines = list.map(r => `${r.rank}. *${r.user}* — ${fmt(r.puntos)} pts (${r.rondas}r)`).join('\n');
        return enviar(tel, `🏆 *Top ${n}*\n\n${lines}`, trace);
      }

      case 'salud': {
        const h = await sbRpc("admin_health_check", { p_admin_phone: tel }, trace);
        if (h?.error) return enviar(tel, `❌ ${h.error}`, trace);
        const top3 = (h.leaderboard_top3 || []).map((t, i) => `${i+1}. ${t.user}: ${fmt(t.pts)}`).join('\n');
        const msg = `🏥 *Salud del sistema*\n` +
          `_${h.fecha_hora}_\n\n` +
          `👥 Usuarios: ${h.usuarios_registrados} reg · ${h.usuarios_con_puntos} con pts\n` +
          `🎫 Tickets: ${h.tickets_canjeados_total} total\n` +
          `   ⏳ Pendientes: ${h.tickets_pendientes_jugar}\n` +
          `   🚨 Atascados (>2h): ${h.tickets_pendientes_atascados}\n` +
          `🎮 Rondas: ${h.rondas_jugadas_total} total · ${h.rondas_hoy} hoy\n\n` +
          `📡 *Última hora*\n` +
          `   Webhooks: ${h.webhooks_ultima_hora} (${h.webhooks_fallidos_ultima_hora} fail)\n` +
          `   Folio attempts: ${h.folio_attempts_ultima_hora} (${h.folio_attempts_blocked_ultima_hora} blocked)\n\n` +
          `🔒 In-flight: ${h.folios_inflight_ahora}\n` +
          `🔗 Short links activos: ${h.short_links_activos}\n` +
          `📨 Soporte pendiente: ${h.soporte_reports_pendientes}\n\n` +
          `🏆 *Top 3*\n${top3}`;
        return enviar(tel, msg, trace);
      }

      case 'liberar': {
        const res = await sbRpc("admin_release_folio", { p_admin_phone: tel, p_folio: cmd.arg }, trace);
        if (res?.error) {
          return enviar(tel, `❌ No se pudo liberar ${cmd.arg.slice(-6)}: ${res.error}\n${res.hint || ''}`, trace);
        }
        return enviar(tel, `✅ Folio ${cmd.arg.slice(-6)} liberado.\n\nEl usuario que lo tenía ahora puede canjearlo de nuevo (o tú).`, trace);
      }

      case 'bloquear': {
        const reason = cmd.reason && cmd.reason.length >= 3 
          ? cmd.reason.slice(0, 200) 
          : 'Incumplimiento de términos y condiciones';
        const res = await sbRpc("admin_block_user", {
          p_target_identifier: cmd.arg,
          p_admin_phone: tel,
          p_reason: reason,
        }, trace);
        if (!res?.ok) {
          const errMap = {
            'not_admin': '🚫 No autorizado.',
            'user_not_found': `❌ No encontré usuario *${cmd.arg}*.\n\nUsa el apodo o el teléfono completo.`,
            'already_blocked': `⚠️ *${res.username}* ya estaba bloqueado.`,
          };
          return enviar(tel, errMap[res?.error] || `❌ Error: ${res?.error || 'desconocido'}`, trace);
        }
        log.warn(trace, `🚫 ADMIN BLOCK: ${res.username} bloqueado por ${tel}: ${reason}`);
        metrics.users_blocked = (metrics.users_blocked || 0) + 1;
        
        // v3.46: invalidar cache local del bloqueado (próximo msg → re-load BD → detecta)
        const blockedPhone = res.phone;
        if (blockedPhone) {
          sesiones.delete(blockedPhone);
          log.info(trace, `🧹 Cache local de ${blockedPhone} invalidada tras bloqueo`);
          
          // Notificación PROACTIVA: avisar al usuario AHORA (no esperar a que escriba)
          // Fire-and-forget: si falla (ej. user no tiene WA, número inválido), no rompe el flow del admin
          enviar(blockedPhone, M.usuarioBloqueado(reason), trace)
            .then(() => {
              sbRpc("mark_blocked_notified", { p_phone: blockedPhone }, trace).catch(() => {});
              blockedNotifyRateLimit.set(blockedPhone, Date.now());
              log.info(trace, `✅ Notificación proactiva enviada a ${blockedPhone}`);
            })
            .catch(e => log.warn(trace, `⚠️ No se pudo notificar proactivamente a ${blockedPhone}: ${e.message}`));
        }
        
        return enviar(tel, 
          `🚫 *${res.username}* BLOQUEADO ✅\n\n` +
          `📱 ${res.phone}\n` +
          `📝 Razón: ${res.reason}\n\n` +
          `📤 *Notificación enviada al usuario* — recibirá mensaje de descalificación en WhatsApp ahora.\n\n` +
          `Para desbloquear: *DESBLOQUEAR ${res.username}*`,
          trace);
      }

      case 'desbloquear': {
        const res = await sbRpc("admin_unblock_user", {
          p_target_identifier: cmd.arg,
          p_admin_phone: tel,
        }, trace);
        if (!res?.ok) {
          const errMap = {
            'not_admin': '🚫 No autorizado.',
            'user_not_found': `❌ No encontré usuario *${cmd.arg}*.`,
            'not_blocked': `⚠️ *${res.username}* no estaba bloqueado.`,
          };
          return enviar(tel, errMap[res?.error] || `❌ Error: ${res?.error || 'desconocido'}`, trace);
        }
        log.info(trace, `✅ ADMIN UNBLOCK: ${res.username} desbloqueado por ${tel}`);
        
        // v3.46: invalidar cache local del desbloqueado + reset rate-limit
        if (res.phone) {
          sesiones.delete(res.phone);
          blockedNotifyRateLimit.delete(res.phone);
          log.info(trace, `🧹 Cache local de ${res.phone} invalidada tras desbloqueo`);
        }
        
        return enviar(tel, 
          `✅ *${res.username}* desbloqueado.\n\n` +
          `📱 ${res.phone}\n` +
          `Ya puede usar el bot normalmente.`,
          trace);
      }

      case 'bloqueados': {
        const list = await sbRpc("admin_list_blocked_users", {}, trace);
        if (!Array.isArray(list) || list.length === 0) {
          return enviar(tel, `✅ *No hay usuarios bloqueados.*`, trace);
        }
        const lines = list.slice(0, 20).map((b, i) => 
          `${i + 1}. *${b.username}* (${b.phone_masked})\n` +
          `   📝 ${b.reason}\n` +
          `   📅 ${b.blocked_at} · por ${b.blocked_by}`
        ).join('\n\n');
        const more = list.length > 20 ? `\n\n_...y ${list.length - 20} más_` : '';
        return enviar(tel, `🚫 *Usuarios bloqueados* (${list.length})\n\n${lines}${more}`, trace);
      }

      default:
        return enviar(tel, `Comando desconocido. Usa:\n• ESTADO <user>\n• TOP10\n• SALUD\n• LIBERAR <folio>\n• BLOQUEAR <user> [razón]\n• DESBLOQUEAR <user>\n• BLOQUEADOS`, trace);
    }
  } catch (e) {
    log.error(trace, `handleAdminCommand error:`, e);
    return enviar(tel, `❌ Error procesando comando: ${e.message}`, trace);
  }
}

// ════════════════════════════════════════════════════════════════
// v3.42 ALERTS POLLER — revisa alertas pendientes y notifica admins
// ════════════════════════════════════════════════════════════════
async function pollAndDeliverAlerts() {
  try {
    const res = await sbRpc("get_pending_alerts", { p_limit: 5 }, null);
    if (!res?.alerts || res.alerts.length === 0) return;
    const adminPhones = res.admin_phones || [];
    if (adminPhones.length === 0) return;

    const sentIds = [];
    for (const alert of res.alerts) {
      const icon = alert.severity === 'critical' ? '🚨' : (alert.severity === 'warn' ? '⚠️' : 'ℹ️');
      const msg = `${icon} *Alerta del bot*\n_${alert.category}_\n\n${alert.message}`;
      for (const phone of adminPhones) {
        try {
          await enviar(phone, msg, `alert_${alert.id}`);
        } catch (e) {
          log.warn(null, `Alert delivery to ${phone} failed: ${e.message}`);
        }
      }
      sentIds.push(alert.id);
    }
    if (sentIds.length > 0) {
      await sbRpc("mark_alerts_notified", { p_alert_ids: sentIds }, null);
      log.info(null, `Delivered ${sentIds.length} alerts to ${adminPhones.length} admin(s)`);
    }
  } catch (e) {
    log.warn(null, `pollAndDeliverAlerts error: ${e.message}`);
  }
}

// Iniciar el poller al boot del bot
setInterval(pollAndDeliverAlerts, ALERT_POLL_INTERVAL_MS);
setInterval(() => refreshAdminPhones(null).catch(() => {}), 5 * 60 * 1000);
// Refresh inicial al boot (con 5s delay para que sbRpc esté listo)
setTimeout(() => refreshAdminPhones(null).catch(() => {}), 5000);

// ════════════════════════════════════════════════════════════════════════════
// §7 · HANDLERS DE FASE — máquina de estados del usuario
// ════════════════════════════════════════════════════════════════════════════
// Función central que decide qué hacer con un mensaje según:
//   • el contenido (intención detectada)
//   • la fase actual del user (nuevo, esperando_username, esperando_folio, etc.)
//   • permisos (admin? bloqueado?)
//
// ⚠️ ZONA DE ALTO CUIDADO: aquí vive la lógica de flujo del usuario.
//    Romper una fase deja a usuarios atascados sin poder continuar.
//    Si cambias algo: prueba TODAS las fases en testing antes de subir.

async function procesarMensajeCore(tel, texto, trace) {
  atLog(tel, texto, 'in', getSesion(tel).fase);

  // v3.42 ADMIN COMMANDS: intercepción temprana antes de cualquier handler regular.
  // Solo se evalúa si el teléfono es admin Y el texto matchea pattern de comando.
  if (isAdminPhoneLocal(tel)) {
    const adminCmd = detectAdminCommand(texto);
    if (adminCmd) {
      return handleAdminCommand(tel, adminCmd, trace);
    }
  }

  const intencion = detectarIntencion(texto);
  let s = getSesion(tel);

  // v3.37: Re-cargar de BD si caché está stale (>3 min sin actividad) Y la fase es segura
  // Esto previene que una réplica use datos viejos cuando otra réplica modificó la BD.
  // v3.40 FIX: incluir esperando_username — si otra réplica registró al usuario, esta debe enterarse.
  // El pendingFolio se recupera de BD en cargarSesion (líneas 1889-1900) si sigue legítimo.
  const cacheIsStale = s.cargado && s.lastSeen && 
    (Date.now() - s.lastSeen > CACHE_STALE_MS) &&
    (s.fase === "activo" || s.fase === "esperando_folio" || s.fase === "nuevo" || s.fase === "desconocido" || s.fase === "esperando_soporte" || s.fase === "esperando_soporte_menu" || s.fase === "esperando_username");
  
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
      // v3.46 USER BLOCKED: si está bloqueado, notificar descalificación (rate-limited)
      if (jugador.wa_bloqueado === true) {
        metrics.user_blocked = (metrics.user_blocked || 0) + 1;
        const now = Date.now();
        const lastNotified = blockedNotifyRateLimit.get(tel) || 0;
        const isFirstNotify = jugador.blocked_notified_at == null;
        
        // Rate limit: max 1 mensaje cada 5 minutos al bloqueado (evitar spam)
        if (now - lastNotified < BLOCKED_NOTIFY_COOLDOWN_MS) {
          log.info(trace, `🚫 Bloqueado ${tel} ya notificado <5min, silent skip`);
          return;
        }
        
        log.warn(trace, `🚫 Notificando descalificación a ${tel}: first=${isFirstNotify} reason="${jugador.blocked_reason || 'n/a'}"`);
        blockedNotifyRateLimit.set(tel, now);
        
        if (isFirstNotify) {
          // Primer mensaje después del bloqueo: notificación completa con razón
          await enviar(tel, M.usuarioBloqueado(jugador.blocked_reason), trace);
          // Marcar como notificado en BD (fire-and-forget)
          sbRpc("mark_blocked_notified", { p_phone: tel }, trace).catch(() => {});
        } else {
          // Ya se le notificó antes: recordatorio breve
          await enviar(tel, M.usuarioBloqueadoRecordatorio(), trace);
        }
        return;
      }

      let recoveredPhase = jugador.wa_phase || "nuevo";
      let recoveredPendingFolio = null;
      
      // v3.36: si fase es esperando_username, intentar recuperar pendingFolio de BD
      if (recoveredPhase === "esperando_username") {
        const pendingRes = await sbRpc("get_pending_registration", { p_phone: tel }, trace);
        if (pendingRes?.found && pendingRes?.pending_folio) {
          const isMasterKey = /^999\d{18}$/.test(pendingRes.pending_folio);
          if (isMasterKey) {
            // v3.46: era un master key guardado en BD — recuperar como pendingMasterKey
            recoveredPendingFolio = null;
            log.info(trace, `Sesión recuperada en esperando_username con pendingMasterKey=${pendingRes.pending_folio.slice(-7)}`);
            metrics.session_recovery_master_key = (metrics.session_recovery_master_key || 0) + 1;
            setSesion(tel, {
              cargado: true, fase: "esperando_username",
              pendingFolio: null,
              pendingMasterKey: pendingRes.pending_folio,
            });
            // No continúa al flujo normal (ya seteó sesión)
          } else {
            recoveredPendingFolio = pendingRes.pending_folio;
            log.info(trace, `Sesión recuperada en esperando_username con pendingFolio=${recoveredPendingFolio}`);
            metrics.session_recovery_with_folio = (metrics.session_recovery_with_folio || 0) + 1;
          }
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
        const isMasterKey = /^999\d{18}$/.test(pendingRes.pending_folio);
        log.info(trace, `No hay profile pero sí pending${isMasterKey ? 'MasterKey' : 'Folio'}=${pendingRes.pending_folio} — fase=esperando_username`);
        metrics.session_recovery_with_folio = (metrics.session_recovery_with_folio || 0) + 1;
        setSesion(tel, {
          cargado: true, fase: "esperando_username",
          username: null, userId: null, registered: false,
          pendingFolio:     isMasterKey ? null : pendingRes.pending_folio,
          pendingMasterKey: isMasterKey ? pendingRes.pending_folio : null,
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

  // v3.39 FIX: race condition cross-réplica en fase esperando_username.
  // persistFase requiere userId, pero el usuario aún no se registra cuando entra a
  // esperando_username (solo recibe magic link tras validar apodo). Si una réplica
  // distinta recibe el username y no había procesado el folio, su cache local tiene
  // fase="esperando_folio" o "nuevo". Como pasaron <3min, no recarga BD (cacheIsStale=false)
  // y responde con M.pedirFolio incorrectamente. Fix: si fase es esperando_folio/nuevo
  // SIN userId, verificar pendingFolio en BD antes de procesar. Si existe → esperando_username.
  if (!s.userId && (s.fase === "esperando_folio" || s.fase === "nuevo" || s.fase === "desconocido") && !s.pendingFolio) {
    const pendingRes = await sbRpc("get_pending_registration", { p_phone: tel }, trace);
    if (pendingRes?.found && pendingRes?.pending_folio) {
      log.info(trace, `v3.39 race fix: pendingFolio=${pendingRes.pending_folio} encontrado en BD — ajustando fase a esperando_username`);
      metrics.race_fix_pending_recovery = (metrics.race_fix_pending_recovery || 0) + 1;
      setSesion(tel, { fase: "esperando_username", pendingFolio: pendingRes.pending_folio });
      s = getSesion(tel);
    }
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
    setSesion(tel, { fase: "esperando_soporte_menu" });
    return enviar(tel, M.soporteMenu(), trace);
  }
  // v3.40 — menú de soporte: 1 = juego, 2 = tienda/producto
  if (s.fase === "esperando_soporte_menu") {
    const earlyExitIntents = ["reiniciar", "folio_input", "ayuda", "puntos", "mi_link", "otra_ronda", "saludo"];
    if (earlyExitIntents.includes(intencion)) {
      let exitUsername = username;
      let exitUserId = userId;
      if (!exitUsername) {
        const rec = await recoverFromDB("soporte_menu_early_exit");
        if (rec) { exitUsername = rec.username; exitUserId = rec.userId; }
      }
      setSesion(tel, {
        fase: exitUsername ? "activo" : "nuevo",
        username: exitUsername || username,
        userId: exitUserId || userId,
      });
      s = getSesion(tel);
    } else if (intencion === "cancelar") {
      setSesion(tel, { fase: username ? "activo" : "nuevo" });
      return enviar(tel, M.soporteCancelado(), trace);
    } else {
      const t = (texto || "").trim().toLowerCase();
      const esJuego  = t === "1" || /\b(juego|folio|link|registro|puntaje|app|sitio)\b/.test(t);
      const esTienda = t === "2" || /\b(tienda|producto|sucursal|servicio|nutrisa|nieve|moyo|cielito)\b/.test(t);
      if (esJuego) {
        metrics.soporte_categoria_juego = (metrics.soporte_categoria_juego || 0) + 1;
        setSesion(tel, { fase: "esperando_soporte" });
        return enviar(tel, M.soporteIntro(), trace);
      }
      if (esTienda) {
        metrics.soporte_categoria_tienda = (metrics.soporte_categoria_tienda || 0) + 1;
        setSesion(tel, { fase: username ? "activo" : "nuevo" });
        return enviar(tel, M.soporteTiendaContacto(), trace);
      }
      // No clasificó: repreguntar
      return enviar(tel, M.soporteMenuReintenta(), trace);
    }
  }
  if (s.fase === "esperando_soporte") {
    // v3.37: early-exit del modo soporte si el usuario manda comandos claros.
    // Esto evita que un folio o "reiniciar" se manden a Airtable como "reporte".
    // v3.40 FIX: si no tenemos username en cache (cross-réplica), intentar recuperar
    // de BD ANTES del early exit para que username/userId estén disponibles.
    const earlyExitIntents = ["reiniciar", "folio_input", "ayuda", "puntos", "mi_link", "otra_ronda", "saludo"];
    if (earlyExitIntents.includes(intencion)) {
      let exitUsername = username;
      let exitUserId = userId;
      if (!exitUsername) {
        const rec = await recoverFromDB("soporte_early_exit");
        if (rec) { exitUsername = rec.username; exitUserId = rec.userId; }
      }
      log.info(trace, `Soporte cancelado por intent "${intencion}" — bypass automático`);
      metrics.soporte_auto_cancel = (metrics.soporte_auto_cancel || 0) + 1;
      setSesion(tel, {
        fase: exitUsername ? "activo" : "nuevo",
        username: exitUsername || username,
        userId: exitUserId || userId,
      });
      // Re-leer la sesión para que los handlers de abajo vean la fase y usuario actualizados
      s = getSesion(tel);
    } else if (intencion === "cancelar") {
      setSesion(tel, { fase: username ? "activo" : "nuevo" });
      return enviar(tel, M.soporteCancelado(), trace);
    } else {
      // v3.40: respaldo en BD + estado real de Airtable. No mentir.
      let airtableOk = false;
      let airtableError = null;
      try {
        const result = await bcSyncSoporte(tel, username, texto, "Juego");
        airtableOk = result !== false;
      } catch (e) {
        airtableError = (e?.message || "unknown").substring(0, 200);
      }
      // SIEMPRE guardar en BD como respaldo — Airtable puede estar caído
      try {
        await sbRpc("save_support_report", {
          p_phone: tel,
          p_username: username,
          p_mensaje: texto,
          p_airtable_ok: airtableOk,
          p_airtable_error: airtableError,
          p_category: "Juego",
        }, trace);
      } catch (e) {
        log.error(trace, `save_support_report falló: ${e.message}`);
      }
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
    // v3.40 ANTI-GHOST: verificar que el ticket sigue activo antes de mandar link
    const status = await getTicketStatus(_muid, null, trace);
    if (!status || !status.has_ticket) {
      metrics.mi_link_no_ticket = (metrics.mi_link_no_ticket || 0) + 1;
      return enviar(tel, `No tienes una ronda activa, *${_muser || "Fanático"}* 🤔\n\n🎫 Envía un folio para iniciar una nueva ronda — te generaré un link al momento.\n\n📊 Si solo querías ver tu puntaje, escribe *PUNTOS*.`, trace);
    }
    if (status.session_complete) {
      metrics.mi_link_session_done = (metrics.mi_link_session_done || 0) + 1;
      return enviar(tel, `Ya completaste esa ronda, *${_muser || "Fanático"}* 🏆\n\n🎫 Envía otro folio para jugar de nuevo.\n\n📊 Para ver tu puntaje escribe *PUNTOS*.`, trace);
    }
    const linkRes = await waAuth("get_link", { phone: tel }, trace).catch(() => null);
    if (linkRes?.ok && linkRes.magic_link) {
      const shortMiLink = await crearShortLink(_muid, linkRes.magic_link, trace);
      return enviar(tel, M.miLink(_muser || "Fanático", shortMiLink), trace);
    }
    // v3.40 FIX: waAuth no devolvió link — buscar short_link activo del usuario en BD.
    // Esto cubre casos donde waAuth está rate-limited o el edge function falla
    // pero el usuario sí tiene un link válido reciente.
    log.warn(trace, `waAuth get_link no devolvió magic_link — fallback a short_link de BD`);
    metrics.mi_link_fallback_db = (metrics.mi_link_fallback_db || 0) + 1;
    const existingCode = await sbRpc("get_user_active_short_link", { p_user_id: _muid }, trace);
    if (existingCode && typeof existingCode === "string") {
      const existingShortLink = `${SITE_URL}/j/${existingCode}`;
      log.info(trace, `Short link recuperado de BD: ${existingShortLink}`);
      return enviar(tel, M.miLink(_muser || "Fanático", existingShortLink), trace);
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
    // v3.40 ANTI-GHOST: si tiene ticket pendiente sin sesión completa, reenviar link en vez de pedir folio nuevo
    const status = await getTicketStatus(_uid, null, trace);
    if (status?.has_ticket && !status?.session_complete) {
      log.info(trace, `OTRA RONDA: ticket pendiente detectado, reenviando link en vez de pedir folio nuevo`);
      metrics.otra_ronda_relink = (metrics.otra_ronda_relink || 0) + 1;
      const linkRes = await waAuth("get_link", { phone: tel }, trace).catch(() => null);
      if (linkRes?.ok && linkRes.magic_link) {
        const shortRelink = await crearShortLink(_uid, linkRes.magic_link, trace);
        return enviar(tel, M.reenvioLink(_u || "Fanático", shortRelink), trace);
      }
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
      // v3.40 FIX: si BD dice que el usuario YA está registrado (cross-réplica desync),
      // refrescar cache y dejar caer el mensaje al handler de folio_input normal.
      const stateCheck = await sbRpc("get_wa_profile", { p_phone: tel }, trace);
      if (stateCheck?.found && stateCheck?.wa_registered && stateCheck?.user_id && stateCheck?.wa_username) {
        log.warn(trace, `v3.40 FIX: cache decía esperando_username pero BD dice registered=true username=${stateCheck.wa_username} — refrescando y re-enrutando`);
        metrics.cross_replica_username_fix = (metrics.cross_replica_username_fix || 0) + 1;
        setSesion(tel, {
          fase: "activo",
          username: stateCheck.wa_username,
          userId: stateCheck.user_id,
          registered: true,
          pendingFolio: null,
          rondasHoy: stateCheck.wa_fecha_reset === hoy ? (stateCheck.wa_rondas_hoy || 0) : 0,
          rondasTotal: stateCheck.wa_rondas_total || 0,
          fechaReset: stateCheck.wa_fecha_reset || null,
        });
        s = getSesion(tel);
        // Continuamos al handler de folio_input normal abajo (no return aquí)
      } else {
        log.info(trace, `Folio recibido en esperando_username — pidiendo username del folio anterior`);
        return enviar(tel,
          `Antes envíame *un apodo* para tu folio anterior.\n\n` +
          `O escribe *REINICIAR* si prefieres empezar con este folio nuevo.`,
          trace
        );
      }
    } else {

    const nombrePropuesto = texto.trim().substring(0, 20);
    const val = validarUsername(nombrePropuesto);
    if (!val.valido) return enviar(tel, M.usernameInvalido(val.razon, val.sugerencia), trace);

    // ═══════════════════════════════════════════════════════════
    // v3.46 MASTER KEY PATH — si el usuario llegó aquí por un master key,
    // el flow es diferente: registrar usuario → claim_master_key_session
    // (en vez del flow normal: registrar → validate_and_claim_ticket)
    // ═══════════════════════════════════════════════════════════
    if (s.pendingMasterKey) {
      const masterKey = s.pendingMasterKey;
      log.info(trace, `→ register (master key path) username="${nombrePropuesto}" phone=${tel} key_serial=${masterKey.slice(-7)}`);
      metrics.master_key_registrations = (metrics.master_key_registrations || 0) + 1;

      const regRes = await waAuth("register", { phone: tel, username: nombrePropuesto }, trace);

      if (regRes?.error === "username_taken") return enviar(tel, M.usernameTomado(generarSugerencia(nombrePropuesto)), trace);
      if (regRes?.error === "inappropriate_username") {
        metrics.username_rejected_profanity++;
        return enviar(tel, M.usernameProfanity(generarSugerencia(nombrePropuesto)), trace);
      }
      if (regRes?.error === "unauthorized" || regRes?.error === "misconfigured" || regRes?.error === "edge_function_error") {
        setSesion(tel, { fase: "esperando_folio", pendingMasterKey: null });
        return enviar(tel, M.errorEdgeFunction(), trace);
      }
      if (!regRes?.success || !regRes.user_id) {
        log.error(trace, "register (master key) fallido:", JSON.stringify(regRes).substring(0, 200));
        setSesion(tel, { fase: "esperando_folio", pendingMasterKey: null });
        return enviar(tel, M.errorRegistro(), trace);
      }

      const finalUsername = regRes.username || nombrePropuesto;
      const newUserId     = regRes.user_id;

      // Claim master key session (crea ticket sintético sucursal 32000)
      const mkRes = await sbRpc("claim_master_key_session", {
        p_master_code: masterKey,
        p_user_id:     newUserId,
        p_phone:       tel,
        p_username:    finalUsername,
        p_trace:       trace,
      }, trace);

      if (!mkRes?.success) {
        log.error(trace, `Master key claim post-register falló: ${JSON.stringify(mkRes)}`);
        setSesion(tel, { fase: "activo", username: finalUsername, userId: newUserId, pendingMasterKey: null });
        return enviar(tel,
          `Registrado como *${finalUsername}* ✅\n\nHubo un error con el master key (${masterKey.slice(-7)}). Inténtalo de nuevo enviando el mismo código.`,
          trace);
      }

      // Actualizar sesión como usuario activo
      setSesion(tel, {
        fase: "activo", username: finalUsername, userId: newUserId,
        pendingFolio: null, pendingMasterKey: null, intentos: 0,
      });

      log.info(trace, `✅ Master key registration completa: user=${finalUsername} ticket=${mkRes.ticket_code}`);

      // Generar magic link + short link
      let magicLink = regRes.magic_link;
      let shortLink = magicLink;
      if (magicLink && newUserId) {
        const short = await crearShortLink(newUserId, magicLink, trace);
        if (short) shortLink = short;
      }

      return enviar(tel,
        `¡Listo, *${finalUsername}*! 🎉\n\n` +
        `🔑 *Master Key activado* (serial #${mkRes.serial})\n\n` +
        `Toca aquí para jugar:\n${shortLink || magicLink || SITE_URL}\n\n` +
        `⚠️ Esta sesión es de prueba — no cuenta para el leaderboard real.`,
        trace);
    }
    // ═══════════════════════════════════════════════════════════
    // END MASTER KEY PATH — el código normal sigue abajo
    // ═══════════════════════════════════════════════════════════

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
      logFolioAttempt(tel, newUserId, pendFolio, 'claim', claimRes?.error || 'fail', trace);
      registerLastFolio(tel, pendFolio, claimRes?.error || 'fail');
      setSesion(tel, { fase: "activo", username: finalUsername, userId: newUserId, pendingFolio: null });
      sbRpc("clear_pending_registration", { p_phone: tel }, trace).catch(() => {});
      return enviar(tel, M.folioError(claimRes?.error || "already_used"), trace);
    }
    metrics.claim_ok++;
    logFolioAttempt(tel, newUserId, pendFolio, 'claim', 'success', trace);
    registerLastFolio(tel, pendFolio, 'success');

    // v3.40 ANTI-GHOST: verificar que el ticket SÍ quedó en BD antes de mandar magic link.
    // Race conditions o triggers pueden hacer rollback silencioso. Si esto pasó,
    // mejor decir error explícito ahora que mandar link a sesión rota.
    const postClaimStatus = await getTicketStatus(newUserId, pendFolio, trace);
    if (!postClaimStatus?.has_ticket) {
      metrics.claim_ghost = (metrics.claim_ghost || 0) + 1;
      log.error(trace, `GHOST CLAIM detectado tras register: claim returned success pero ticket no existe en BD. user=${newUserId} folio=${pendFolio}`);
      sbRpc("create_alert", {
        p_severity: 'critical',
        p_category: 'ghost_claim',
        p_message: `Ghost claim post-register: folio ${pendFolio.slice(-6)} user ${finalUsername}`,
        p_metadata: { folio: pendFolio, user_id: newUserId, phone: tel },
      }, trace).catch(() => {});
      setSesion(tel, { fase: "activo", username: finalUsername, userId: newUserId, pendingFolio: null });
      sbRpc("clear_pending_registration", { p_phone: tel }, trace).catch(() => {});
      return enviar(tel, `Hubo un problema al guardar tu folio en el sistema. Por favor envíalo de nuevo en unos segundos — si vuelve a fallar, escribe *SOPORTE*.`, trace);
    }

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
    const shortReg = await crearShortLink(regRes.user_id || userId, regRes.magic_link, trace);
    return enviar(tel, M.registroCompleto(finalUsername, shortReg, rondaNum), trace);
    }  // cierra else (no folio_input en esperando_username)
  }  // cierra if (s.fase === "esperando_username")

  // v3.42: looksLikeFolio ahora más estricto — debe empezar con 84 y ser 21 dígitos.
  // Esto evita que números de teléfono u otros números largos se interpreten como folio.
  const looksLikeFolio = /^84\d{19}$/.test(texto.replace(/\s/g, ""));
  // v3.42: también activamos el handler si extraerFolioInteligente encuentra un folio
  // (esto cubre folios embebidos en texto: "mi folio es 8412...")
  const smartExtracted = extraerFolioInteligente(texto);

  // ═══════════════════════════════════════════════════════════════════════════
  // v3.45 MASTER KEY DETECTION — antes de cualquier validación
  //
  // Master keys: 21 dígitos que comienzan con 999. Saltan TODAS las
  // validaciones normales (fecha, tienda, expiración, ya canjeado, límite
  // diario). Marcan al usuario como master_key_user (excluido del leaderboard).
  // Cada uso se registra en master_key_log con auditoría completa.
  //
  // Esto se procesa ANTES que extraerFolioInteligente porque master keys 
  // empiezan con 999, no 84, y serían rechazadas por wrong_prefix.
  // ═══════════════════════════════════════════════════════════════════════════
  const cleanedTexto = texto.replace(/\s/g, "");
  if (/^999\d{18}$/.test(cleanedTexto)) {
    const masterKey = cleanedTexto;
    log.info(trace, `🔑 MASTER KEY detectado: serial=${masterKey.slice(-7)}`);
    metrics.master_key_uses = (metrics.master_key_uses || 0) + 1;

    // Necesitamos un user_id válido. Si no tenemos, primero registrar al user
    if (!userId) {
      // Generar magic link rápido para crear cuenta + asociar master key
      log.info(trace, `Master key sin userId — pidiendo registro previo`);
      const username = s.username;
      if (!username) {
        setSesion(tel, { 
          fase: "esperando_username",
          pendingMasterKey: masterKey 
        });
        // v3.46: persistir en BD para que sobreviva stale-cache reload
        sbRpc("save_pending_registration", { p_phone: tel, p_folio: masterKey }, trace).catch(() => {});
        return enviar(tel, M.folioOkPideNombre(
          "Sucursal Master Key (interna)", 
          "MASTER_KEY"
        ), trace);
      }
    }

    // Procesar master key (crea sesión sintética)
    const mkResult = await sbRpc("claim_master_key_session", {
      p_master_code: masterKey,
      p_user_id:     userId,
      p_phone:       tel,
      p_username:    s.username || null,
      p_trace:       trace
    }, trace);

    if (!mkResult?.success) {
      log.error(trace, `Master key claim falló: ${JSON.stringify(mkResult)}`);
      return enviar(tel, 
        `🔑 Master key inválido o error interno.\n\n` +
        `Detalles: ${mkResult?.error || 'desconocido'}\n\n` +
        `Reporta esto al equipo técnico con el código: \`${masterKey.slice(-7)}\``,
        trace);
    }

    // Generar magic link normal (el frontend cargará la sesión sintética)
    const linkRes = await waAuth("get_link", { phone: tel }, trace);
    let magicLink = linkRes?.magic_link;
    let shortLink = magicLink;
    if (magicLink && userId) {
      const short = await crearShortLink(userId, magicLink, trace);
      if (short) shortLink = short;
    }

    log.info(trace, `✅ Master key OK — synthetic_code=${mkResult.ticket_code}`);
    return enviar(tel,
      `🔑 *Master Key validado* — serial #${mkResult.serial}\n\n` +
      `Tu sesión está lista. Toca aquí para jugar:\n${shortLink || magicLink || SITE_URL}\n\n` +
      `⚠️ Esta sesión NO cuenta para el leaderboard real (es modo testing).\n` +
      `Uso registrado en sistema (\`${masterKey.slice(-7)}\` · ${tel}).`,
      trace);
  }

  if (intencion === "folio_input" || (s.fase === "esperando_folio" && looksLikeFolio) || smartExtracted.found) {
    let folio;

    // Path A: extracción inteligente exitosa
    if (smartExtracted.found) {
      folio = smartExtracted.folio;
      if (smartExtracted.method === 'multi') {
        log.info(trace, `Múltiples folios detectados, procesando ${folio}; ignorados: ${smartExtracted.others.join(', ')}`);
        metrics.folio_multi_input = (metrics.folio_multi_input || 0) + 1;
      } else if (smartExtracted.method === 'embedded') {
        log.info(trace, `Folio extraído de texto libre: ${folio}`);
        metrics.folio_embedded_input = (metrics.folio_embedded_input || 0) + 1;
      }
    } 
    // Path B: extracción falló pero parece intento de folio — mensaje específico
    else if (smartExtracted.reason === 'too_short') {
      setSesion(tel, { intentos: (s.intentos || 0) + 1 });
      return enviar(tel, 
        `Tu folio está incompleto, *te faltan ${smartExtracted.missing_digits} dígitos* 📏\n\n` +
        `🎫 El folio tiene exactamente *21 dígitos* y empieza con *84*.\n\n` +
        `Revisa el ticket y mándalo completo.`, trace);
    } else if (smartExtracted.reason === 'too_long') {
      setSesion(tel, { intentos: (s.intentos || 0) + 1 });
      return enviar(tel,
        `Tu folio tiene *${smartExtracted.extra_digits} dígitos de más* 📏\n\n` +
        `🎫 El folio tiene exactamente *21 dígitos*. Quizás copiaste otro número junto.\n\n` +
        `Revisa el ticket — empieza con *84*.`, trace);
    } else if (smartExtracted.reason === 'wrong_prefix') {
      setSesion(tel, { intentos: (s.intentos || 0) + 1 });
      return enviar(tel, M.folioError("prefijo"), trace);
    } else {
      // Caer al validador legacy por compatibilidad
      const num = texto.replace(/\s/g, "");
      const localVal = validarFormatoFolioLocal(num);
      if (!localVal.ok) {
        setSesion(tel, { intentos: (s.intentos || 0) + 1 });
        return enviar(tel, M.folioError(localVal.error), trace);
      }
      folio = localVal.folio;
    }

    // ═══════════════════════════════════════════════════════════════
    // v3.42 SMART FILTERS GATE — bloquear dups, spam, race antes de RPC
    // ═══════════════════════════════════════════════════════════════
    const gate = await smartFolioGate(tel, folio, userId, trace);
    if (!gate.allow) {
      // Bloqueado por filtros. Si hay response, enviarlo; si no, silent skip.
      if (gate.response) {
        return enviar(tel, gate.response, trace);
      }
      log.info(trace, `Smart filter silent skip para folio ${folio}`);
      return;
    }

    // A partir de aquí, garantizamos que: 
    //   1. No es duplicado dentro de 15s
    //   2. No es spam (rapid-fire ni insistencia)
    //   3. Lock distribuido adquirido (si tenemos userId)
    // El lock se libera automáticamente tras 30s o cuando llamemos releaseFolioLock.

    const previewParams = userId ? { p_code: folio, p_user_id: userId } : { p_code: folio };
    const preview = await sbRpc("preview_ticket", previewParams, trace);

    if (preview === null) {
      log.warn(trace, "preview_ticket null — Supabase posiblemente saturado");
      if (userId) releaseFolioLock(folio, trace);
      return enviar(tel, M.servidorSaturado(), trace);
    }
    if (!preview?.success) {
      metrics.preview_ticket_fail++;
      setSesion(tel, { intentos: (s.intentos || 0) + 1 });
      logFolioAttempt(tel, userId, folio, 'preview', preview?.error || 'invalid', trace);
      registerLastFolio(tel, folio, preview?.error || 'invalid');
      if (userId) releaseFolioLock(folio, trace);
      // v3.48: cooldown progresivo — mensaje especial con minutos restantes
      if (preview?.error === 'cooldown_active') {
        metrics.cooldown_blocked = (metrics.cooldown_blocked || 0) + 1;
        log.warn(trace, `COOLDOWN nivel ${preview.cooldown_level} para ${tel} — ${preview.minutes_remaining}min`);
        return enviar(tel, M.cooldownActivo(preview.cooldown_level, preview.minutes_remaining), trace);
      }
      return enviar(tel, M.folioError(preview?.error || "invalid_format"), trace);
    }
    metrics.preview_ticket_ok++;
    logFolioAttempt(tel, userId, folio, 'preview', 'success', trace);

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

      if (rondasHoy >= RONDAS_MAX) {
        if (userId) releaseFolioLock(folio, trace);
        return enviar(tel, M.maxRondas(username), trace);
      }

      const claimRes = await sbRpc("validate_and_claim_ticket", {
        p_code: folio, p_user_id: userId,
      }, trace);

      if (!claimRes?.success) {
        metrics.claim_fail++;
        logFolioAttempt(tel, userId, folio, 'claim', claimRes?.error || 'fail', trace);
        registerLastFolio(tel, folio, claimRes?.error || 'fail');

        if (claimRes?.error === 'session_active') {
          log.info(trace, `session_active detectado — regenerando magic link`);
          if (userId) releaseFolioLock(folio, trace);
          const linkRes = await waAuth("get_link", { phone: tel }, trace);
          if (linkRes?.magic_link) {
            metrics.session_active_relinks++;
            log.info(trace, `Re-enviando magic link: ${maskLink(linkRes.magic_link)}`);
            const shortRelink = await crearShortLink(userId, linkRes.magic_link, trace);
            return enviar(tel, M.reenvioLink(username, shortRelink), trace);
          }
          // v3.42: fallback a short_link existente en BD si waAuth falló
          const existingCode = await sbRpc("get_user_active_short_link", { p_user_id: userId }, trace);
          if (existingCode && typeof existingCode === "string") {
            log.info(trace, `Short link de BD reutilizado: ${existingCode}`);
            return enviar(tel, M.reenvioLink(username, `${SITE_URL}/j/${existingCode}`), trace);
          }
          log.warn(trace, `session_active sin link — fallback a mensaje de texto`);
        }

        if (userId) releaseFolioLock(folio, trace);
        return enviar(tel, M.folioError(claimRes?.error || "already_used"), trace);
      }
      metrics.claim_ok++;
      logFolioAttempt(tel, userId, folio, 'claim', 'success', trace);
      registerLastFolio(tel, folio, 'success');

      // v3.40 ANTI-GHOST: verificar que el ticket SÍ quedó en BD antes de mandar magic link
      const postClaimStatus2 = await getTicketStatus(userId, folio, trace);
      if (!postClaimStatus2?.has_ticket) {
        metrics.claim_ghost = (metrics.claim_ghost || 0) + 1;
        log.error(trace, `GHOST CLAIM (folio adicional): claim success pero ticket no existe. user=${userId} folio=${folio}`);
        // Alertar admins
        sbRpc("create_alert", {
          p_severity: 'critical',
          p_category: 'ghost_claim',
          p_message: `Ghost claim: folio ${folio.slice(-6)} claim success pero ticket no en BD`,
          p_metadata: { folio, user_id: userId, phone: tel },
        }, trace).catch(() => {});
        if (userId) releaseFolioLock(folio, trace);
        return enviar(tel, `Hubo un problema al guardar tu folio. Por favor envíalo de nuevo en unos segundos — si vuelve a fallar, escribe *SOPORTE*.`, trace);
      }

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
        // v3.42: fallback a short_link existente en BD
        const existingCode = await sbRpc("get_user_active_short_link", { p_user_id: userId }, trace);
        if (existingCode && typeof existingCode === "string") {
          if (userId) releaseFolioLock(folio, trace);
          return enviar(tel, M.folioAdicional(username, rondaParaMostrar, `${SITE_URL}/j/${existingCode}`), trace);
        }
        if (userId) releaseFolioLock(folio, trace);
        return enviar(tel, `Folio registrado, *${username}*.\nVe a *${SITE_URL}* para jugar.\nRonda *${rondaParaMostrar}* de *${RONDAS_MAX}* hoy.`, trace);
      }
      log.info(trace, `Magic link generado: ${maskLink(linkRes.magic_link)}`);
      const shortFolio = await crearShortLink(userId, linkRes.magic_link, trace);
      if (userId) releaseFolioLock(folio, trace);
      return enviar(tel, M.folioAdicional(username, rondaParaMostrar, shortFolio), trace);
    }

    const storeInfo = getStoreFromFolio(folio);
    setSesion(tel, { fase: "esperando_username", pendingFolio: folio, intentos: 0 });
    // v3.36: persistir pendingFolio en BD para que sobreviva cambio de réplica
    sbRpc("set_pending_registration", { p_phone: tel, p_folio: folio }, trace).catch(() => {
      metrics.pending_reg_persist_fail = (metrics.pending_reg_persist_fail || 0) + 1;
    });
    // v3.42: registrar y liberar lock (el folio queda en pendingFolio, no hay claim aún)
    registerLastFolio(tel, folio, 'pending_username');
    if (userId) releaseFolioLock(folio, trace);
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

// ════════════════════════════════════════════════════════════════════════════
// §10 · BROADCASTS + CLEANUP — procesos asíncronos
// ════════════════════════════════════════════════════════════════════════════
// Loops periódicos: procesar broadcasts pendientes, limpieza de Maps internos,
// recuperación de broadcasts huérfanos.
// ✏️ Seguro editar timeouts. ⚠️ Cuidado al editar la lógica de polling.

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

// ════════════════════════════════════════════════════════════════════════════
// §9 · ENDPOINTS HTTP — short links, webhook, game-complete, admin, monitoring
// ════════════════════════════════════════════════════════════════════════════
// Toda la superficie HTTP del bot. Express app.
// 🔴 ZONA PROHIBIDA: el webhook es el punto de entrada de TODO mensaje
//    de WhatsApp. Si falla, los mensajes se pierden silenciosamente.

// ─── SHORT LINK REDIRECT (v3.39) ─────────────────────────────────────────────
// /j/CODE → resuelve a magic link real, redirige 302 al frontend.
// Permite "tap único" en iOS WhatsApp (links a fanaticosdelsabor.com son 
// clickeables sin warning).
// El equipo web ya configuró Netlify: /j/* → https://gol-nutriza-production.up.railway.app/j/*
// Este endpoint reclama el código y redirige al magic link real (302)
app.get("/j/:code", async (req, res) => {
  const code = (req.params.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const trace = `jlink-${code}`;
  if (!code) {
    log.warn(trace, "Short link sin código");
    return res.redirect(302, `${SITE_URL}/?link=invalid`);
  }
  try {
    const result = await sbRpc("claim_short_link", { p_code: code }, trace);
    const magicUrl = result?.claim_short_link || result;
    if (!magicUrl || typeof magicUrl !== "string" || !magicUrl.startsWith("http")) {
      log.warn(trace, `Short link inválido/expirado/usado: ${code}`);
      metrics.short_link_miss = (metrics.short_link_miss || 0) + 1;
      return res.redirect(302, `${SITE_URL}/?link=expired`);
    }
    log.info(trace, `Short link OK → ${maskLink(magicUrl)}`);
    metrics.short_link_hit = (metrics.short_link_hit || 0) + 1;
    return res.redirect(302, magicUrl);
  } catch (e) {
    log.error(trace, "Error en short link redirect:", e.message);
    return res.redirect(302, `${SITE_URL}/?link=error`);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// §8 · WEBHOOK ENTRY (Meta Cloud API)
// ════════════════════════════════════════════════════════════════════════════
// Punto de entrada de TODOS los mensajes WhatsApp.
// 🔴 ZONA PROHIBIDA: si esta función falla, los mensajes nunca llegan al bot.
// Validación HMAC + IP rate limit + dedup + push al procesador.
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
// /, /health, /ready, /metrics — usados por Railway, uptime monitors, alertas.
// ⚠️ Cuidado: /health hace ping a Supabase + Meta API. Si falla, Railway
//    reinicia el container. Cambiar timeout puede causar reinicios falsos.
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

// ════════════════════════════════════════════════════════════════════════════
// §11 · STARTUP — validación env + arranque servidor
// ════════════════════════════════════════════════════════════════════════════
// 🔴 ZONA PROHIBIDA: si esto falla, el bot ni arranca.
// validarEnvVars() debe pasar todas las variables requeridas.
// selfCheck() verifica conexiones a Supabase + Meta API antes de abrir puerto.

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

  // v3.40: recordatorios de tickets pendientes (30-35 min sin abrir el link)
  // Evita que usuarios pierdan el ticket por no haber abierto el magic link.
  // Corre cada 5 min, ventana 30-35 min para no spammear.
  const reminderSentMemo = new Map(); // key: ticket_code, value: timestamp (anti-duplicado)
  setInterval(async () => {
    try {
      const pending = await sbRpc("get_pending_ticket_reminders", { p_min_minutes: 30, p_max_minutes: 35 }, null);
      if (!Array.isArray(pending) || pending.length === 0) return;
      log.info(null, `🔔 ${pending.length} usuario(s) con ticket pendiente, enviando recordatorios`);
      for (const u of pending) {
        // Anti-dup: si ya mandamos recordatorio por este ticket, skip
        if (reminderSentMemo.has(u.ticket_code)) continue;
        reminderSentMemo.set(u.ticket_code, Date.now());
        try {
          const msg = 
            `⏱️ Hola, *${u.wa_username || "Fanático"}*.\n\n` +
            `Te envié un link hace ${u.minutes_since_redeem} min — ¿pudiste abrirlo? 🤔\n\n` +
            `↳ Escribe *MI LINK* si lo necesitas de nuevo.\n` +
            `↳ O escribe *SOPORTE* si tienes problemas.\n\n` +
            `💡 Tu folio se libera automáticamente en 6 horas si no juegas.`;
          await enviar(u.wa_phone, msg, null);
          metrics.reminder_sent = (metrics.reminder_sent || 0) + 1;
        } catch (e) {
          log.warn(null, `Recordatorio fail para ${u.wa_phone}: ${e.message}`);
        }
      }
      // Limpiar memo viejo (>1 hora) para liberar memoria
      const cutoff = Date.now() - 60 * 60 * 1000;
      for (const [k, v] of reminderSentMemo.entries()) {
        if (v < cutoff) reminderSentMemo.delete(k);
      }
    } catch (e) {
      log.warn(null, `reminder cron err: ${e.message}`);
    }
  }, 5 * 60 * 1000);

  procesarBroadcasts().catch(() => {});
}

start().catch(e => {
  log.error(null, "Fatal startup error:", e);
  process.exit(1);
});
