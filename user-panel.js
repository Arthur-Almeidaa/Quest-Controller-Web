import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase, ref, onValue, set, update, push, get
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
   SESSÃO DO USUÁRIO
========================= */
let userSession = null;

// Verifica se tem sessão válida
const storedSession = localStorage.getItem("userSession") || sessionStorage.getItem("userSession");

if (!storedSession) {
  console.error("Sem sessão de usuário");
  window.location.replace("index.html");
} else {
  try {
    userSession = JSON.parse(storedSession);
    if (!userSession.userId || !userSession.username) {
      throw new Error("Sessão inválida");
    }
    console.log("Sessão de usuário carregada:", userSession);
    initApp();
  } catch (e) {
    console.error("Erro ao carregar sessão:", e);
    localStorage.removeItem("userSession");
    sessionStorage.removeItem("userSession");
    window.location.replace("index.html");
  }
}

/* =========================
   ESTADO GLOBAL
========================= */
let devices = {};
let commandLogs = {};
let availableApps = {};
let selectedDevices = new Set();
let unreadLogsCount = 0;
let pendingCommands = new Map();
let appsVisible = true;

/* =========================
   CONSTANTES
========================= */
const COMMAND_TIMEOUT = 10000;

/* =========================
   INICIALIZAÇÃO
========================= */
function initApp() {
  document.addEventListener("DOMContentLoaded", () => {
    updateUserDisplay();
    initializeEventListeners();
    initializeDefaultApps();
    startFirebaseListeners();
  });

  if (document.readyState !== "loading") {
    updateUserDisplay();
    initializeEventListeners();
    initializeDefaultApps();
    startFirebaseListeners();
  }
}

/* =========================
   ATUALIZAR DISPLAY DO USUÁRIO
========================= */
function updateUserDisplay() {
  const userNameEl = document.getElementById("loggedUserName");
  const subtitleEl = document.getElementById("userSubtitle");

  if (userNameEl) {
    userNameEl.textContent = userSession.username;
  }

  // Se tem setor, busca o nome dele
  if (subtitleEl && userSession.sector) {
    get(ref(db, `sectors/${userSession.sector}`)).then(snap => {
      if (snap.exists()) {
        const sector = snap.val();
        subtitleEl.textContent = sector.name;
      }
    });
  }
}

/* =========================
   FIREBASE LISTENERS
========================= */
function startFirebaseListeners() {
  // Dispositivos - FILTRA apenas os permitidos
  onValue(ref(db, "devices"), snap => {
    const allDevices = snap.val() || {};
    const allowedDeviceIds = userSession.allowedDevices || [];

    // Processa respostas de comandos
    Object.entries(allDevices).forEach(([deviceId, deviceData]) => {
      if (deviceData.commandResponse && allowedDeviceIds.includes(deviceId)) {
        processCommandResponse(deviceId, deviceData.commandResponse);
      }
    });

    // Filtra apenas dispositivos permitidos
    devices = Object.fromEntries(
      Object.entries(allDevices).filter(([id]) => allowedDeviceIds.includes(id))
    );

    renderDevices();
    updateStats();
    updateLogFilters();
  });

  // Logs - FILTRA apenas os do usuário
  onValue(ref(db, "commandLogs"), snap => {
    const allLogs = snap.val() || {};

    // Conta logs novos
    Object.keys(allLogs).forEach(logId => {
      if (!commandLogs[logId] && allLogs[logId].username === userSession.username) {
        unreadLogsCount++;
        updateUnreadBadge();
      }
    });

    // Filtra apenas logs deste usuário
    commandLogs = Object.fromEntries(
      Object.entries(allLogs).filter(([id, log]) => log.username === userSession.username)
    );

    renderLogs();
  });

  // Apps disponíveis (todos podem ver)
  onValue(ref(db, "availableApps"), snap => {
    availableApps = snap.val() || {};
    populateAppSelects();
    renderDevices();
  });
}

