const SESSION_COOKIE = "mtia_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const VISION_MODEL =
  "@cf/meta/llama-3.2-11b-vision-instruct";


// =====================================================
// SESIONES
// =====================================================

async function createSessionSignature(timestamp, password) {

  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    {
      name: "HMAC",
      hash: "SHA-256"
    },
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

  const cookieHeader =
    request.headers.get("Cookie") || "";

  const cookies = Object.fromEntries(

    cookieHeader
      .split(";")
      .map(cookie =>
        cookie.trim().split("=")
      )
      .filter(parts =>
        parts.length === 2
      )

  );

  const session =
    cookies[SESSION_COOKIE];

  if (!session) {
    return false;
  }

  const [
    timestamp,
    signature
  ] = session.split(".");

  if (!timestamp || !signature) {
    return false;
  }

  const timestampNumber =
    Number(timestamp);

  if (!Number.isFinite(timestampNumber)) {
    return false;
  }

  const now = Date.now();

  if (
    now - timestampNumber >
    SESSION_MAX_AGE * 1000
  ) {
    return false;
  }

  if (
    timestampNumber >
    now + 60000
  ) {
    return false;
  }

  const expectedSignature =
    await createSessionSignature(
      timestamp,
      env.APP_PASSWORD
    );

  return (
    signature ===
    expectedSignature
  );

}


// =====================================================
// PÁGINA LOGIN
// =====================================================

