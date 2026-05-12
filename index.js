const express = require("express");
const app = express();
app.use(express.json());

// ─── CONFIGURACIÓN ───────────────────────────────────────────
const VERIFY_TOKEN = "golnutriza2026";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

const FOLIO_IMAGE_URL = "https://i.ibb.co/TDP6mnRz/Folio.jpg";

// ─── ESTADO DE CONVERSACIÓN POR USUARIO ──────────────────────
const estadoUsuarios = new Map();

function getEstado(telefono) {
  return estadoUsuarios.get(telefono) || { fase: "nuevo" };
}

function setEstado(telefono, datos) {
  estadoUsuarios.set(telefono, datos);
}

// ─── MENSAJES ────────────────────────────────────────────────
const MENSAJES = {
  bienvenida: `¡Hola! 👋 Soy *Gol*, tu guía en *Fanáticos del Sabor × Mundial 2026* ⚽🏆

Gracias por tu compra — estás a un paso de ganar premios increíbles: playeras, Nintendo Switch 2, LEGO y hasta un Meet & Greet con La Cotorrisa.

¿Estás list@ para comenzar? Responde *SÍ* 🙌`,

  instruccion_folio_texto: `🔥 ¡Vamos! Necesita tu *folio de compra* para registrarte.

Está en la *parte superior de tu ticket* 🧾
Empieza con *84* y tiene *21 dígitos*.

¿Ya lo tienes? Responde *LISTO* cuando lo encuentres 👀`,

  link_juego: `¡Todo listo! 🚀 Aquí está tu acceso:

🔗 *fanaticosdelsabor.com*

Ingresa tu folio al registrarte y desbloquea los *4 minijuegos*.

📌 Reglas:
• Cada folio = 1 ronda de juegos
• Máximo *5 rondas por día*
• Los mejores puntajes ganan premios semanales 🏆

¡Buena suerte! Escribe *AYUDA* si necesitas algo 👊`,

  puntos: `Puedes ver tu puntaje y posición en el ranking aquí:

🔗 *fanaticosdelsabor.com*

Entra con tu número de teléfono para ver tus puntos y en qué lugar vas 📊`,

  folio: `Tu folio está en la *parte superior de tu ticket* 🧾

• Empieza con *84*
• Tiene *21 dígitos*
• Debe ser un ticket reciente de Moyo, Nutrisa, Chilim Balam o Cielito Café

Una vez que lo tengas responde *LISTO* 👀`,

  premio: `🏆 *Premios Fanáticos del Sabor × Mundial 2026*

🥇 *1er Lugar* — 20 ganadores
Meet & Greet con La Cotorrisa 🎉
Torneo de fútbol estilo "reta" + fotos + autógrafos

🥈 *2do Lugar* — 8 ganadores
Nintendo Switch 2 🎮

🥉 *3er Lugar* — 13 ganadores
LEGO Edición Mundial 2026 🧱

🏅 *4to Lugar* — 40 ganadores
Merch firmado Cotorrisa (playera o sudadera) 👕

¡Acumula puntos en *fanaticosdelsabor.com* y gana! ⚽`,

  tiendas: `Puedes participar con ticket de cualquiera de nuestras marcas:

🍦 *Moyo*
🥑 *Nutrisa*
🌮 *Chilim Balam*
☕ *Cielito Café*

Compra, guarda tu ticket y úsalo en *fanaticosdelsabor.com* ✅`,

  reglas: `📋 *Reglas del juego:*

• Compra en Moyo, Nutrisa, Chilim Balam o Cielito Café
• Usa el folio de tu ticket (21 dígitos, empieza con 84)
• Cada folio = 1 ronda de 4 minijuegos
• Máximo 5 rondas por día
• Los puntos se acumulan semana a semana
• Gana quien más puntos tenga al cierre de cada semana

Juega en *fanaticosdelsabor.com* 🎮`,

  ayuda: `Soy *Gol* 👋 Aquí lo que puedo hacer por ti:

• *SÍ* — Comenzar a jugar
• *FOLIO* — Dónde encontrar tu folio
• *LISTO* — Ya tengo mi folio, dame el link
• *PUNTOS* — Ver mi puntaje
• *PREMIO* — Info sobre premios
• *TIENDAS* — Marcas participantes
• *REGLAS* — Cómo funciona el juego
• *REINICIAR* — Empezar de nuevo`,

  reiniciar: `Listo, empezamos de cero 🔄

¡Hola! 👋 Soy *Gol*, tu guía en *Fanáticos del Sabor × Mundial 2026* ⚽

¿Estás list@ para jugar? Responde *SÍ* 🙌`,

  no_texto: `Solo puedo leer mensajes de texto 😅

Escribe *AYUDA* para ver qué puedo hacer por ti 👋`,

  default: `No entendí bien ese mensaje 😅

Escribe *AYUDA* para ver todo lo que puedo hacer por ti, o responde *SÍ* para comenzar a jugar ⚽`,
};

