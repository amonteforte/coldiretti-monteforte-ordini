// === CONFIGURA QUI ===
const AZIENDA_NOME = "COLDIRETTI MONTEFORTE";
const WHATSAPP_NUMERO = "393386254626";
const MIN_HOURS_BEFORE = 48;
// ======================

const form = document.getElementById("orderForm");
const items = document.getElementById("items");
const addRowBtn = document.getElementById("addRow");
const preview = document.getElementById("orderPreview");
const statusEl = document.getElementById("status");
const sendWhatsappBtn = document.getElementById("sendWhatsapp");

const dataRitiroEl = document.getElementById("dataRitiro");
const fasciaOrariaEl = document.getElementById("fasciaOraria");

const calOverlay = document.getElementById("calOverlay");
const calGrid = document.getElementById("calGrid");
const calTitle = document.getElementById("calTitle");
const calPrev = document.getElementById("calPrev");
const calNext = document.getElementById("calNext");
const calClose = document.getElementById("calClose");
const openCalendarBtn = document.getElementById("openCalendar");

let lastOrderText = "";

// ======================
// UTIL
// ======================
function setStatus(msg) {
  statusEl.textContent = msg || "";
}

function getValue(id) {
  return (document.getElementById(id).value || "").trim();
}

function getItems() {
  const rows = items.querySelectorAll(".itemRow");
  const out = [];
  rows.forEach(r => {
    const p = r.querySelector(".prodotto").value.trim();
    const q = r.querySelector(".quantita").value.trim();
    if (p && q) out.push({ prodotto: p, quantita: q });
  });
  return out;
}

// ======================
// DATE / FASCE
// ======================
const TIME_OPTIONS_FULL = ["09:00 - 11:00", "11:00 - 13:00", "15:00 - 17:00", "17:00 - 19:00"];
const TIME_OPTIONS_SUNDAY = ["09:00 - 11:00", "11:00 - 13:00"];

function setTimeOptions(options) {
  const current = fasciaOrariaEl.value;
  fasciaOrariaEl.querySelectorAll("option:not([value=''])").forEach(o => o.remove());

  options.forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    fasciaOrariaEl.appendChild(opt);
  });

  fasciaOrariaEl.value = options.includes(current) ? current : "";
}

function isMonday(d){ return d.getDay() === 1; }
function isSunday(d){ return d.getDay() === 0; }
function fromYMD(v){ return new Date(v + "T12:00:00"); }

// ======================
// SOGLIA 48 ORE REALI
// ======================
const now = new Date();
const minDateTime = new Date(now.getTime() + MIN_HOURS_BEFORE * 60 * 60 * 1000);
// confronto a livello di giorno (UX coerente)
const minValidDate = new Date(minDateTime.toDateString());

function applyRulesForDate(d){
  if (d < minValidDate) {
    setStatus("⚠️ Gli ordini devono essere effettuati almeno 48 ore prima del ritiro.");
    sendWhatsappBtn.disabled = true;
    setTimeOptions([]);
    return false;
  }

  if (isMonday(d)) {
    setStatus("⚠️ Il ritiro non è disponibile il lunedì.");
    sendWhatsappBtn.disabled = true;
    setTimeOptions([]);
    return false;
  }

  setStatus("");
  setTimeOptions(isSunday(d) ? TIME_OPTIONS_SUNDAY : TIME_OPTIONS_FULL);
  return true;
}

// ======================
// CALENDARIO
// ======================
const today = new Date(); today.setHours(0,0,0,0);
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();
const MONTHS_IT = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];

function openCalendar(){
  calOverlay.classList.add("open");
  renderCalendar();
}
function closeCalendar(){
  calOverlay.classList.remove("open");
}

