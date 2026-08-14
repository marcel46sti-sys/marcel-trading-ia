const SESSION_COOKIE = "mtia_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 días

async function createSessionSignature(timestamp, password) {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(timestamp)
  );

  return Array.from(new Uint8Array(signature))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function isAuthenticated(request, env) {
  const cookieHeader = request.headers.get("Cookie") || "";

  const cookies = Object.fromEntries(
    cookieHeader
      .split(";")
      .map(cookie => cookie.trim().split("="))
      .filter(parts => parts.length === 2)
  );

  const session = cookies[SESSION_COOKIE];

  if (!session) {
    return false;
  }

  const [timestamp, signature] = session.split(".");

  if (!timestamp || !signature) {
    return false;
  }

  const timestampNumber = Number(timestamp);

  if (!Number.isFinite(timestampNumber)) {
    return false;
  }

  const now = Date.now();

  if (now - timestampNumber > SESSION_MAX_AGE * 1000) {
    return false;
  }

  if (timestampNumber > now + 60000) {
    return false;
  }

  const expectedSignature = await createSessionSignature(
    timestamp,
    env.APP_PASSWORD
  );

  return signature === expectedSignature;
}

function loginPage(error = "") {
  return `<!DOCTYPE html>
<html lang="es">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1">

<meta name="theme-color" content="#0b1020">

<title>Marcel Trading IA - Acceso</title>

<style>

*{
box-sizing:border-box;
}

body{
margin:0;
min-height:100vh;
display:flex;
align-items:center;
justify-content:center;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
background:#0b1020;
color:#fff;
padding:20px;
}

.login{
width:100%;
max-width:420px;
background:#121a2d;
border:1px solid #25314e;
border-radius:20px;
padding:30px;
box-shadow:0 20px 60px rgba(0,0,0,.35);
}

.logo{
font-size:28px;
font-weight:800;
margin-bottom:8px;
}

.logo span{
color:#5b8cff;
}

.subtitle{
color:#9ca8c4;
margin-bottom:25px;
line-height:1.5;
}

input{
width:100%;
padding:14px;
background:#0b1020;
color:#fff;
border:1px solid #34415f;
border-radius:10px;
font-size:16px;
margin-bottom:12px;
}

button{
width:100%;
border:0;
border-radius:10px;
padding:14px;
background:#4f7cff;
color:#fff;
font-weight:700;
font-size:16px;
cursor:pointer;
}

.error{
margin-top:15px;
padding:12px;
border-radius:10px;
background:#3a1720;
border:1px solid #713040;
color:#ffb7c2;
}

.lock{
font-size:42px;
margin-bottom:12px;
}

</style>

</head>

<body>

<div class="login">

<div class="lock">🔐</div>

<div class="logo">
Marcel <span>Trading IA</span>
</div>

<div class="subtitle">
Acceso privado. Introduce tu contraseña para continuar.
</div>

<form method="POST" action="/login">

<input
type="password"
name="password"
placeholder="Contraseña"
autocomplete="current-password"
autofocus
required
>

<button type="submit">
Entrar
</button>

</form>

${error ? `<div class="error">${error}</div>` : ""}

</div>

</body>

</html>`;
}

