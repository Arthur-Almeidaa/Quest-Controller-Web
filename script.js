import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

/* =========================
   FIREBASE CONFIG
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyDAkapYFpjsugAn5lFq8e5pXHdecn75Ej8",
  databaseURL: "https://teste-f579d-default-rtdb.firebaseio.com",
  projectId: "teste-f579d"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

/* =========================
   ELEMENTOS
========================= */
const container = document.getElementById("devices");

/* =========================
   FUNÇÕES AUXILIARES
========================= */
function getBatteryClass(battery) {
  if (battery === undefined || battery === null) return "battery-unknown";
  if (battery <= 15) return "battery-low";
  if (battery <= 40) return "battery-medium";
  return "battery-high";
}

/* =========================
   LISTENER FIREBASE
========================= */
onValue(ref(db, "devices"), (snapshot) => {
  container.innerHTML = "";

  if (!snapshot.exists()) {
    container.innerHTML = "Nenhum dispositivo conectado.";
    return;
  }

  snapshot.forEach((child) => {
    const deviceKey = child.key;
    const d = child.val();

    const div = document.createElement("div");
    div.className = "device";

    div.innerHTML = `
      <h2>▶ ${deviceKey}</h2>

      <p><span class="label">Dispositivo:</span> ${d.device ?? "-"}</p>
      <p><span class="label">Email:</span> ${d.email ?? "-"}</p>

      <p>
        <span class="label">Bateria:</span>
        <span class="battery ${getBatteryClass(d.battery)}">
          ${d.battery ?? "-"}%
        </span>
      </p>

      <p><span class="label">IP:</span> ${d.ip ?? "-"}</p>
      <p><span class="label">Último app:</span> ${d.lastApp ?? "-"}</p>

      <p class="timestamp">
        <span class="label">Última atualização:</span>
        ${d.timestamp ? new Date(d.timestamp).toLocaleString() : "-"}
      </p>
    `;

    container.appendChild(div);
  });
});
