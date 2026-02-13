import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase, ref, onValue, set, update, remove, push, get
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDAkapYFpjsugAn5lFq8e5pXHdecn75Ej8",
  databaseURL: "https://teste-f579d-default-rtdb.firebaseio.com",
  projectId: "teste-f579d"
};

const app  = initializeApp(firebaseConfig);
const db   = getDatabase(app);
const auth = getAuth(app);

let currentUser = null;
let userSession = null;

const storedSession = localStorage.getItem("userSession") || sessionStorage.getItem("userSession");

if (storedSession) {
  try {
    userSession = JSON.parse(storedSession);
    if (userSession.userId && userSession.username) {
      currentUser = { type: 'user', session: userSession };
      initApp();
    } else {
      throw new Error("Sessão inválida");
    }
  } catch (e) {
    localStorage.removeItem("userSession");
    sessionStorage.removeItem("userSession");
    window.location.replace("index.html");
  }
} else {
  onAuthStateChanged(auth, user => {
    if (!user) {
      if (!window.location.pathname.includes("index.html")) {
        window.location.replace("index.html");
      }
      return;
    }
    currentUser = { type: 'admin', firebase: user };
    initApp();
  });
}

/* =========================
   ESTADO GLOBAL
========================= */
let devices         = {};
let groups          = {};
let commandLogs     = {};
let availableApps   = {};
let selectedDevices = new Set();
let currentEditingGroupId = null;
let currentEditingAppId   = null;
let unreadLogsCount = 0;
let pendingCommands = new Map();
let appsVisible     = true;
let batteryAlerted  = new Set(); // controla quais devices já tocaram o alerta

const COMMAND_TIMEOUT       = 10000;
const BATTERY_ALERT_THRESHOLD = 88;

/* =========================
   ALERTA SONORO DE BATERIA
========================= */
function playBatteryAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach(delay => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, ctx.currentTime + delay);
      osc.frequency.setValueAtTime(660, ctx.currentTime + delay + 0.1);
      gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.25);
    });
  } catch (e) {
    console.warn('Audio nao disponivel:', e);
  }
}

function checkBatteryAlerts(devicesData) {
  Object.entries(devicesData).forEach(([deviceId, device]) => {
    if (!isOnline(device)) return;
    const battery = device.battery ?? 100;

    if (battery <= BATTERY_ALERT_THRESHOLD && !batteryAlerted.has(deviceId)) {
      batteryAlerted.add(deviceId);
      playBatteryAlert();
      showToast(`🔋 ${deviceId} com bateria baixa! ${battery}%`, 'error');
    }

    // Se carregou acima de 25%, reseta para poder alertar de novo
    if (battery > BATTERY_ALERT_THRESHOLD + 5) {
      batteryAlerted.delete(deviceId);
    }
  });
}

/* =========================
   INICIALIZAÇÃO
========================= */
function initApp() {
  document.addEventListener("DOMContentLoaded", () => {
    updateUserDisplay();
    initializeEventListeners();
    initializeDefaultApps();
    startFirebaseListeners();
    injetarCssBateria();
  });

  if (document.readyState !== "loading") {
    updateUserDisplay();
    initializeEventListeners();
    initializeDefaultApps();
    startFirebaseListeners();
    injetarCssBateria();
  }
}