function renderCalendar(){
  calGrid.innerHTML = "";
  calTitle.textContent = `${MONTHS_IT[viewMonth]} ${viewYear}`;

  const first = new Date(viewYear, viewMonth, 1, 12);
  const offset = (first.getDay() + 6) % 7;

  for (let i = 0; i < 42; i++) {
    const d = new Date(viewYear, viewMonth, i - offset + 1, 12);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "calDay";
    btn.textContent = d.getDate();

    if (d < minValidDate || isMonday(d)) {
      btn.disabled = true;
      btn.classList.add("disabled");
    }

    btn.onclick = () => {
      dataRitiroEl.value = d.toISOString().slice(0,10);
      applyRulesForDate(d);
      checkAndGenerateOrder();
      closeCalendar();
    };

    calGrid.appendChild(btn);
  }
}

openCalendarBtn.onclick = openCalendar;
calClose.onclick = closeCalendar;

// ======================
// PRODOTTI
// ======================
function addRow() {
  const row = document.createElement("div");
  row.className = "itemRow";
  row.innerHTML = `
    <input class="prodotto" placeholder="Prodotto" />
    <input class="quantita" placeholder="Quantità" />
    <button type="button" class="removeBtn">✕</button>
  `;
  row.querySelector(".removeBtn").onclick = () => {
    if (items.children.length > 1) {
      row.remove();
      checkAndGenerateOrder();
    }
  };
  items.appendChild(row);
}

addRowBtn.onclick = addRow;

// ======================
// ORDINE AUTOMATICO
// ======================
function buildOrderText() {
  let t = `🧺 NUOVO ORDINE — ${AZIENDA_NOME}\n\n`;
  t += `👤 Cliente: ${getValue("nome")}\n`;
  t += `📞 Telefono: ${getValue("telefono")}\n\n`;
  t += `📅 Data ritiro: ${getValue("dataRitiro")}\n`;
  t += `⏰ Fascia: ${getValue("fasciaOraria")}\n\n`;
  t += `🛒 Prodotti:\n`;
  getItems().forEach((i,n)=> t += `  ${n+1}. ${i.prodotto} — ${i.quantita}\n`);
  return t;
}

function checkAndGenerateOrder() {
  const nome = getValue("nome");
  const tel = getValue("telefono");
  const data = getValue("dataRitiro");
  const fasciaOraria = getValue("fasciaOraria");
  const list = getItems();

  if (!nome || !tel || !data || !fasciaOraria || list.length === 0) {
    sendWhatsappBtn.disabled = true;
    preview.textContent = "Compila tutti i dati per generare l’ordine.";
    return;
  }

  const d = fromYMD(data);
  if (!applyRulesForDate(d)) return;

  // controllo 48 ORE REALI (data + fascia)
  const fascia = getValue("fasciaOraria");
  const fm = parseFasciaOraria(fascia);
  if (fm) {
    const ritiroDateTime = new Date(d);
    ritiroDateTime.setHours(fm.h, fm.m, 0, 0);

    const minDateTime = new Date(Date.now() + 48 * 60 * 60 * 1000);

    if (ritiroDateTime < minDateTime) {
      setStatus("⚠️ L’orario di ritiro deve essere almeno 48 ore dopo l’ordine.");
      sendWhatsappBtn.disabled = true;
      return;
    }
  }

  lastOrderText = buildOrderText();
  preview.textContent = lastOrderText;
  sendWhatsappBtn.disabled = false;
}

function parseFasciaOraria(fascia) {
  if (!fascia) return null;
  const start = fascia.split(" - ")[0]; // es. "09:00"
  const [h, m] = start.split(":").map(Number);
  return { h, m };
}


// ======================
// LISTENER
// ======================
items.addEventListener("input", checkAndGenerateOrder);
document.getElementById("nome").addEventListener("input", checkAndGenerateOrder);
document.getElementById("telefono").addEventListener("input", checkAndGenerateOrder);
dataRitiroEl.addEventListener("change", checkAndGenerateOrder);
fasciaOrariaEl.addEventListener("change", checkAndGenerateOrder);

// ======================
// INVIO WHATSAPP
// ======================
sendWhatsappBtn.onclick = () => {
  if (!lastOrderText) return;
  window.open(
    `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(lastOrderText)}`,
    "_blank"
  );
};