function loginPage(error = "") {

  return `<!DOCTYPE html>

<html lang="es">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1">

<meta name="theme-color"
content="#0b1020">

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


// =====================================================
// WORKER
// =====================================================

export default {

  async fetch(request, env) {

    const url =
      new URL(request.url);


    // =================================================
    // LOGIN
    // =================================================

    if (
      url.pathname === "/login" &&
      request.method === "POST"
    ) {

      try {

        const formData =
          await request.formData();

        const password =
          formData.get("password");

        if (
          typeof password !== "string" ||
          !password ||
          password !== env.APP_PASSWORD
        ) {

          return new Response(

            loginPage(
              "❌ Contraseña incorrecta."
            ),

            {
              status:401,

              headers:{
                "content-type":
                  "text/html;charset=UTF-8",

                "cache-control":
                  "no-store"
              }
            }

          );

        }

        const timestamp =
          String(Date.now());

        const signature =
          await createSessionSignature(
            timestamp,
            env.APP_PASSWORD
          );

        const cookieValue =
          `${timestamp}.${signature}`;

        return new Response(null, {

          status:303,

          headers:{

            "Location":"/",

            "Set-Cookie":
              `${SESSION_COOKIE}=${cookieValue}; ` +
              `Max-Age=${SESSION_MAX_AGE}; ` +
              `Path=/; ` +
              `HttpOnly; ` +
              `Secure; ` +
              `SameSite=Strict`,

            "Cache-Control":
              "no-store"

          }

        });

      } catch(error) {

        return new Response(
          "Error durante el inicio de sesión.",
          {
            status:500
          }
        );

      }

    }


    // =================================================
    // PROTEGER TODO
    // =================================================

    const authenticated =
      await isAuthenticated(
        request,
        env
      );

    if (!authenticated) {

      if (request.method === "GET") {

        return new Response(

          loginPage(),

          {
            status:200,

            headers:{
              "content-type":
                "text/html;charset=UTF-8",

              "cache-control":
                "no-store"
            }
          }

        );

      }

      return Response.json(

        {
          error:"No autorizado."
        },

        {
          status:401
        }

      );

    }


    // =================================================
    // AUTORIZACIÓN META
    // =================================================
    //
    // Visita:
    //
    // /vision-agree
    //
    // una sola vez después del despliegue.
    //
    // =================================================

    if (
      url.pathname === "/vision-agree" &&
      request.method === "GET"
    ) {

      try {

        const agreement =
          await env.AI.run(
            VISION_MODEL,
            {
              prompt:"agree"
            }
          );

        return new Response(

          `<!DOCTYPE html>

<html lang="es">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1">

<title>Marcel Trading IA</title>

<style>

body{
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
background:#0b1020;
color:white;
padding:30px;
}

.box{
max-width:600px;
margin:auto;
background:#121a2d;
border:1px solid #25314e;
border-radius:18px;
padding:25px;
}

.ok{
font-size:20px;
font-weight:700;
margin-bottom:15px;
}

pre{
white-space:pre-wrap;
word-break:break-word;
color:#9ca8c4;
}

a{
display:inline-block;
margin-top:20px;
padding:12px 18px;
background:#4f7cff;
color:white;
text-decoration:none;
border-radius:9px;
}

</style>

</head>

<body>

<div class="box">

<div class="ok">
✅ Solicitud de autorización enviada
</div>

<p>
La primera autorización del modelo Vision se ha ejecutado.
</p>

<pre>${escapeHtml(
  JSON.stringify(
    agreement,
    null,
    2
  )
)}</pre>

<a href="/">
Volver a Marcel Trading IA
</a>

</div>

</body>

</html>`,

          {
            headers:{
              "content-type":
                "text/html;charset=UTF-8",
              "cache-control":
                "no-store"
            }
          }

        );

      } catch(error) {

        return new Response(

          `Error al autorizar el modelo:

${String(error)}`,

          {
            status:500,
            headers:{
              "content-type":
                "text/plain;charset=UTF-8"
            }
          }

        );

      }

    }


    // =================================================
    // API DE CHAT + IMÁGENES
    // =================================================

    if (
      request.method === "POST" &&
      url.pathname === "/"
    ) {

      try {

        const data =
          await request.json();

        const question =
          typeof data.question === "string"
            ? data.question.trim()
            : "";

        const image =
          typeof data.image === "string" &&
          data.image.startsWith("data:image/")
            ? data.image
            : null;


        if (!question && !image) {

          return Response.json(

            {
              error:
                "Escribe una pregunta o sube una imagen."
            },

            {
              status:400
            }

          );

        }


        const systemPrompt = `

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

9. Si el usuario habla de CRT, PO3, FVG u Order Flow, utiliza esos conceptos correctamente.

10. Si falta información, dilo claramente.

11. No prometas resultados ni beneficios.

12. Sé directo y práctico.

13. Si detectas miedo, revancha, FOMO o intención de recuperar una pérdida, señálalo.

14. Si recibes una imagen:

- Describe únicamente lo que puedas observar.
- No inventes niveles que no sean visibles.
- Si es una captura de TradingView, analiza estructura, liquidez, FVG, CRT, PO3, velas y demás elementos visibles.
- Si no puedes identificar un dato con claridad, dilo.
- Distingue observación de interpretación.
- No asumas el precio actual si no aparece claramente.

Tu función es ayudar al usuario a pensar como un trader disciplinado, no simplemente decirle "compra" o "vende".

`;


        const messages = [

          {
            role:"system",
            content:systemPrompt
          },

          {
            role:"user",
            content:
              question ||
              "Analiza esta imagen y dime qué observas."
          }

        ];


        const options = {

          messages,

          max_tokens:700,

          temperature:0.25

        };


        if (image) {

          options.image = image;

        }


        const response =
          await env.AI.run(
            VISION_MODEL,
            options
          );


        return Response.json({

          answer:
            response.response ||
            "No he podido generar una respuesta."

        });


      } catch(error) {

        return Response.json(

          {
            error:
              "Error al consultar la IA.",

            details:
              String(error)
          },

          {
            status:500
          }

        );

      }

    }


    // =================================================
    // INTERFAZ WEB
    // =================================================

    const html = `<!DOCTYPE html>

<html lang="es">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,initial-scale=1">

<meta name="theme-color"
content="#0b1020">

<title>Marcel Trading IA</title>

<style>

*{
box-sizing:border-box;
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
margin-bottom:20px;
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
font-size:30px;
margin:10px 0 8px;
}

.subtitle{
color:#9ca8c4;
margin-bottom:20px;
}


/* ==========================================
   CHAT ARRIBA
   ========================================== */

.main-chat{
background:#121a2d;
border:1px solid #25314e;
border-radius:18px;
padding:20px;
margin-bottom:18px;
}

.main-chat h2{
margin-top:0;
}

.messages{
height:360px;
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
max-width:92%;
white-space:pre-wrap;
line-height:1.5;
}

.user{
background:#23418a;
margin-left:auto;
}

.ai{
background:#1b263e;
}


/* ==========================================
   IMAGEN
   ========================================== */

.image-tools{
display:flex;
gap:10px;
align-items:center;
flex-wrap:wrap;
margin-bottom:10px;
}

.image-button{
display:inline-block;
padding:11px 15px;
background:#26385f;
border-radius:9px;
font-weight:700;
cursor:pointer;
}

#imageInput{
display:none;
}

