import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
   ENVIAR COMANDO PARA O APP
========================= */
function enviarComando(deviceKey, comando, btnElement) {
  console.log(`🚀 Tentando enviar comando "${comando}" para ${deviceKey}`);
  
  const commandRef = ref(db, `devices/${deviceKey}/command`);
  
  const commandData = {
    action: comando,
    timestamp: Date.now()
  };
  
  console.log('📤 Dados do comando:', commandData);
  
  set(commandRef, commandData)
    .then(() => {
      console.log(`✅ Comando "${comando}" enviado com sucesso para ${deviceKey}`);
      
      // Feedback visual
      if (btnElement) {
        const originalText = btnElement.textContent;
        const originalBg = btnElement.style.backgroundColor;
        
        btnElement.textContent = "✓ Enviado!";
        btnElement.style.backgroundColor = "#00ff88";
        btnElement.style.color = "#000";
        btnElement.disabled = true;
        
        setTimeout(() => {
          btnElement.textContent = originalText;
          btnElement.style.backgroundColor = originalBg;
          btnElement.style.color = "#00ff88";
          btnElement.disabled = false;
        }, 2000);
      }
    })
    .catch((error) => {
      console.error("❌ Erro ao enviar comando:", error);
      alert(`Erro ao enviar comando: ${error.message}`);
    });
}

/* =========================
   TOGGLE BOTÕES DE APPS
========================= */
function toggleApps(deviceKey) {
  const appsContainer = document.getElementById(`apps-${deviceKey}`);
  const toggleBtn = document.getElementById(`toggle-${deviceKey}`);
  
  if (appsContainer && toggleBtn) {
    if (appsContainer.style.display === "none" || appsContainer.style.display === "") {
      appsContainer.style.display = "block";
      toggleBtn.textContent = "▼ Fechar Apps";
      toggleBtn.classList.add("active");
    } else {
      appsContainer.style.display = "none";
      toggleBtn.textContent = "▶ Abrir Apps";
      toggleBtn.classList.remove("active");
    }
  }
}

/* =========================
   LISTENER FIREBASE
========================= */
onValue(ref(db, "devices"), (snapshot) => {
  container.innerHTML = "";

  if (!snapshot.exists()) {
    container.innerHTML = "<div class='no-devices'>Nenhum dispositivo conectado.</div>";
    return;
  }

  snapshot.forEach((child) => {
    const deviceKey = child.key;
    const d = child.val();

    const div = document.createElement("div");
    div.className = "device";

    div.innerHTML = `
      <h2>▶ ${deviceKey}</h2>

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
        ${d.lastUpdate ? new Date(d.lastUpdate).toLocaleString('pt-BR') : "-"}
      </p>

      <button class="btn-toggle" id="toggle-${deviceKey}">
        ▶ Abrir Apps
      </button>

      <div class="apps-container" id="apps-${deviceKey}" style="display: none;">
        <h3>🎮 Selecione o App:</h3>
        
        <button class="btn-app btn-beatsaber" data-device="${deviceKey}" data-command="beatsaber">
          🎮 Beat Saber
        </button>
        
        <button class="btn-app btn-blaston" data-device="${deviceKey}" data-command="blaston">
          🔫 Blaston
        </button>
        
        <button class="btn-app btn-hyperdash" data-device="${deviceKey}" data-command="hyperdash">
          ⚡ Hyper Dash
        </button>
        
        <button class="btn-app btn-chrome" data-device="${deviceKey}" data-command="chrome">
          🌐 Navegador
        </button>
      </div>
    `;

    container.appendChild(div);
  });

  // Event listeners para botão de toggle
  document.querySelectorAll('.btn-toggle').forEach(btn => {
    btn.addEventListener('click', function() {
      const deviceKey = this.id.replace('toggle-', '');
      toggleApps(deviceKey);
    });
  });

  // Event listeners para botões de apps
  document.querySelectorAll('.btn-app').forEach(btn => {
    btn.addEventListener('click', function() {
      const deviceKey = this.getAttribute('data-device');
      const command = this.getAttribute('data-command');
      console.log(`🎯 Botão clicado: device=${deviceKey}, command=${command}`);
      enviarComando(deviceKey, command, this);
    });
  });
});

// Log de inicialização
console.log('🔥 Firebase inicializado');
console.log('📡 Conectado ao banco:', firebaseConfig.databaseURL);