function injetarCssBateria() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes batteryPulse {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.3; }
    }
    .battery-fill-low {
      background: #ef4444 !important;
      animation: batteryPulse 1s ease-in-out infinite;
    }
    .battery-value-low {
      color: #ef4444 !important;
      font-weight: 700;
    }
  `;
  document.head.appendChild(style);
}

/* =========================
   DISPLAY DO USUÁRIO
========================= */
function updateUserDisplay() {
  const loggedUserEl = document.getElementById("loggedUserEmail");
  if (!loggedUserEl) return;

  if (currentUser && currentUser.type === 'user' && userSession) {
    loggedUserEl.textContent = userSession.username;
    if (userSession.sector) loggedUserEl.title = `Setor: ${userSession.sector}`;
  } else if (currentUser && currentUser.type === 'admin') {
    loggedUserEl.textContent = "Admin";
  }
}

/* =========================
   FIREBASE LISTENERS
========================= */
function startFirebaseListeners() {
  onValue(ref(db, "devices"), snap => {
    const devicesData = snap.val() || {};

    Object.entries(devicesData).forEach(([deviceId, deviceData]) => {
      if (deviceData.commandResponse) {
        processCommandResponse(deviceId, deviceData.commandResponse);
      }
    });

    devices = devicesData;
    checkBatteryAlerts(devicesData); // ⭐ verifica bateria baixa
    renderDevices();
    updateStats();
    updateDevicesChecklistInModal();
    updateLogFilters();
  });

  onValue(ref(db, "groups"), snap => {
    groups = snap.val() || {};
    renderGroups();
    updateStats();
  });

  onValue(ref(db, "commandLogs"), snap => {
    const newLogs = snap.val() || {};
    Object.keys(newLogs).forEach(logId => {
      if (!commandLogs[logId]) {
        unreadLogsCount++;
        updateUnreadBadge();
      }
    });
    commandLogs = newLogs;
    renderLogs();
  });

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
    home:        { id: "home",        name: "Menu Principal", icon: "HOME", packageName: "com.oculus.vrshell",             launchType: "special", specialAction: "HOME",         createdAt: Date.now(), isDefault: true, isSystem: true },
    beatsaber:   { id: "beatsaber",   name: "Beat Saber",     icon: "BS",   packageName: "com.beatgames.beatsaber",         launchType: "special", specialAction: "BEAT_SABER",   createdAt: Date.now(), isDefault: true },
    blaston:     { id: "blaston",     name: "Blaston",        icon: "BL",   packageName: "com.resolutiongames.ignis",       launchType: "special", specialAction: "BLASTON",       createdAt: Date.now(), isDefault: true },
    hyperdash:   { id: "hyperdash",   name: "Hyper Dash",     icon: "HD",   packageName: "com.TriangleFactory.HyperDash",  launchType: "special", specialAction: "HYPER_DASH",    createdAt: Date.now(), isDefault: true },
    trolin:      { id: "trolin",      name: "Spatial Ops",    icon: "SO",   packageName: "com.resolutiongames.trolin",     launchType: "special", specialAction: "TROLIN",        createdAt: Date.now(), isDefault: true },
    homeinvasion:{ id: "homeinvasion",name: "Home Invasion",  icon: "HI",   packageName: "com.soulassembly.homeinvasion",  launchType: "special", specialAction: "HOME_INVASION", createdAt: Date.now(), isDefault: true },
    creed:       { id: "creed",       name: "Creed",          icon: "CR",   packageName: "com.survios.creed",              launchType: "normal",                                  createdAt: Date.now(), isDefault: true }
  };

  await set(ref(db, "availableApps"), defaultApps);
}

/* =========================
   EVENT LISTENERS
========================= */
function initializeEventListeners() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  document.getElementById("btnLogout").addEventListener("click", handleLogout);
  document.getElementById("btnExecuteSelected").addEventListener("click", sendCommandToSelected);
  document.getElementById("btnSelectAll").addEventListener("click", selectAllDevices);
  document.getElementById("btnDeselectAll").addEventListener("click", deselectAllDevices);
  document.getElementById("btnToggleApps").addEventListener("click", toggleAppsVisibility);

  document.getElementById("btnAddApp").addEventListener("click", openAddAppModal);
  document.getElementById("btnCloseAppModal").addEventListener("click", closeAppModal);
  document.getElementById("btnCancelAppModal").addEventListener("click", closeAppModal);
  document.getElementById("btnSaveApp").addEventListener("click", saveApp);
  document.getElementById("btnDeleteApp").addEventListener("click", () => confirmDeleteApp());
  document.getElementById("appName").addEventListener("input", updateAppPreview);
  document.getElementById("appIcon").addEventListener("input", updateAppPreview);
  document.getElementById("appPackage").addEventListener("input", updateAppPreview);
  document.getElementById("appLaunchType").addEventListener("change", toggleSpecialActionField);
  document.getElementById("appModal").addEventListener("click", e => { if (e.target.id === "appModal") closeAppModal(); });

  document.getElementById("btnCreateGroup").addEventListener("click", openCreateGroupModal);
  document.getElementById("btnCloseModal").addEventListener("click", closeGroupModal);
  document.getElementById("btnCancelModal").addEventListener("click", closeGroupModal);
  document.getElementById("btnSaveGroup").addEventListener("click", saveGroup);
  document.getElementById("btnDeleteGroup").addEventListener("click", () => confirmDeleteGroup());
  document.getElementById("groupModal").addEventListener("click", e => { if (e.target.id === "groupModal") closeGroupModal(); });

  document.getElementById("btnOpenLogs").addEventListener("click", openLogsModal);
  document.getElementById("btnCloseLogsModal").addEventListener("click", closeLogsModal);
  document.getElementById("btnClearLogs").addEventListener("click", () => confirmClearLogs());
  document.getElementById("logFilterStatus").addEventListener("change", renderLogs);
  document.getElementById("logFilterDevice").addEventListener("change", renderLogs);
  document.getElementById("logsModal").addEventListener("click", e => { if (e.target.id === "logsModal") closeLogsModal(); });

  document.getElementById("btnCloseConfirm").addEventListener("click", closeConfirmModal);
  document.getElementById("btnConfirmCancel").addEventListener("click", closeConfirmModal);
  document.getElementById("confirmModal").addEventListener("click", e => { if (e.target.id === "confirmModal") closeConfirmModal(); });
}

/* =========================
   AUTH
========================= */
async function handleLogout() {
  showConfirm("Encerrar Sessão", "Tem certeza que deseja sair do painel?", async () => {
    if (currentUser && currentUser.type === 'admin') {
      await signOut(auth);
    } else {
      localStorage.removeItem("userSession");
      sessionStorage.removeItem("userSession");
    }
    window.location.href = "index.html";
  });
}

/* =========================
   TABS
========================= */
function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelector(`[data-tab="${tabName}"]`).classList.add("active");
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  document.getElementById(`${tabName}Tab`).classList.add("active");
}

/* =========================
   TOGGLE APPS VISIBILITY
========================= */
function toggleAppsVisibility() {
  appsVisible = !appsVisible;
  const textEl = document.getElementById("toggleAppsText");
  if (textEl) textEl.textContent = appsVisible ? "Ocultar Apps" : "Mostrar Apps";
  renderDevices();
}

/* =========================
   IS ONLINE
========================= */
function isOnline(device) {
  return device.status === "online";
}

/* =========================
   DEVICES — RENDER
========================= */
function renderDevices() {
  const grid = document.getElementById("devicesGrid");

  let filteredDevices = devices;
  if (currentUser && currentUser.type === 'user' && userSession) {
    const allowedDevices = userSession.allowedDevices || [];
    if (allowedDevices.length > 0) {
      filteredDevices = Object.fromEntries(
        Object.entries(devices).filter(([id]) => allowedDevices.includes(id))
      );
    }
  }

  if (Object.keys(filteredDevices).length === 0) {
    const emptyMessage = currentUser && currentUser.type === 'user'
      ? "Você não tem dispositivos autorizados"
      : "Nenhum dispositivo conectado";
    grid.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 48 48" fill="none">
          <rect x="4" y="16" width="40" height="20" rx="5" stroke="currentColor" stroke-width="2"/>
          <circle cx="14" cy="26" r="3" stroke="currentColor" stroke-width="2"/>
          <circle cx="34" cy="26" r="3" stroke="currentColor" stroke-width="2"/>
          <path d="M24 22v8M20 26h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <div class="empty-title">${emptyMessage}</div>
        <div class="empty-sub">Os dispositivos aparecerão aqui quando se conectarem</div>
      </div>`;
    return;
  }

  grid.innerHTML = Object.entries(filteredDevices)
    .sort(([, a], [, b]) => (isOnline(b) ? 1 : 0) - (isOnline(a) ? 1 : 0))
    .map(([id, d]) => {
      const battery      = d.battery ?? 0;
      const isSelected   = selectedDevices.has(id);
      const online       = isOnline(d);
      const currentAppInfo = getCurrentlyPlayingApp(d);
      const batteryLow   = battery <= BATTERY_ALERT_THRESHOLD;
      const batteryClass = batteryLow ? "battery-fill-low" : battery <= 50 ? "battery-fill-mid" : "";

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
                <span class="info-value ${batteryLow ? 'battery-value-low' : ''}">${battery}%${batteryLow ? ' ⚠️' : ''}</span>
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
    return { name: device.currentAppName, packageName: device.currentApp, icon: getAppByPackageName(device.currentApp)?.icon || "APP", source: "detected" };
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
  const apps      = getAllApps();
  const homeApp   = apps.find(a => a.id === "home");
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
            title="${app.name}"
            oncontextmenu="event.preventDefault(); event.stopPropagation(); openEditAppModal('${app.id}'); return false;">
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
  selectedDevices = new Set(
    Object.entries(devices).filter(([, d]) => isOnline(d)).map(([id]) => id)
  );
  renderDevices();
  showToast(`${selectedDevices.size} dispositivo(s) online selecionado(s)`, "success");
}

function deselectAllDevices() {
  selectedDevices.clear();
  renderDevices();
  showToast("Seleção limpa", "info");
}

/* =========================
   COMANDOS
========================= */
function sendCommand(deviceId, action) {
  if (!action) { showToast("Selecione um aplicativo", "error"); return; }

  const device = devices[deviceId];
  if (!device || !isOnline(device)) {
    showToast(`${deviceId} está offline`, "error");
    createCommandLog(deviceId, action, "timeout", "Dispositivo offline");
    return;
  }

  const commandId = crypto.randomUUID();

  set(ref(db, `devices/${deviceId}/command`), {
    commandId, action, timestamp: Date.now()
  }).then(() => {
    showToast(`Comando enviado para ${deviceId}`, "info");
    createCommandLog(deviceId, action, "pending", "Aguardando resposta…", commandId);

    const timeoutId = setTimeout(() => {
      updateCommandLog(commandId, "timeout", "Sem resposta (10s)");
      showToast(`${deviceId} não respondeu`, "error");
      pendingCommands.delete(commandId);
    }, COMMAND_TIMEOUT);

    pendingCommands.set(commandId, timeoutId);
  }).catch(err => {
    showToast(`Erro ao enviar comando: ${err.message}`, "error");
    createCommandLog(deviceId, action, "error", `Erro: ${err.message}`);
  });
}

function sendCommandToSelected() {
  const app = document.getElementById("deviceAppSelect").value;
  if (!app) { showToast("Selecione um aplicativo", "error"); return; }
  if (selectedDevices.size === 0) { showToast("Selecione ao menos um dispositivo", "error"); return; }

  let sentCount = 0, offlineCount = 0;
  selectedDevices.forEach(id => {
    const device = devices[id];
    if (device && isOnline(device)) { sendCommand(id, app); sentCount++; }
    else offlineCount++;
  });

  if (sentCount > 0)    showToast(`Comando enviado para ${sentCount} dispositivo(s)`, "success");
  if (offlineCount > 0) showToast(`${offlineCount} dispositivo(s) ignorado(s) por estar offline`, "warning");
}

function processCommandResponse(deviceId, response) {
  const { commandId, status, message } = response;
  if (!commandId || !pendingCommands.has(commandId)) return;

  clearTimeout(pendingCommands.get(commandId));
  pendingCommands.delete(commandId);
  updateCommandLog(commandId, status, message || "");

  if (status === "success") showToast(`${deviceId}: ${message}`, "success");
  else if (status === "error") showToast(`${deviceId}: ${message}`, "error");

  remove(ref(db, `devices/${deviceId}/commandResponse`));
  update(ref(db, `devices/${deviceId}`), { lastUpdate: Date.now() });
}

/* =========================
   APPS — UTILS
========================= */
function getAppInfo(appId) {
  return availableApps[appId] || { id: appId, name: appId, icon: "APP", packageName: appId };
}

function getAppByPackageName(packageName) {
  if (!packageName) return null;
  return Object.values(availableApps).find(a => a.packageName === packageName) || null;
}

function getAllApps() {
  return Object.values(availableApps);
}

function populateAppSelects() {
  const selects = ["deviceAppSelect", "groupApp"];
  const apps    = getAllApps().sort((a, b) => a.name.localeCompare(b.name));
  const optionsHTML = apps.map(app => `<option value="${app.id}">${app.name}</option>`).join("");

  selects.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (!select) return;
    const first = select.querySelector("option:first-child");
    select.innerHTML = (first ? first.outerHTML : "") + optionsHTML;
  });
}