/* =========================
   APPS PADRÃO
========================= */
async function initializeDefaultApps() {
  const appsSnapshot = await get(ref(db, "availableApps"));
  if (appsSnapshot.exists()) return;

  const defaultApps = {
    home: {
      id: "home", name: "Menu Principal", icon: "HOME",
      packageName: "com.oculus.vrshell",
      launchType: "special", specialAction: "HOME",
      createdAt: Date.now(), isDefault: true, isSystem: true
    },
    beatsaber: {
      id: "beatsaber", name: "Beat Saber", icon: "BS",
      packageName: "com.beatgames.beatsaber",
      launchType: "special", specialAction: "BEAT_SABER",
      createdAt: Date.now(), isDefault: true
    },
    blaston: {
      id: "blaston", name: "Blaston", icon: "BL",
      packageName: "com.resolutiongames.ignis",
      launchType: "special", specialAction: "BLASTON",
      createdAt: Date.now(), isDefault: true
    },
    hyperdash: {
      id: "hyperdash", name: "Hyper Dash", icon: "HD",
      packageName: "com.TriangleFactory.HyperDash",
      launchType: "special", specialAction: "HYPER_DASH",
      createdAt: Date.now(), isDefault: true
    },
    chrome: {
      id: "chrome", name: "Navegador", icon: "WEB",
      packageName: "com.android.chrome",
      launchType: "normal",
      createdAt: Date.now(), isDefault: true
    }
  };

  await set(ref(db, "availableApps"), defaultApps);
}

/* =========================
   EVENT LISTENERS
========================= */
function initializeEventListeners() {
  // Auth
  document.getElementById("btnLogout").addEventListener("click", handleLogout);

  // Devices
  document.getElementById("btnExecuteSelected").addEventListener("click", sendCommandToSelected);
  document.getElementById("btnSelectAll").addEventListener("click", selectAllDevices);
  document.getElementById("btnDeselectAll").addEventListener("click", deselectAllDevices);
  document.getElementById("btnToggleApps").addEventListener("click", toggleAppsVisibility);

  // Logs
  document.getElementById("btnOpenLogs").addEventListener("click", openLogsModal);
  document.getElementById("btnCloseLogsModal").addEventListener("click", closeLogsModal);
  document.getElementById("logFilterStatus").addEventListener("change", renderLogs);
  document.getElementById("logFilterDevice").addEventListener("change", renderLogs);
  document.getElementById("logsModal").addEventListener("click", e => {
    if (e.target.id === "logsModal") closeLogsModal();
  });
}

/* =========================
   AUTH - LOGOUT
========================= */
function handleLogout() {
  if (confirm("Tem certeza que deseja sair do painel?")) {
    localStorage.removeItem("userSession");
    sessionStorage.removeItem("userSession");
    window.location.href = "index.html";
  }
}

/* =========================
   TOGGLE APPS VISIBILITY
========================= */
function toggleAppsVisibility() {
  appsVisible = !appsVisible;
  const textEl = document.getElementById("toggleAppsText");
  textEl.textContent = appsVisible ? "Ocultar Apps" : "Mostrar Apps";
  renderDevices();
}

