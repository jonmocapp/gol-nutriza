const express = require("express");
const app = express();
app.use(express.json());

// ─── CONFIGURACIÓN ───────────────────────────────────────────
const VERIFY_TOKEN = "golnutriza2026";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ─── MENSAJES ────────────────────────────────────────────────
const MENSAJES = {
  bienvenida: `¡Hola! 👋 Soy *Gol*, tu asistente durante esta experiencia.

Gracias por tu compra 🛒 — estás a punto de vivir la experiencia completa del fútbol y ganar premios increíbles.

¿Estás list@ para jugar? Responde *SÍ* para comenzar 🙌`,

  instruccion_folio: `¡Perfecto! 🔥 Antes de entrar al juego necesito que hagas una cosa:

👉 Toma tu ticket y busca tu *folio de compra* — está en la parte superior, empieza con *84* y tiene 21 dígitos.

¿Ya lo tienes? Responde *LISTO* cuando lo encuentres 👀`,

  link_juego: `¡Vamos! 🚀 Entra aquí y crea tu cuenta:

🔗 fanaticosdelsabor.com

Ingresa tu folio al registrarte para desbloquear los *4 juegos*.
Cada folio = 1 ronda · Máximo *5 veces al día* · Acumula puntos y compite por premios 🏆`,

  puntos: `Puedes ver tu puntaje y posición en el ranking aquí:

🔗 fanaticosdelsabor.com

Ingresa con tu número de teléfono para ver tus puntos 📊`,

  ayuda: `Hola, soy *Gol* 👋 Puedo ayudarte con:

• Responde *JUGAR* — para comenzar
• Responde *PUNTOS* — para ver tu score
• Responde *FOLIO* — para saber dónde encontrar tu folio
• Responde *PREMIO* — para info sobre premios`,

  folio: `Tu folio de compra está en la parte *superior de tu ticket* 🧾

Empieza con *84* y tiene *21 dígitos*.

Una vez que lo tengas responde *LISTO* para recibir el link del juego 👀`,

  premio: `🏆 Hay premios increíbles esperándote:

• Playeras oficiales
• Balones de fútbol
• ¡Aparece con youtubers!

Entre más puntos acumules, más chances tienes de ganar. Sigue jugando en fanaticosdelsabor.com`,

  default: `No entendí tu mensaje 😅

Responde *AYUDA* para ver qué puedo hacer por ti 👋`,
};

// ─── FUNCIÓN ENVIAR MENSAJE ───────────────────────────────────
async function enviarMensaje(telefono, texto) {
  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: "whatsapp",
    to: telefono,
    type: "text",
    text: { body: texto },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  console.log("Mensaje enviado:", JSON.stringify(data));
  return data;
}

// ─── WEBHOOK VERIFICACIÓN (Meta lo requiere) ──────────────────
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("✅ Webhook verificado");
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ─── WEBHOOK RECIBIR MENSAJES ─────────────────────────────────
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  const entry = req.body?.entry?.[0];
  const changes = entry?.changes?.[0];
  const value = changes?.value;
  const messages = value?.messages;

  if (!messages || messages.length === 0) return;

  const msg = messages[0];
  const telefono = msg.from;
  const texto = msg.text?.body?.trim().toUpperCase() || "";

  console.log(`📩 Mensaje de ${telefono}: "${texto}"`);

  let respuesta;

  if (texto === "JUGAR" || texto === "HOLA" || texto.includes("ESCANE") || texto.includes("TICKET") || texto.includes("LIST")) {
    respuesta = MENSAJES.bienvenida;
  } else if (texto === "SÍ" || texto === "SI" || texto === "S" || texto === "SÍ!") {
    respuesta = MENSAJES.instruccion_folio;
  } else if (texto === "LISTO" || texto === "YA" || texto === "LO TENGO") {
    respuesta = MENSAJES.link_juego;
  } else if (texto === "PUNTOS" || texto === "SCORE" || texto === "PUNTAJE") {
    respuesta = MENSAJES.puntos;
  } else if (texto === "FOLIO") {
    respuesta = MENSAJES.folio;
  } else if (texto === "PREMIO" || texto === "PREMIOS") {
    respuesta = MENSAJES.premio;
  } else if (texto === "AYUDA" || texto === "HELP" || texto === "?") {
    respuesta = MENSAJES.ayuda;
  } else {
    respuesta = MENSAJES.default;
  }

  await enviarMensaje(telefono, respuesta);
});

// ─── ARRANCAR SERVIDOR ────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Gol Nutriza corriendo en puerto ${PORT}`);
});