/* =========================
   APPS — MODAL
========================= */
function toggleSpecialActionField() {
  const show = document.getElementById("appLaunchType").value === "special";
  document.getElementById("specialActionGroup").style.display = show ? "block" : "none";
}

function openAddAppModal() {
  currentEditingAppId = null;
  document.getElementById("appModalTitle").textContent         = "Adicionar Aplicativo";
  document.getElementById("appName").value                     = "";
  document.getElementById("appIcon").value                     = "";
  document.getElementById("appPackage").value                  = "";
  document.getElementById("appId").value                       = "";
  document.getElementById("appId").disabled                    = false;
  document.getElementById("appLaunchType").value               = "normal";
  document.getElementById("appSpecialAction").value            = "";
  document.getElementById("specialActionGroup").style.display  = "none";
  document.getElementById("btnDeleteApp").style.display        = "none";
  document.getElementById("appPreview").style.display          = "none";
  document.getElementById("appModal").classList.add("active");
}

function openEditAppModal(appId) {
  currentEditingAppId = appId;
  const app = availableApps[appId];
  if (!app) return;

  document.getElementById("appModalTitle").textContent         = "Editar Aplicativo";
  document.getElementById("appName").value                     = app.name;
  document.getElementById("appIcon").value                     = app.icon || "";
  document.getElementById("appPackage").value                  = app.packageName;
  document.getElementById("appId").value                       = app.id;
  document.getElementById("appId").disabled                    = true;
  document.getElementById("appLaunchType").value               = app.launchType || "normal";
  document.getElementById("appSpecialAction").value            = app.specialAction || "";
  document.getElementById("specialActionGroup").style.display  = app.launchType === "special" ? "block" : "none";
  document.getElementById("btnDeleteApp").style.display        = app.isDefault ? "none" : "block";
  document.getElementById("appPreview").style.display          = "block";
  updateAppPreview();
  document.getElementById("appModal").classList.add("active");
}