/* =========================
   RENDERIZAR DISPOSITIVOS
========================= */
function renderDevices() {
  const grid = document.getElementById("devicesGrid");

  if (Object.keys(devices).length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 48 48" fill="none">
          <rect x="4" y="16" width="40" height="20" rx="5" stroke="currentColor" stroke-width="2"/>
          <circle cx="14" cy="26" r="3" stroke="currentColor" stroke-width="2"/>
          <circle cx="34" cy="26" r="3" stroke="currentColor" stroke-width="2"/>
          <path d="M24 22v8M20 26h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <div class="empty-title">Nenhum dispositivo disponível</div>
        <div class="empty-sub">Você não tem dispositivos autorizados ou eles estão offline</div>
      </div>`;
    return;
  }

  grid.innerHTML = Object.entries(devices)
    .sort(([, a], [, b]) => (isOnline(b) ? 1 : 0) - (isOnline(a) ? 1 : 0))
    .map(([id, d]) => {
      const battery = d.battery ?? 0;
      const isSelected = selectedDevices.has(id);
      const online = isOnline(d);
      const currentAppInfo = getCurrentlyPlayingApp(d);
      const batteryClass = battery <= 20 ? "battery-fill-low" : battery <= 50 ? "battery-fill-mid" : "";

      return `
        <div class="device-card ${isSelected ? "selected" : ""}" onclick="toggleDevice('${id}')">
          <div class="device-header">
            <div class="device-header-left">
              <input type="checkbox" ${isSelected ? "checked" : ""}
                     onclick="event.stopPropagation(); toggleDevice('${id}')">
              <span class="device-name">${id}</span>
            </div>
            <span class="device-status ${online ? "status-online" : "status-offline"}">
              <span class="status-dot"></span>
              ${online ? "Online" : "Offline"}
            </span>
          </div>

          ${currentAppInfo ? renderCurrentlyPlaying(currentAppInfo) : ""}

          <div class="device-info">
            <div class="info-row">
              <span class="info-label">Email</span>
              <span class="info-value">${d.email || "—"}</span>
            </div>
            <div class="info-row">
              <span class="info-label">IP</span>
              <span class="info-value mono">${d.ip || "—"}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Bateria</span>
              <div class="battery">
                <div class="battery-bar">
                  <div class="battery-fill ${batteryClass}" style="width:${battery}%"></div>
                </div>
                <span class="info-value">${battery}%</span>
              </div>
            </div>
            ${d.lastUpdate ? `
            <div class="info-row">
              <span class="info-label">Última resposta</span>
              <span class="info-value">${formatTime(d.lastUpdate)}</span>
            </div>` : ""}
          </div>

          ${appsVisible ? `
          <div class="device-actions" onclick="event.stopPropagation()">
            ${renderAppButtons(id, online)}
          </div>` : ""}
        </div>`;
    }).join("");
}

function getCurrentlyPlayingApp(device) {
  if (device.currentAppName) {
    return {
      name: device.currentAppName,
      packageName: device.currentApp,
      icon: getAppByPackageName(device.currentApp)?.icon || "APP",
      source: "detected"
    };
  }
  if (device.currentApp) {
    const appInfo = getAppInfo(device.currentApp);
    return { name: appInfo.name, packageName: appInfo.packageName, icon: appInfo.icon, source: "manual" };
  }
  return null;
}

function renderCurrentlyPlaying(appInfo) {
  return `
    <div class="now-playing">
      <span class="now-playing-badge">${appInfo.icon || "APP"}</span>
      <div class="now-playing-info">
        <div class="now-playing-label">Em execução</div>
        <div class="now-playing-name">${appInfo.name}</div>
      </div>
    </div>`;
}

function renderAppButtons(deviceId, online) {
  const apps = getAllApps();
  const homeApp = apps.find(a => a.id === "home");
  const otherApps = apps.filter(a => a.id !== "home");

  let html = "";

  if (homeApp) {
    html += `
      <button class="btn btn-danger btn-small btn-full"
              onclick="sendCommand('${deviceId}','home')"
              ${!online ? "disabled" : ""}
              title="Voltar ao Menu Principal">
        Menu Principal
      </button>`;
  }

  html += otherApps.map(app => `
    <button class="btn btn-app btn-small"
            onclick="sendCommand('${deviceId}','${app.id}')"
            ${!online ? "disabled" : ""}
            title="${app.name}">
      <span class="app-btn-icon">${app.icon || app.name.slice(0, 2).toUpperCase()}</span>
      ${app.name}
    </button>`).join("");

  return html;
}

/* =========================
   DEVICES — SELEÇÃO
========================= */
function toggleDevice(id) {
  if (selectedDevices.has(id)) selectedDevices.delete(id);
  else selectedDevices.add(id);
  renderDevices();
}

function selectAllDevices() {
  Object.keys(devices).forEach(id => selectedDevices.add(id));
  renderDevices();
}

function deselectAllDevices() {
  selectedDevices.clear();
  renderDevices();
}

/* =========================
   ENVIAR COMANDOS
========================= */
async function sendCommand(deviceId, appId) {
  const device = devices[deviceId];
  if (!device) {
    showToast("Dispositivo não encontrado", "error");
    return;
  }

  if (!isOnline(device)) {
    showToast(`${deviceId} está offline`, "error");
    return;
  }

  const app = availableApps[appId];
  if (!app) {
    showToast("Aplicativo não encontrado", "error");
    return;
  }

  try {
    const commandData = {
      action: appId,
      timestamp: Date.now()
    };

    await set(ref(db, `devices/${deviceId}/command`), commandData);

    // Log com identificação do usuário
    const logId = `log_${Date.now()}_${deviceId}`;
    const logData = {
      deviceId,
      appId,
      appName: app.name,
      status: "pending",
      timestamp: Date.now(),
      userId: userSession.userId,
      username: userSession.username,
      sector: userSession.sector || ""
    };

    await set(ref(db, `commandLogs/${logId}`), logData);

    pendingCommands.set(logId, setTimeout(() => {
      handleCommandTimeout(logId);
    }, COMMAND_TIMEOUT));

    showToast(`Comando enviado para ${deviceId}`, "info");

  } catch (error) {
    console.error("Erro ao enviar comando:", error);
    showToast("Erro ao enviar comando", "error");
  }
}

async function sendCommandToSelected() {
  const appId = document.getElementById("deviceAppSelect").value;

  if (!appId) {
    showToast("Selecione um aplicativo", "warning");
    return;
  }

  if (selectedDevices.size === 0) {
    showToast("Selecione ao menos um dispositivo", "warning");
    return;
  }

  const onlineDevices = Array.from(selectedDevices).filter(id => isOnline(devices[id]));

  if (onlineDevices.length === 0) {
    showToast("Nenhum dispositivo selecionado está online", "error");
    return;
  }

  for (const deviceId of onlineDevices) {
    await sendCommand(deviceId, appId);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  showToast(`Comando enviado para ${onlineDevices.length} dispositivo(s)`, "success");
}

/* =========================
   PROCESSAR RESPOSTA
========================= */
function processCommandResponse(deviceId, response) {
  const logId = Array.from(pendingCommands.keys()).find(id => 
    id.includes(deviceId) && commandLogs[id]?.status === "pending"
  );

  if (!logId) return;

  clearTimeout(pendingCommands.get(logId));
  pendingCommands.delete(logId);

  const status = response.success ? "success" : "error";
  const message = response.message || (response.success ? "Comando executado" : "Falha ao executar");

  update(ref(db, `commandLogs/${logId}`), {
    status,
    message,
    responseTime: Date.now()
  });
}

function handleCommandTimeout(logId) {
  pendingCommands.delete(logId);
  update(ref(db, `commandLogs/${logId}`), {
    status: "timeout",
    message: "Dispositivo não respondeu a tempo",
    responseTime: Date.now()
  });
}

/* =========================
   LOGS MODAL
========================= */
function openLogsModal() {
  document.getElementById("logsModal").classList.add("active");
  unreadLogsCount = 0;
  updateUnreadBadge();
  renderLogs();
}

function closeLogsModal() {
  document.getElementById("logsModal").classList.remove("active");
}

function renderLogs() {
  const container = document.getElementById("logsContainer");
  const statusFilter = document.getElementById("logFilterStatus").value;
  const deviceFilter = document.getElementById("logFilterDevice").value;

  let filteredLogs = Object.entries(commandLogs);

  if (statusFilter !== "all") {
    filteredLogs = filteredLogs.filter(([, log]) => log.status === statusFilter);
  }

  if (deviceFilter !== "all") {
    filteredLogs = filteredLogs.filter(([, log]) => log.deviceId === deviceFilter);
  }

  filteredLogs.sort(([, a], [, b]) => b.timestamp - a.timestamp);

  if (filteredLogs.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Nenhum log encontrado</div>
        <div class="empty-sub">Os comandos executados aparecerão aqui</div>
      </div>`;
    return;
  }

  container.innerHTML = filteredLogs.map(([logId, log]) => {
    const statusClass = {
      success: "log-success",
      error: "log-error",
      timeout: "log-timeout",
      pending: "log-pending"
    }[log.status] || "";

    const statusIcon = {
      success: "✓",
      error: "✗",
      timeout: "⏱",
      pending: "⋯"
    }[log.status] || "?";

    const statusText = {
      success: "Sucesso",
      error: "Erro",
      timeout: "Timeout",
      pending: "Aguardando"
    }[log.status] || "Desconhecido";

    return `
      <div class="log-item ${statusClass}">
        <div class="log-header">
          <div class="log-device">${log.deviceId}</div>
          <div class="log-time">${formatFullTime(log.timestamp)}</div>
        </div>
        <div class="log-body">
          <div class="log-app">${log.appName}</div>
          <div class="log-status">
            <span class="log-status-icon">${statusIcon}</span>
            ${statusText}
          </div>
        </div>
        ${log.message ? `<div class="log-message">${log.message}</div>` : ""}
      </div>`;
  }).join("");
}