// ─── DETECTOR DE INTENCIÓN ────────────────────────────────────
function detectarComando(texto) {
  const t = texto.toUpperCase().trim();
  const inc = (...w) => w.some((p) => t.includes(p));

  if (inc("REINICIAR", "RESET", "RESTART", "EMPEZAR DE NUEVO", "BORRAR"))
    return "reiniciar";

  if (inc("JUGAR", "HOLA", "INICIO", "EMPEZAR", "COMENZAR", "ESCANE", "BUENAS", "QUE HAY", "QUÉ HAY"))
    return "inicio";

  if (
    t === "SÍ" || t === "SI" || t === "S" || t === "SÍ!" || t === "SI!" ||
    inc("CLARO", "DALE", "ÁNDALE", "ANDALE", "VA", "ÓRALE", "ORALE", "QUIERO JUGAR", "SI QUIERO", "LISTO SI")
  )
    return "confirmar";

  if (
    t === "LISTO" || t === "YA" ||
    inc("LO TENGO", "ENCONTRÉ", "AQUI ESTA", "TENGO EL FOLIO", "YA LO ENCONTRÉ", "LO ENCONTRE")
  )
    return "folio_listo";

  if (inc("PUNTO", "SCORE", "PUNTAJE", "RANKING", "LUGAR", "POSICION", "CUÁNTOS PUNTOS", "CUANTOS PUNTOS", "CÓMO VOY", "COMO VOY"))
    return "puntos";

  if (inc("FOLIO", "CÓDIGO", "CODIGO", "NÚMERO", "NUMERO", "TICKET", "DÓNDE ESTÁ", "DONDE ESTA", "NO ENCUENTRO", "NO LO VEO"))
    return "folio";

  if (inc("PREMIO", "GANAR", "RECOMPENSA", "QUÉ GANO", "QUE GANO", "QUE SE GANA", "QUÉ SE GANA", "REGALO", "REGALOS"))
    return "premio";

  if (inc("TIENDA", "MARCA", "NUTRISA", "MOYO", "CHILIM", "CIELITO", "DÓNDE COMPRAR", "DONDE COMPRAR", "QUÉ TIENDAS", "QUE TIENDAS"))
    return "tiendas";

  if (inc("REGLA", "CÓMO FUNCIONA", "COMO FUNCIONA", "CÓMO SE JUEGA", "COMO SE JUEGA", "INSTRUCCIONES"))
    return "reglas";

  if (inc("AYUDA", "HELP", "MENU", "MENÚ", "QUÉ PUEDES", "QUE PUEDES", "OPCIONES", "COMANDOS"))
    return "ayuda";

  if (inc("LINK", "PÁGINA", "PAGINA", "URL", "WEB", "SITIO", "JUEGO", "ENTRAR", "ACCESO"))
    return "link_directo";

  return null;
}

// ─── ENVIAR MENSAJE DE TEXTO ──────────────────────────────────
async function enviarMensaje(telefono, texto) {
  const res = await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telefono,
      type: "text",
      text: { body: texto },
    }),
  });

  const data = await res.json();
  console.log(`✉️  → ${telefono}:`, JSON.stringify(data));
  return data;
}