function closeAppModal() {
  document.getElementById("appModal").classList.remove("active");
  document.getElementById("appId").disabled = false;
  currentEditingAppId = null;
}

function updateAppPreview() {
  const name    = document.getElementById("appName").value.trim();
  const icon    = document.getElementById("appIcon").value.trim();
  const pkgName = document.getElementById("appPackage").value.trim();

  if (name || icon || pkgName) {
    document.getElementById("appPreview").style.display       = "block";
    const display = icon || (name ? name.slice(0, 3).toUpperCase() : "APP");
    document.getElementById("previewIcon").textContent        = display;
    document.getElementById("previewName").textContent        = name    || "Nome do Aplicativo";
    document.getElementById("previewPackage").textContent     = pkgName || "com.empresa.aplicativo";
  } else {
    document.getElementById("appPreview").style.display = "none";
  }
}

function saveApp() {
  const name          = document.getElementById("appName").value.trim();
  const icon          = document.getElementById("appIcon").value.trim();
  const packageName   = document.getElementById("appPackage").value.trim();
  const id            = document.getElementById("appId").value.trim().toLowerCase();
  const launchType    = document.getElementById("appLaunchType").value;
  const specialAction = document.getElementById("appSpecialAction").value.trim().toUpperCase();

  if (!name)        { showToast("Digite o nome do aplicativo", "error"); return; }
  if (!packageName) { showToast("Digite o package name", "error"); return; }
  if (!id)          { showToast("Digite o ID único", "error"); return; }
  if (!/^[a-z0-9]+$/.test(id)) { showToast("ID deve conter apenas letras minúsculas e números", "error"); return; }
  if (!currentEditingAppId && availableApps[id]) { showToast("Este ID já existe", "error"); return; }
  if (launchType === "special" && !specialAction) { showToast("Digite a ação especial", "error"); return; }

  const appData = {
    id, name,
    icon: icon || name.slice(0, 3).toUpperCase(),
    packageName, launchType,
    createdAt: currentEditingAppId ? (availableApps[currentEditingAppId]?.createdAt || Date.now()) : Date.now(),
    updatedAt: Date.now(),
    isDefault: false
  };
  if (launchType === "special") appData.specialAction = specialAction;

  set(ref(db, `availableApps/${id}`), appData)
    .then(() => {
      showToast(`"${name}" ${currentEditingAppId ? "atualizado" : "adicionado"} com sucesso`, "success");
      closeAppModal();
    })
    .catch(err => showToast(`Erro: ${err.message}`, "error"));
}

