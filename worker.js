export default {
  async fetch(request) {
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Marcel Trading IA</title>

<style>
*{box-sizing:border-box}
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
.logo span{color:#5b8cff}
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
button:hover{opacity:.9}
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
  height:220px;
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
.stat{
  font-size:27px;
  font-weight:800;
}
.small{
  font-size:13px;
  color:#8f9bb5;
}
@media(max-width:800px){
  .grid{grid-template-columns:1fr}
  .full{grid-column:auto}
}
</style>
</head>

<body>

<div class="container">

<header>
  <div class="logo">Marcel <span>Trading IA</span></div>
  <div class="badge">● Sistema activo</div>
</header>

<h1>Panel de Trading Inteligente</h1>
<div class="subtitle">
  Analiza setups, calcula riesgo y registra tus operaciones.
</div>

<div class="grid">

<div class="card">
<h2>📊 Analizador de Setup</h2>
<p>Introduce los datos de una operación para obtener una valoración inicial.</p>

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

<input id="entry" type="number" step="any" placeholder="Entrada">
<input id="sl" type="number" step="any" placeholder="Stop Loss">
<input id="tp" type="number" step="any" placeholder="Take Profit">

<button onclick="analyze()">Analizar setup</button>

<div id="analysis" class="result">
Esperando datos...
</div>
</div>


<div class="card">
<h2>🛡️ Gestión de Riesgo</h2>
<p>Calcula cuánto dinero estás arriesgando antes de entrar.</p>

<input id="account" type="number" placeholder="Capital de cuenta (€)">
<input id="risk" type="number" step="0.1" value="1" placeholder="Riesgo %">

<button onclick="riskCalc()">Calcular riesgo</button>

<div id="riskResult" class="result">
Introduce capital y riesgo.
</div>
</div>


<div class="card">
<h2>📓 Diario de Trading</h2>
<p>Registra rápidamente el motivo de tu operación.</p>

<select id="tradeResult">
<option>Ganadora</option>
<option>Perdedora</option>
<option>Break Even</option>
</select>

<textarea id="notes" rows="5"
placeholder="¿Por qué entraste? ¿Qué viste? ¿Respetaste el plan?"></textarea>

<button onclick="saveTrade()">Guardar operación</button>

<div id="saved" class="result">
No hay operación guardada.
</div>
</div>


<div class="card full chat">

<h2>🤖 Marcel Trading IA</h2>

<div class="messages" id="messages">
<div class="msg ai">
Hola Marcel. Soy tu asistente de trading.<br><br>
Puedes preguntarme sobre una operación, riesgo, estructura, FVG, CRT, PO3 u Order Flow.
</div>
</div>

<input id="question"
placeholder="Escribe tu pregunta...">

<button onclick="askAI()">Enviar</button>

</div>

</div>

</div>


<script>

function analyze(){

  const entry=parseFloat(document.getElementById("entry").value);
  const sl=parseFloat(document.getElementById("sl").value);
  const tp=parseFloat(document.getElementById("tp").value);
  const direction=document.getElementById("direction").value;

  if(!entry || !sl || !tp){
    document.getElementById("analysis").innerHTML=
      "⚠️ Completa entrada, SL y TP.";
    return;
  }

  let risk, reward;

  if(direction==="LONG"){
    risk=Math.abs(entry-sl);
    reward=Math.abs(tp-entry);
  }else{
    risk=Math.abs(sl-entry);
    reward=Math.abs(entry-tp);
  }

  const rr=reward/risk;

  let verdict;

  if(rr>=3)
    verdict="🟢 Setup atractivo";
  else if(rr>=2)
    verdict="🟡 Setup aceptable";
  else
    verdict="🔴 R:R bajo";

  document.getElementById("analysis").innerHTML=
    "<b>"+verdict+"</b><br>"+
    "Distancia SL: "+risk.toFixed(2)+"<br>"+
    "Distancia TP: "+reward.toFixed(2)+"<br>"+
    "Ratio R:R: 1:"+rr.toFixed(2);
}


function riskCalc(){

  const account=parseFloat(document.getElementById("account").value);
  const risk=parseFloat(document.getElementById("risk").value);

  if(!account || !risk){
    document.getElementById("riskResult").innerHTML=
      "⚠️ Introduce capital y porcentaje de riesgo.";
    return;
  }

  const amount=account*(risk/100);

  document.getElementById("riskResult").innerHTML=
    "<b>Riesgo máximo:</b> €"+amount.toFixed(2)+"<br>"+
    "<span class='small'>Esto representa el "+risk+"% de la cuenta.</span>";
}


function saveTrade(){

  const result=document.getElementById("tradeResult").value;
  const notes=document.getElementById("notes").value;

  if(!notes){
    document.getElementById("saved").innerHTML=
      "⚠️ Escribe una nota antes de guardar.";
    return;
  }

  localStorage.setItem(
    "lastTrade",
    JSON.stringify({
      result:result,
      notes:notes,
      date:new Date().toLocaleString()
    })
  );

  document.getElementById("saved").innerHTML=
    "✅ Operación guardada<br>"+
    "<b>"+result+"</b><br>"+
    notes;
}


function askAI(){

  const input=document.getElementById("question");
  const question=input.value.trim();

  if(!question)return;

  const messages=document.getElementById("messages");

  messages.innerHTML+=
    '<div class="msg user">'+
    escapeHtml(question)+
    '</div>';

  let answer=
    "Para analizarlo correctamente necesito contexto: activo, timeframe, entrada, SL, TP y qué estructura estás viendo. No tomes una operación únicamente por esta respuesta.";

  const q=question.toLowerCase();

  if(q.includes("riesgo")){
    answer=
      "La prioridad es definir primero cuánto estás dispuesto a perder. "+
      "Después calcula el tamaño de posición según la distancia del SL. "+
      "No aumentes el riesgo para recuperar una pérdida.";
  }

  if(q.includes("fvg")){
    answer=
      "Un FVG puede actuar como zona de interés, pero no debería utilizarse "+
      "como entrada automática sin contexto. Comprueba estructura, liquidez, "+
      "desplazamiento y reacción del precio.";
  }

  if(q.includes("crt")){
    answer=
      "En CRT interesa especialmente observar el rango de la vela de referencia, "+
      "la toma de liquidez y la posterior expansión. El contexto y el timeframe "+
      "son fundamentales.";
  }

  if(q.includes("po3")){
    answer=
      "Para un PO3 puedes estudiar acumulación, manipulación y distribución, "+
      "pero evita asumir que toda ruptura es una manipulación. Busca confirmación "+
      "con estructura y desplazamiento.";
  }

  messages.innerHTML+=
    '<div class="msg ai">'+escapeHtml(answer)+'</div>';

  messages.scrollTop=messages.scrollHeight;
  input.value="";
}


function escapeHtml(text){
  return text
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

</script>

</body>
</html>`;

    return new Response(html,{
      headers:{
        "content-type":"text/html;charset=UTF-8"
      }
    });
  }
};