function updateLogFilters() {
  const deviceFilter = document.getElementById("logFilterDevice");
  const currentValue = deviceFilter.value;

  deviceFilter.innerHTML = '<option value="all">Todos os Dispositivos</option>' +
    Object.keys(devices).map(id => 
      `<option value="${id}" ${currentValue === id ? "selected" : ""}>${id}</option>`
    ).join("");
}

function updateUnreadBadge() {
  const badge = document.getElementById("unreadLogsCount");
  if (unreadLogsCount > 0) {
    badge.textContent = unreadLogsCount > 99 ? "99+" : unreadLogsCount;
    badge.style.display = "block";
  } else {
    badge.style.display = "none";
  }
}

/* =========================
   POPULATE SELECTS
========================= */
function populateAppSelects() {
  const appSelect = document.getElementById("deviceAppSelect");
  const currentValue = appSelect.value;

  const apps = getAllApps().filter(a => a.id !== "home");

  appSelect.innerHTML = '<option value="">Selecionar Aplicativo</option>' +
    apps.map(app => 
      `<option value="${app.id}" ${currentValue === app.id ? "selected" : ""}>${app.name}</option>`
    ).join("");
}

/* =========================
   HELPERS
========================= */
function isOnline(device) {
  if (!device || !device.lastUpdate) return false;
  return (Date.now() - device.lastUpdate) < 30000;
}