#imagePreview{
display:none;
max-width:100%;
max-height:300px;
border-radius:10px;
border:1px solid #34415f;
margin-top:10px;
}

.remove-image{
background:#3a1720;
border:1px solid #713040;
color:#ffb7c2;
padding:9px 12px;
border-radius:9px;
cursor:pointer;
display:none;
}

.question-row{
display:flex;
gap:10px;
}

.question-row input{
flex:1;
}

.send-button{
width:auto;
padding:12px 20px;
}


/* ==========================================
   RESTO
   ========================================== */

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

input,
select,
textarea{
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

.question-row{
flex-direction:column;
}

.send-button{
width:100%;
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
● IA Vision conectada
</div>

</header>


<h1>
Marcel Trading IA
</h1>

<div class="subtitle">
Analiza gráficos, imágenes y setups de trading.
</div>


<!-- ==========================================
     CHAT PRINCIPAL ARRIBA
     ========================================== -->

<div class="main-chat">

<h2>
🤖 Pregunta o sube una imagen
</h2>

<div class="messages" id="messages">

<div class="msg ai">

Hola Marcel 👋

Soy tu asistente de trading.

Puedes escribirme una pregunta o subir una captura de TradingView y analizaré lo que aparece en ella.

</div>

</div>


<div class="image-tools">

<label
for="imageInput"
class="image-button"
>
🖼️ Subir imagen
</label>

<input
id="imageInput"
type="file"
accept="image/*"
>

<button
class="remove-image"
id="removeImage"
onclick="removeImage()"
>
✕ Quitar imagen
</button>

</div>


<img
id="imagePreview"
alt="Vista previa"
>


<div class="question-row">

<input
id="question"
placeholder="Escribe tu pregunta..."
>

<button
class="send-button"
onclick="askAI()"
>
Enviar
</button>

</div>

</div>


<!-- ==========================================
     RESTO DE HERRAMIENTAS DEBAJO
     ========================================== -->

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
Registra el resultado y aprendizaje.
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


</div>

</div>


<script>

let selectedImage = null;


// =================================================
// IMAGEN
// =================================================

document
.getElementById("imageInput")
.addEventListener(
"change",
handleImage
);


function handleImage(event){

const file =
event.target.files[0];

if(!file){
return;
}

if(!file.type.startsWith("image/")){

alert(
"Selecciona una imagen."
);

return;

}


const reader =
new FileReader();


reader.onload = function(e){

const img =
new Image();

img.onload = function(){

const maxSize = 1600;

let width =
img.width;

let height =
img.height;


if(width > maxSize){

height =
Math.round(
height *
maxSize /
width
);

width =
maxSize;

}


if(height > maxSize){

width =
Math.round(
width *
maxSize /
height
);

height =
maxSize;

}


const canvas =
document.createElement(
"canvas"
);

canvas.width =
width;

canvas.height =
height;


const ctx =
canvas.getContext(
"2d"
);

ctx.drawImage(
img,
0,
0,
width,
height
);


selectedImage =
canvas.toDataURL(
"image/jpeg",
0.82
);


const preview =
document.getElementById(
"imagePreview"
);

preview.src =
selectedImage;

preview.style.display =
"block";


document
.getElementById(
"removeImage"
)
.style.display =
"inline-block";

};


img.src =
e.target.result;

};


reader.readAsDataURL(file);

}


function removeImage(){

selectedImage =
null;

document
.getElementById(
"imageInput"
)
.value = "";

document
.getElementById(
"imagePreview"
)
.style.display =
"none";

document
.getElementById(
"removeImage"
)
.style.display =
"none";

}


// =================================================
// ANALIZADOR
// =================================================

function analyze(){

const entry =
parseFloat(
document.getElementById(
"entry"
).value
);

const sl =
parseFloat(
document.getElementById(
"sl"
).value
);

const tp =
parseFloat(
document.getElementById(
"tp"
).value
);

const direction =
document.getElementById(
"direction"
).value;


if(
!Number.isFinite(entry) ||
!Number.isFinite(sl) ||
!Number.isFinite(tp)
){

document.getElementById(
"analysis"
).innerHTML =
"⚠️ Completa entrada, SL y TP.";

return;

}


let risk;
let reward;


if(direction === "LONG"){

risk =
Math.abs(
entry - sl
);

reward =
Math.abs(
tp - entry
);

}else{

risk =
Math.abs(
sl - entry
);

reward =
Math.abs(
entry - tp
);

}


if(risk === 0){

document.getElementById(
"analysis"
).innerHTML =
"⚠️ El Stop Loss no puede coincidir con la entrada.";

return;

}


const rr =
reward / risk;


let verdict;


if(rr >= 3){

verdict =
"🟢 R:R atractivo";

}else if(rr >= 2){

verdict =
"🟡 R:R aceptable";

}else{

verdict =
"🔴 R:R bajo";

}


document.getElementById(
"analysis"
).innerHTML =

"<b>" +
verdict +
"</b><br>" +

"Distancia SL: " +
risk.toFixed(2) +
"<br>" +

"Distancia TP: " +
reward.toFixed(2) +
"<br>" +

"Ratio R:R: 1:" +
rr.toFixed(2);

}


// =================================================
// RIESGO
// =================================================

function riskCalc(){

const account =
parseFloat(
document.getElementById(
"account"
).value
);

const risk =
parseFloat(
document.getElementById(
"risk"
).value
);


if(
!Number.isFinite(account) ||
!Number.isFinite(risk)
){

document.getElementById(
"riskResult"
).innerHTML =
"⚠️ Introduce capital y porcentaje de riesgo.";

return;

}


const amount =
account *
(risk / 100);


document.getElementById(
"riskResult"
).innerHTML =

"<b>Riesgo máximo:</b> €" +
amount.toFixed(2);

}


// =================================================
// DIARIO
// =================================================

function saveTrade(){

const result =
document.getElementById(
"tradeResult"
).value;

const notes =
document.getElementById(
"notes"
).value.trim();


if(!notes){

document.getElementById(
"saved"
).innerHTML =
"⚠️ Escribe una nota.";

return;

}


localStorage.setItem(

"lastTrade",

JSON.stringify({

result,
notes,
date:
new Date().toLocaleString()

})

);


document.getElementById(
"saved"
).innerHTML =

"✅ Operación guardada<br>" +

"<b>" +
escapeHtml(result) +
"</b><br>" +

escapeHtml(notes);

}


// =================================================
// IA
// =================================================

async function askAI(){

const input =
document.getElementById(
"question"
);

const question =
input.value.trim();


if(
!question &&
!selectedImage
){

alert(
"Escribe una pregunta o sube una imagen."
);

return;

}


const messages =
document.getElementById(
"messages"
);


if(question){

messages.innerHTML +=

'<div class="msg user">' +

escapeHtml(
question
) +

'</div>';

}else{

messages.innerHTML +=

'<div class="msg user">' +

"🖼️ Imagen enviada para análisis" +

'</div>';

}


input.value = "";


const loading =
document.createElement(
"div"
);

loading.className =
"msg ai";

loading.textContent =
"🧠 Analizando...";

messages.appendChild(
loading
);

messages.scrollTop =
messages.scrollHeight;


try{

const response =
await fetch(
"/",
{

method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:
JSON.stringify({

question,

image:
selectedImage

})

}
);


const data =
await response.json();


loading.remove();


if(data.error){

throw new Error(
data.error
);

}


messages.innerHTML +=

'<div class="msg ai">' +

escapeHtml(
data.answer
) +

'</div>';


}catch(error){

loading.remove();


messages.innerHTML +=

'<div class="msg ai">' +

"⚠️ Error al conectar con la IA: " +

escapeHtml(
error.message
) +

'</div>';

}


messages.scrollTop =
messages.scrollHeight;

}


// =================================================
// ESCAPE HTML
// =================================================

function escapeHtml(text){

return String(text)

.replaceAll(
"&",
"&amp;"
)

.replaceAll(
"<",
"&lt;"
)

.replaceAll(
">",
"&gt;"
)

.replaceAll(
'"',
"&quot;"
)

.replaceAll(
"'",
"&#039;"
);

}

</script>

</body>

</html>`;


    return new Response(

      html,

      {
        headers:{
          "content-type":
            "text/html;charset=UTF-8",

          "cache-control":
            "no-store"
        }
      }

    );

  }

};


// =====================================================
// ESCAPE HTML PARA RESPUESTAS
// =====================================================

function escapeHtml(text){

return String(text)

.replaceAll(
"&",
"&amp;"
)

.replaceAll(
"<",
"&lt;"
)

.replaceAll(
">",
"&gt;"
)

.replaceAll(
'"',
"&quot;"
)

.replaceAll(
"'",
"&#039;"
);

}