export default {
  async fetch(request, env) {

    const url = new URL(request.url);

    // ==========================================
    // INICIO DE SESIÓN
    // ==========================================

    if (url.pathname === "/login" && request.method === "POST") {

      try {

        const formData = await request.formData();

        const password = formData.get("password");

        if (
          typeof password !== "string" ||
          !password ||
          password !== env.APP_PASSWORD
        ) {

          return new Response(
            loginPage("❌ Contraseña incorrecta."),
            {
              status: 401,
              headers: {
                "content-type": "text/html;charset=UTF-8",
                "cache-control": "no-store"
              }
            }
          );

        }

        const timestamp = String(Date.now());

        const signature = await createSessionSignature(
          timestamp,
          env.APP_PASSWORD
        );

        const cookieValue = `${timestamp}.${signature}`;

        return new Response(null, {
          status: 303,

          headers: {

            "Location": "/",

            "Set-Cookie":
              `${SESSION_COOKIE}=${cookieValue}; ` +
              `Max-Age=${SESSION_MAX_AGE}; ` +
              `Path=/; ` +
              `HttpOnly; ` +
              `Secure; ` +
              `SameSite=Strict`,

            "Cache-Control": "no-store"

          }

        });

      } catch (error) {

        return new Response(
          "Error durante el inicio de sesión.",
          {
            status: 500
          }
        );

      }

    }

    // ==========================================
    // PROTEGER TODO LO DEMÁS
    // ==========================================

    const authenticated = await isAuthenticated(
      request,
      env
    );

    if (!authenticated) {

      if (request.method === "GET") {

        return new Response(
          loginPage(),
          {
            status: 200,
            headers: {
              "content-type": "text/html;charset=UTF-8",
              "cache-control": "no-store"
            }
          }
        );

      }

      return Response.json(
        {
          error: "No autorizado."
        },
        {
          status: 401
        }
      );

    }

    // ==========================================
    // API DE CHAT
    // ==========================================

    if (request.method === "POST") {

      try {

        const data = await request.json();

        const question = data.question;

        if (!question) {

          return Response.json(
            {
              error: "No se recibió ninguna pregunta."
            },
            {
              status: 400
            }
          );

        }

        const messages = [

          {
            role: "system",

            content: `
Eres Marcel Trading IA, un asistente especializado en trading.

Tu objetivo es ayudar al usuario a analizar mercados y mejorar su proceso de toma de decisiones.

CONOCIMIENTOS PRINCIPALES:

- Price Action
- Market Structure
- Liquidity
- CRT (Candle Range Theory)
- PO3
- FVG (Fair Value Gap)
- Order Flow
- Footprint
- DOM
- Volumen
- Soportes y resistencias
- Gestión monetaria
- Psicología del trading

REGLAS IMPORTANTES:

1. Responde siempre en español.

2. No inventes precios, datos de mercado, noticias ni información que no tengas.

3. Si el usuario no proporciona suficiente información, pídele los datos necesarios.

4. No presentes una operación como segura.

5. Diferencia siempre entre:
   - hecho
   - interpretación
   - hipótesis
   - confirmación necesaria

6. Prioriza la gestión del riesgo sobre la búsqueda de beneficios.

7. Nunca recomiendes aumentar el riesgo para recuperar pérdidas.

8. Si analizas una operación, intenta estructurar la respuesta así:

   CONTEXTO
   ESTRUCTURA
   LIQUIDEZ
   ZONA DE INTERÉS
   CONFIRMACIÓN
   INVALIDACIÓN
   RIESGO
   RATIO R:R
   CONCLUSIÓN

9. Si el usuario habla de CRT, PO3, FVG u Order Flow, utiliza esos conceptos correctamente y explica el razonamiento.

10. Si falta información, dilo claramente.

11. No prometas resultados ni beneficios.

12. Sé directo y práctico. Evita respuestas genéricas.

13. Si detectas que el usuario está actuando por miedo, revancha, FOMO o intentando recuperar una pérdida, señálalo.

Tu función es ayudar al usuario a pensar como un trader disciplinado, no simplemente decirle "compra" o "vende".
`
          },

          {
            role: "user",
            content: question
          }

        ];

        const response = await env.AI.run(
          "@cf/meta/llama-3.2-1b-instruct",
          {
            messages,
            max_tokens: 700,
            temperature: 0.25
          }
        );

        return Response.json({
          answer:
            response.response ||
            "No he podido generar una respuesta."
        });

      } catch (error) {

        return Response.json(
          {
            error: "Error al consultar la IA.",
            details: String(error)
          },
          {
            status: 500
          }
        );

      }

    }

    // ==========================================
    // INTERFAZ WEB
    // ==========================================

    const html = `<!DOCTYPE html>

<html lang="es">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1">

<meta name="theme-color" content="#0b1020">

<title>Marcel Trading IA</title>

<style>

*{
box-sizing:border-box
}

body{
margin:0;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
background:#0b1020;
color:#fff;
}

.container{
max-width:1100px;
margin:auto;
padding:25px 18px 50px;
}

header{
display:flex;
justify-content:space-between;
align-items:center;
margin-bottom:25px;
}

.logo{
font-size:25px;
font-weight:800;
}

.logo span{
color:#5b8cff;
}

.badge{
background:#17213d;
border:1px solid #2d3b62;
padding:7px 12px;
border-radius:20px;
font-size:13px;
}

h1{
font-size:32px;
margin:10px 0 8px;
}

.subtitle{
color:#9ca8c4;
margin-bottom:25px;
}

.grid{
display:grid;
grid-template-columns:repeat(3,1fr);
gap:15px;
}

.card{
background:#121a2d;
border:1px solid #25314e;
border-radius:16px;
padding:20px;
}

.card h2{
margin-top:0;
font-size:19px;
}

.card p{
color:#9ca8c4;
line-height:1.5;
}

input,select,textarea{
width:100%;
padding:12px;
margin:6px 0 10px;
background:#0b1020;
color:#fff;
border:1px solid #34415f;
border-radius:9px;
font-size:15px;
}

button{
border:0;
border-radius:9px;
padding:12px 16px;
background:#4f7cff;
color:#fff;
font-weight:700;
cursor:pointer;
}

.result{
margin-top:12px;
padding:12px;
border-radius:9px;
background:#0b1020;
border:1px solid #263452;
line-height:1.6;
}

.chat{
margin-top:18px;
}

.messages{
height:300px;
overflow:auto;
padding:12px;
background:#0b1020;
border-radius:10px;
border:1px solid #293655;
margin-bottom:10px;
}

.msg{
padding:10px 12px;
margin:7px 0;
border-radius:10px;
max-width:90%;
white-space:pre-wrap;
}

.user{
background:#23418a;
margin-left:auto;
}

.ai{
background:#1b263e;
}

.full{
grid-column:1/-1;
}

@media(max-width:800px){

.grid{
grid-template-columns:1fr;
}

.full{
grid-column:auto;
}

}

</style>

</head>

<body>

<div class="container">

<header>

<div class="logo">
Marcel <span>Trading IA</span>
</div>

<div class="badge">
● IA conectada
</div>

</header>

<h1>
Panel de Trading Inteligente
</h1>

<div class="subtitle">
Analiza setups, calcula riesgo y consulta a Marcel Trading IA.
</div>

<div class="grid">

<div class="card">

<h2>📊 Analizador de Setup</h2>

<p>
Introduce los datos de una operación.
</p>

<select id="asset">

<option>NAS100 / NQ</option>
<option>XAUUSD</option>
<option>EURUSD</option>
<option>GBPUSD</option>
<option>SP500</option>

</select>

<select id="direction">

<option>LONG</option>
<option>SHORT</option>

</select>

<input
id="entry"
type="number"
step="any"
placeholder="Entrada"
>

<input
id="sl"
type="number"
step="any"
placeholder="Stop Loss"
>

<input
id="tp"
type="number"
step="any"
placeholder="Take Profit"
>

<button onclick="analyze()">
Analizar setup
</button>

<div id="analysis" class="result">
Esperando datos...
</div>

</div>


<div class="card">

<h2>🛡️ Gestión de Riesgo</h2>

<p>
Calcula el riesgo máximo de la operación.
</p>

<input
id="account"
type="number"
placeholder="Capital (€)"
>

<input
id="risk"
type="number"
step="0.1"
value="1"
placeholder="Riesgo %"
>

<button onclick="riskCalc()">
Calcular riesgo
</button>

<div id="riskResult" class="result">
Introduce capital y riesgo.
</div>

</div>


<div class="card">

<h2>📓 Diario</h2>

<p>
Registra el resultado y aprendizaje de la operación.
</p>

<select id="tradeResult">

<option>Ganadora</option>
<option>Perdedora</option>
<option>Break Even</option>

</select>

<textarea
id="notes"
rows="5"
placeholder="¿Por qué entraste? ¿Qué viste?"
></textarea>

<button onclick="saveTrade()">
Guardar operación
</button>

<div id="saved" class="result">
No hay operación guardada.
</div>

</div>


<div class="card full chat">

<h2>🤖 Marcel Trading IA</h2>

<div class="messages" id="messages">

<div class="msg ai">

Hola Marcel 👋

Soy tu asistente de trading.

Pregúntame sobre CRT, PO3, FVG, Order Flow, estructura, liquidez, riesgo o cualquier operación que quieras analizar.

</div>

</div>

<input
id="question"
placeholder="Escribe tu pregunta..."
>

<button onclick="askAI()">
Enviar
</button>

</div>

</div>

</div>


<script>

function analyze(){

const entry=parseFloat(
document.getElementById("entry").value
);

const sl=parseFloat(
document.getElementById("sl").value
);

const tp=parseFloat(
document.getElementById("tp").value
);

const direction=
document.getElementById("direction").value;

if(!entry || !sl || !tp){

document.getElementById("analysis").innerHTML=
"⚠️ Completa entrada, SL y TP.";

return;

}

let risk;
let reward;

if(direction==="LONG"){

risk=Math.abs(entry-sl);
reward=Math.abs(tp-entry);

}else{

risk=Math.abs(sl-entry);
reward=Math.abs(entry-tp);

}

if(risk === 0){

document.getElementById("analysis").innerHTML=
"⚠️ El Stop Loss no puede coincidir con la entrada.";

return;

}

const rr=reward/risk;

let verdict;

if(rr>=3)
verdict="🟢 R:R atractivo";

else if(rr>=2)
verdict="🟡 R:R aceptable";

else
verdict="🔴 R:R bajo";

document.getElementById("analysis").innerHTML=

"<b>"+verdict+"</b><br>"+
"Distancia SL: "+risk.toFixed(2)+"<br>"+
"Distancia TP: "+reward.toFixed(2)+"<br>"+
"Ratio R:R: 1:"+rr.toFixed(2);

}


function riskCalc(){

const account=parseFloat(
document.getElementById("account").value
);

const risk=parseFloat(
document.getElementById("risk").value
);

if(!account || !risk){

document.getElementById("riskResult").innerHTML=
"⚠️ Introduce capital y porcentaje de riesgo.";

return;

}

const amount=
account*(risk/100);

document.getElementById("riskResult").innerHTML=

"<b>Riesgo máximo:</b> €"+
amount.toFixed(2);

}


function saveTrade(){

const result=
document.getElementById("tradeResult").value;

const notes=
document.getElementById("notes").value;

if(!notes){

document.getElementById("saved").innerHTML=
"⚠️ Escribe una nota.";

return;

}

localStorage.setItem(
"lastTrade",
JSON.stringify({
result,
notes,
date:new Date().toLocaleString()
})
);

document.getElementById("saved").innerHTML=

"✅ Operación guardada<br>"+
"<b>"+result+"</b><br>"+
notes;

}


async function askAI(){

const input=
document.getElementById("question");

const question=
input.value.trim();

if(!question)return;

const messages=
document.getElementById("messages");

messages.innerHTML+=

'<div class="msg user">'+
escapeHtml(question)+
'</div>';

input.value="";

const loading=
document.createElement("div");

loading.className="msg ai";

loading.textContent=
"🧠 Analizando...";

messages.appendChild(loading);

messages.scrollTop=
messages.scrollHeight;

try{

const response=
await fetch("/",{

method:"POST",

headers:{
"Content-Type":"application/json"
},

body:JSON.stringify({
question
})

});

const data=
await response.json();

loading.remove();

if(data.error){

throw new Error(data.error);

}

messages.innerHTML+=

'<div class="msg ai">'+
escapeHtml(data.answer)+
'</div>';

}catch(error){

loading.remove();

messages.innerHTML+=

'<div class="msg ai">'+
"⚠️ Error al conectar con la IA: "+
escapeHtml(error.message)+
'</div>';

}

messages.scrollTop=
messages.scrollHeight;

}


function escapeHtml(text){

return String(text)
.replaceAll("&","&amp;")
.replaceAll("<","&lt;")
.replaceAll(">","&gt;")
.replaceAll('"',"&quot;")
.replaceAll("'","&#039;");

}

</script>

</body>

</html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html;charset=UTF-8",
        "cache-control": "no-store"
      }
    });

  }
};