function getAllApps() {
  return Object.values(availableApps).sort((a, b) => {
    if (a.isSystem) return -1;
    if (b.isSystem) return 1;
    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

function getAppInfo(appId) {
  const app = availableApps[appId];
  return app || { name: appId, packageName: "", icon: "?" };
}

function getAppByPackageName(packageName) {
  return Object.values(availableApps).find(app => app.packageName === packageName);
}

function updateStats() {
  document.getElementById("totalDevices").textContent = Object.keys(devices).length;
  document.getElementById("onlineDevices").textContent = Object.values(devices).filter(isOnline).length;
}

/* =========================
   FORMATAÇÃO
========================= */
function formatTime(timestamp) {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "Agora";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min atrás`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h atrás`;
  return new Date(timestamp).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

function formatFullTime(timestamp) {
  return new Date(timestamp).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit"
  });
}

/* =========================
   TOAST
========================= */
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const icons = {
    success: `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    error: `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    info: `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M8 7v5M8 5v1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    warning: `<svg viewBox="0 0 16 16" fill="none"><path d="M8 2L15 14H1L8 2z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M8 7v3M8 11v1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`
  };

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span class="toast-message">${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "toastSlideIn 0.3s ease reverse";
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* =========================
   EXPORTS (onclick inline)
========================= */
window.toggleDevice = toggleDevice;
window.selectAllDevices = selectAllDevices;
window.deselectAllDevices = deselectAllDevices;
window.sendCommand = sendCommand;