// ─── ENVIAR IMAGEN ────────────────────────────────────────────
async function enviarImagen(telefono, url, caption = "") {
  const res = await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: telefono,
      type: "image",
      image: { link: url, caption },
    }),
  });

  const data = await res.json();
  console.log(`🖼️  → ${telefono}:`, JSON.stringify(data));
  return data;
}

// ─── WEBHOOK VERIFICACIÓN ────────────────────────────────────
app.get("/webhook", (req, res) => {
  const { "hub.mode": mode, "hub.verify_token": token, "hub.challenge": challenge } = req.query;
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ─── WEBHOOK MENSAJES ─────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const msg = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!msg) return;

  const telefono = msg.from;

  if (msg.type !== "text") {
    await enviarMensaje(telefono, MENSAJES.no_texto);
    return;
  }

  const textoOriginal = msg.text.body.trim();
  const estado = getEstado(telefono);
  const comando = detectarComando(textoOriginal);

  console.log(`📩 [${telefono}] "${textoOriginal}" | fase: ${estado.fase} | cmd: ${comando}`);

  // ── REINICIAR (siempre disponible) ────────────────────────
  if (comando === "reiniciar") {
    setEstado(telefono, { fase: "esperando_confirmacion" });
    await enviarMensaje(telefono, MENSAJES.reiniciar);

  // ── COMANDOS GLOBALES ─────────────────────────────────────
  } else if (comando === "puntos") {
    await enviarMensaje(telefono, MENSAJES.puntos);

  } else if (comando === "folio") {
    await enviarImagen(telefono, FOLIO_IMAGE_URL, "📋 Tu folio son los 21 dígitos que empiezan con 84");
    await enviarMensaje(telefono, MENSAJES.folio);

  } else if (comando === "premio") {
    await enviarMensaje(telefono, MENSAJES.premio);

  } else if (comando === "tiendas") {
    await enviarMensaje(telefono, MENSAJES.tiendas);

  } else if (comando === "reglas") {
    await enviarMensaje(telefono, MENSAJES.reglas);

  } else if (comando === "ayuda") {
    await enviarMensaje(telefono, MENSAJES.ayuda);

  } else if (comando === "link_directo" && estado.fase === "activo") {
    await enviarMensaje(telefono, `Aquí está tu acceso 👇\n\n🔗 *fanaticosdelsabor.com*`);

  // ── FLUJO PRINCIPAL ───────────────────────────────────────
  } else if (comando === "inicio" || estado.fase === "nuevo") {
    setEstado(telefono, { fase: "esperando_confirmacion" });
    await enviarMensaje(telefono, MENSAJES.bienvenida);

  } else if (comando === "confirmar" && estado.fase === "esperando_confirmacion") {
    setEstado(telefono, { fase: "esperando_listo" });
    await enviarImagen(telefono, FOLIO_IMAGE_URL, "📋 Aquí un ejemplo — tu folio son los 21 dígitos que empiezan con 84");
    await enviarMensaje(telefono, MENSAJES.instruccion_folio_texto);

  } else if (
    estado.fase === "esperando_listo" &&
    !["puntos", "folio", "premio", "tiendas", "reglas", "ayuda"].includes(comando)
  ) {
    setEstado(telefono, { fase: "activo" });
    await enviarMensaje(telefono, MENSAJES.link_juego);

  } else if (estado.fase === "esperando_confirmacion" && !comando) {
    await enviarMensaje(telefono, `¿Listo para jugar? Solo responde *SÍ* y comenzamos ⚽`);

  } else {
    await enviarMensaje(telefono, MENSAJES.default);
  }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────
app.get("/", (_req, res) => {
  res.json({ status: "ok", bot: "Gol — Fanáticos del Sabor", version: "2.1" });
});

// ─── ARRANCAR ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Gol v2.1 corriendo en puerto ${PORT}`);
});