function confirmDeleteApp() {
  if (!currentEditingAppId) return;
  const app = availableApps[currentEditingAppId];
  if (app?.isDefault) { showToast("Aplicativos padrão não podem ser removidos", "error"); return; }

  showConfirm(
    "Remover Aplicativo",
    `Tem certeza que deseja remover "${app?.name}"? Esta ação não pode ser desfeita.`,
    () => {
      remove(ref(db, `availableApps/${currentEditingAppId}`))
        .then(() => { showToast("Aplicativo removido", "success"); closeAppModal(); })
        .catch(err => showToast(`Erro: ${err.message}`, "error"));
    }
  );
}

function deleteApp() { confirmDeleteApp(); }

/* =========================
   GROUPS — RENDER
========================= */
function renderGroups() {
  const grid = document.getElementById("groupsGrid");

  if (Object.keys(groups).length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 48 48" fill="none">
          <circle cx="16" cy="18" r="6" stroke="currentColor" stroke-width="2"/>
          <circle cx="32" cy="18" r="6" stroke="currentColor" stroke-width="2"/>
          <path d="M4 40c0-7 5.4-12 12-12h16c6.6 0 12 5 12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <div class="empty-title">Nenhum grupo criado</div>
        <div class="empty-sub">Crie grupos para controlar múltiplos dispositivos simultaneamente</div>
      </div>`;
    return;
  }

  grid.innerHTML = Object.entries(groups).map(([id, g]) => {
    const deviceCount = g.devices?.length || 0;
    const appInfo     = getAppInfo(g.defaultApp);

    return `
      <div class="group-card" onclick="openEditGroupModal('${id}')">
        <div class="group-header">
          <span class="group-name">${g.name}</span>
          <span class="group-count">${deviceCount} dispositivo${deviceCount !== 1 ? "s" : ""}</span>
        </div>
        ${g.defaultApp ? `
        <div class="group-app">
          <span class="group-app-label">App padrão</span>
          <strong class="group-app-name">${appInfo.name}</strong>
        </div>` : ""}
        <div class="group-devices">
          ${deviceCount > 0
            ? (g.devices || []).map(d => `<span class="device-tag">${d}</span>`).join("")
            : `<span class="group-empty-devices">Nenhum dispositivo</span>`}
        </div>
        <div class="group-actions" onclick="event.stopPropagation()">
          <button class="btn btn-primary btn-small"
                  onclick="executeGroup('${id}')"
                  ${!g.defaultApp || deviceCount === 0 ? "disabled" : ""}>
            Executar
          </button>
          <button class="btn btn-secondary btn-small" onclick="openEditGroupModal('${id}')">
            Editar
          </button>
        </div>
      </div>`;
  }).join("");
}

/* =========================
   GROUPS — MODAL
========================= */
function openCreateGroupModal() {
  currentEditingGroupId = null;
  document.getElementById("modalTitle").textContent       = "Criar Novo Grupo";
  document.getElementById("groupName").value              = "";
  document.getElementById("groupApp").value               = "";
  document.getElementById("btnDeleteGroup").style.display = "none";
  updateDevicesChecklistInModal();
  document.getElementById("groupModal").classList.add("active");
}

function openEditGroupModal(groupId) {
  currentEditingGroupId = groupId;
  const group = groups[groupId];
  if (!group) return;

  document.getElementById("modalTitle").textContent       = "Editar Grupo";
  document.getElementById("groupName").value              = group.name;
  document.getElementById("groupApp").value               = group.defaultApp || "";
  document.getElementById("btnDeleteGroup").style.display = "block";
  updateDevicesChecklistInModal(group.devices || []);
  document.getElementById("groupModal").classList.add("active");
}

function closeGroupModal() {
  document.getElementById("groupModal").classList.remove("active");
  currentEditingGroupId = null;
}

function updateDevicesChecklistInModal(selectedDeviceIds = []) {
  const container = document.getElementById("devicesList");

  if (Object.keys(devices).length === 0) {
    container.innerHTML = `<div class="checklist-empty">Nenhum dispositivo disponível</div>`;
    return;
  }

  container.innerHTML = Object.entries(devices)
    .sort(([idA], [idB]) => idA.localeCompare(idB))
    .map(([id, d]) => {
      const isChecked = selectedDeviceIds.includes(id);
      const online    = isOnline(d);
      return `
        <div class="device-checkbox-item">
          <input type="checkbox" id="device-${id}" value="${id}" ${isChecked ? "checked" : ""}>
          <label class="device-checkbox-label" for="device-${id}">
            ${id}
            <span class="checkbox-status ${online ? "status-online" : "status-offline"}">
              <span class="status-dot"></span>
              ${online ? "Online" : "Offline"}
            </span>
          </label>
        </div>`;
    }).join("");
}

function saveGroup() {
  const name         = document.getElementById("groupName").value.trim();
  const defaultApp   = document.getElementById("groupApp").value;
  const selectedList = Array.from(
    document.querySelectorAll("#devicesList input[type='checkbox']:checked")
  ).map(i => i.value);

  if (!name)                     { showToast("Digite um nome para o grupo", "error"); return; }
  if (selectedList.length === 0) { showToast("Selecione ao menos um dispositivo", "error"); return; }

  const groupData = {
    name, defaultApp: defaultApp || null, devices: selectedList,
    createdAt: currentEditingGroupId ? groups[currentEditingGroupId].createdAt : Date.now(),
    updatedAt: Date.now()
  };

  if (currentEditingGroupId) {
    update(ref(db, `groups/${currentEditingGroupId}`), groupData)
      .then(() => { showToast("Grupo atualizado com sucesso", "success"); closeGroupModal(); })
      .catch(err => showToast(`Erro: ${err.message}`, "error"));
  } else {
    set(push(ref(db, "groups")), groupData)
      .then(() => { showToast("Grupo criado com sucesso", "success"); closeGroupModal(); })
      .catch(err => showToast(`Erro: ${err.message}`, "error"));
  }
}

function confirmDeleteGroup() {
  if (!currentEditingGroupId) return;
  showConfirm(
    "Remover Grupo",
    `Tem certeza que deseja remover o grupo "${groups[currentEditingGroupId]?.name}"? Esta ação não pode ser desfeita.`,
    () => {
      remove(ref(db, `groups/${currentEditingGroupId}`))
        .then(() => { showToast("Grupo removido", "success"); closeGroupModal(); })
        .catch(err => showToast(`Erro: ${err.message}`, "error"));
    }
  );
}

function deleteGroup() { confirmDeleteGroup(); }

function executeGroup(groupId) {
  const group = groups[groupId];
  if (!group || !group.defaultApp || !group.devices?.length) {
    showToast("Grupo inválido ou sem app padrão", "error");
    return;
  }
  let sent = 0, offline = 0;
  group.devices.forEach(deviceId => {
    const device = devices[deviceId];
    if (device && isOnline(device)) { sendCommand(deviceId, group.defaultApp); sent++; }
    else offline++;
  });
  if (sent > 0)    showToast(`Comando enviado para ${sent} dispositivo(s)`, "success");
  if (offline > 0) showToast(`${offline} dispositivo(s) offline ignorado(s)`, "warning");
}

/* =========================
   LOGS
========================= */
function createCommandLog(deviceId, action, status, message, commandId = null) {
  const logId   = commandId || crypto.randomUUID();
  const appInfo = getAppInfo(action);
  set(ref(db, `commandLogs/${logId}`), {
    logId, deviceId, action,
    appName: appInfo.name,
    appIcon: appInfo.icon,
    status, message,
    timestamp: Date.now()
  });
}

function updateCommandLog(commandId, status, message) {
  update(ref(db, `commandLogs/${commandId}`), { status, message, updatedAt: Date.now() });
}

function confirmClearLogs() {
  showConfirm("Limpar Logs", "Tem certeza que deseja apagar todo o histórico de comandos?", () => {
    remove(ref(db, "commandLogs")).then(() => {
      commandLogs = {};
      unreadLogsCount = 0;
      updateUnreadBadge();
      renderLogs();
      showToast("Histórico limpo", "success");
    });
  });
}

function clearLogs() { confirmClearLogs(); }

function openLogsModal() {
  document.getElementById("logsModal").classList.add("active");
  unreadLogsCount = 0;
  updateUnreadBadge();
  renderLogs();
}

function closeLogsModal() {
  document.getElementById("logsModal").classList.remove("active");
}

function updateUnreadBadge() {
  const badge = document.getElementById("unreadLogsCount");
  if (unreadLogsCount > 0) {
    badge.textContent   = unreadLogsCount > 99 ? "99+" : unreadLogsCount;
    badge.style.display = "block";
  } else {
    badge.style.display = "none";
  }
}

function updateLogFilters() {
  const filter = document.getElementById("logFilterDevice");
  const prev   = filter.value;
  filter.innerHTML = `<option value="all">Todos os Dispositivos</option>`;
  Object.keys(devices).forEach(id => {
    const opt = document.createElement("option");
    opt.value = id; opt.textContent = id;
    filter.appendChild(opt);
  });
  filter.value = prev;
}

function renderLogs() {
  const container    = document.getElementById("logsContainer");
  const statusFilter = document.getElementById("logFilterStatus").value;
  const deviceFilter = document.getElementById("logFilterDevice").value;
  const logsArray    = Object.values(commandLogs);

  if (logsArray.length === 0) {
    container.innerHTML = `
      <div class="logs-empty">
        <svg viewBox="0 0 48 48" fill="none" style="width:48px;height:48px;margin-bottom:16px;">
          <rect x="8" y="6" width="32" height="36" rx="3" stroke="currentColor" stroke-width="2"/>
          <path d="M16 14h16M16 20h16M16 26h10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <div>Nenhum comando executado</div>
      </div>`;
    return;
  }

  const filtered = logsArray
    .filter(log => (statusFilter === "all" || log.status === statusFilter)
                && (deviceFilter === "all" || log.deviceId === deviceFilter))
    .sort((a, b) => b.timestamp - a.timestamp);

  if (filtered.length === 0) {
    container.innerHTML = `<div class="logs-empty"><div>Nenhum resultado encontrado</div></div>`;
    return;
  }

  const statusLabel = { success: "Sucesso", error: "Erro", pending: "Aguardando", timeout: "Timeout" };

  container.innerHTML = filtered.map(log => `
    <div class="log-item log-${log.status}">
      <div class="log-header">
        <span class="log-device">${log.appIcon ? `<span class="log-app-badge">${log.appIcon}</span>` : ""}${log.deviceId}</span>
        <span class="log-status status-${log.status}">${statusLabel[log.status] || log.status}</span>
      </div>
      <div class="log-details">
        <div class="log-detail-row"><span>Aplicativo</span><span>${log.appName}</span></div>
        <div class="log-detail-row"><span>Mensagem</span><span>${log.message}</span></div>
      </div>
      <div class="log-time">${formatFullTime(log.timestamp)}</div>
    </div>`).join("");
}

/* =========================
   MODAL DE CONFIRMAÇÃO
========================= */
let confirmCallback = null;

function showConfirm(title, message, onConfirm) {
  confirmCallback = onConfirm;
  document.getElementById("confirmTitle").textContent   = title;
  document.getElementById("confirmMessage").textContent = message;
  document.getElementById("confirmModal").classList.add("active");
}

function closeConfirmModal() {
  document.getElementById("confirmModal").classList.remove("active");
  confirmCallback = null;
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnConfirmOk").addEventListener("click", () => {
    if (confirmCallback) confirmCallback();
    closeConfirmModal();
  });
});

/* =========================
   STATS
========================= */
function updateStats() {
  let filteredDevices = devices;
  if (currentUser && currentUser.type === 'user' && userSession) {
    const allowedDevices = userSession.allowedDevices || [];
    if (allowedDevices.length > 0) {
      filteredDevices = Object.fromEntries(
        Object.entries(devices).filter(([id]) => allowedDevices.includes(id))
      );
    }
  }
  document.getElementById("totalDevices").textContent  = Object.keys(filteredDevices).length;
  document.getElementById("onlineDevices").textContent = Object.values(filteredDevices).filter(isOnline).length;
  document.getElementById("totalGroups").textContent   = Object.keys(groups).length;
}

/* =========================
   FORMATAÇÃO
========================= */
function formatTime(timestamp) {
  const diff = Date.now() - timestamp;
  if (diff < 60000)    return "Agora";
  if (diff < 3600000)  return `${Math.floor(diff / 60000)}min atrás`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h atrás`;
  return new Date(timestamp).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatFullTime(timestamp) {
  return new Date(timestamp).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/* =========================
   TOAST
========================= */
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  const icons = {
    success: `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M5 8l2 2 4-4" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    error:   `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    info:    `<svg viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" stroke-width="1.4"/><path d="M8 7v5M8 5v1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>`,
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
   EXPORTS
========================= */
window.switchTab             = switchTab;
window.toggleDevice          = toggleDevice;
window.selectAllDevices      = selectAllDevices;
window.deselectAllDevices    = deselectAllDevices;
window.sendCommand           = sendCommand;
window.sendCommandToSelected = sendCommandToSelected;
window.openCreateGroupModal  = openCreateGroupModal;
window.openEditGroupModal    = openEditGroupModal;
window.closeGroupModal       = closeGroupModal;
window.saveGroup             = saveGroup;
window.deleteGroup           = deleteGroup;
window.executeGroup          = executeGroup;
window.openLogsModal         = openLogsModal;
window.closeLogsModal        = closeLogsModal;
window.clearLogs             = clearLogs;
window.openEditAppModal      = openEditAppModal;