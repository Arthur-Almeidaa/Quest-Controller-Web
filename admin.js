import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getDatabase, ref, onValue, set, update, remove, push, get
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import {
  getAuth, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* =========================
   FIREBASE CONFIG
========================= */
const firebaseConfig = {
  apiKey: "AIzaSyDAkapYFpjsugAn5lFq8e5pXHdecn75Ej8",
  databaseURL: "https://teste-f579d-default-rtdb.firebaseio.com",
  projectId: "teste-f579d"
};

const app  = initializeApp(firebaseConfig);
const db   = getDatabase(app);
const auth = getAuth(app);

const ADMIN_EMAILS = [
  "admincontroller@gmail.com",
  "questcontroller.br@gmail.com"
];

/* =========================
   AUTH GUARD
========================= */
onAuthStateChanged(auth, user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  // Verifica se é admin
  if (!ADMIN_EMAILS.includes(user.email)) {
    alert("Acesso negado. Esta área é restrita a administradores.");
    signOut(auth);
    window.location.href = "index.html";
    return;
  }

  // Exibe e-mail no header
  const emailEl = document.getElementById("loggedUserEmail");
  if (emailEl) {
    const short = user.email.split("@")[0];
    emailEl.textContent = short.length > 12 ? short.slice(0, 12) + "…" : short;
    emailEl.title = user.email;
  }

  initApp();
});

/* =========================
   ESTADO GLOBAL
========================= */
let devices        = {};
let groups         = {};
let users          = {};
let sectors        = {};
let availableApps  = {};
let selectedDevices = new Set();
let currentEditingGroupId  = null;
let currentEditingAppId    = null;
let currentEditingUserId   = null;
let currentEditingSectorId = null;

/* =========================
   INICIALIZAÇÃO
========================= */
function initApp() {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      initializeEventListeners();
      initializeDefaultApps();
      startFirebaseListeners();
      switchTab('devices'); // Abre devices primeiro
    });
  } else {
    initializeEventListeners();
    initializeDefaultApps();
    startFirebaseListeners();
    switchTab('devices'); // Abre devices primeiro
  }
}

/* =========================
   APPS PADRÃO
========================= */
async function initializeDefaultApps() {
  const appsSnapshot = await get(ref(db, "availableApps"));
  if (appsSnapshot.exists()) {
    console.log("Apps já existem no banco");
    return;
  }

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
    },
    creed: {
      id: "creed", name: "Creed", icon: "CR",
      packageName: "com.survios.creed",
      launchType: "normal",
      createdAt: Date.now(), isDefault: true
    }
  };

  try {
    await set(ref(db, "availableApps"), defaultApps);
    console.log("✅ Apps padrão criados com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao criar apps padrão:", error);
  }
}

/* =========================
   FIREBASE LISTENERS
========================= */
function startFirebaseListeners() {
  // Devices
  onValue(ref(db, "devices"), snap => {
    devices = snap.val() || {};
    renderDevices();
    updateStats();
    updateDevicesChecklistInModals();
  });

  // Groups
  onValue(ref(db, "groups"), snap => {
    groups = snap.val() || {};
    renderGroups();
    updateStats();
  });

  // Users
  onValue(ref(db, "users"), snap => {
    users = snap.val() || {};
    renderUsers();
    updateStats();
  });

  // Sectors
  onValue(ref(db, "sectors"), snap => {
    sectors = snap.val() || {};
    renderSectors();
    updateStats();
    populateSectorSelects();
  });

  // Available Apps
  onValue(ref(db, "availableApps"), snap => {
    availableApps = snap.val() || {};
    console.log("Apps carregados:", Object.keys(availableApps));
    populateAppSelects();
    renderDevices();
  });
}

/* =========================
   EVENT LISTENERS
========================= */
function initializeEventListeners() {
  // Tabs
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  // Auth
  document.getElementById("btnLogout")?.addEventListener("click", handleLogout);

  // Devices
  document.getElementById("btnExecuteSelected")?.addEventListener("click", sendCommandToSelected);
  document.getElementById("btnSelectAll")?.addEventListener("click", selectAllDevices);
  document.getElementById("btnAddApp")?.addEventListener("click", openAddAppModal);

  // Users
  document.getElementById("btnCreateUser")?.addEventListener("click", openCreateUserModal);
  document.getElementById("btnCloseUserModal")?.addEventListener("click", closeUserModal);
  document.getElementById("btnCancelUserModal")?.addEventListener("click", closeUserModal);
  document.getElementById("btnSaveUser")?.addEventListener("click", saveUser);
  document.getElementById("btnDeleteUser")?.addEventListener("click", () => confirmDeleteUser());
  document.getElementById("searchUsers")?.addEventListener("input", renderUsers);
  document.getElementById("filterSector")?.addEventListener("change", renderUsers);
  document.getElementById("userModal")?.addEventListener("click", e => {
    if (e.target.id === "userModal") closeUserModal();
  });

  // Sectors
  document.getElementById("btnCreateSector")?.addEventListener("click", openCreateSectorModal);
  document.getElementById("btnCloseSectorModal")?.addEventListener("click", closeSectorModal);
  document.getElementById("btnCancelSectorModal")?.addEventListener("click", closeSectorModal);
  document.getElementById("btnSaveSector")?.addEventListener("click", saveSector);
  document.getElementById("btnDeleteSector")?.addEventListener("click", () => confirmDeleteSector());
  document.getElementById("sectorModal")?.addEventListener("click", e => {
    if (e.target.id === "sectorModal") closeSectorModal();
  });

  // Groups
  document.getElementById("btnCreateGroup")?.addEventListener("click", openCreateGroupModal);
  document.getElementById("btnCloseModal")?.addEventListener("click", closeGroupModal);
  document.getElementById("btnCancelModal")?.addEventListener("click", closeGroupModal);
  document.getElementById("btnSaveGroup")?.addEventListener("click", saveGroup);
  document.getElementById("btnDeleteGroup")?.addEventListener("click", () => confirmDeleteGroup());
  document.getElementById("groupModal")?.addEventListener("click", e => {
    if (e.target.id === "groupModal") closeGroupModal();
  });

  // Apps
  document.getElementById("btnCloseAppModal")?.addEventListener("click", closeAppModal);
  document.getElementById("btnCancelAppModal")?.addEventListener("click", closeAppModal);
  document.getElementById("btnSaveApp")?.addEventListener("click", saveApp);
  document.getElementById("btnDeleteApp")?.addEventListener("click", () => confirmDeleteApp());
  document.getElementById("appModal")?.addEventListener("click", e => {
    if (e.target.id === "appModal") closeAppModal();
  });

  // Confirm Modal
  document.getElementById("btnCloseConfirm")?.addEventListener("click", closeConfirmModal);
  document.getElementById("btnConfirmCancel")?.addEventListener("click", closeConfirmModal);
  document.getElementById("confirmModal")?.addEventListener("click", e => {
    if (e.target.id === "confirmModal") closeConfirmModal();
  });
}

/* =========================
   AUTH
========================= */
async function handleLogout() {
  showConfirm("Encerrar Sessão", "Tem certeza que deseja sair do painel?", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}

/* =========================
   TABS
========================= */
function switchTab(tabName) {
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  document.querySelector(`[data-tab="${tabName}"]`)?.classList.add("active");
  document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
  document.getElementById(`${tabName}Tab`)?.classList.add("active");
}

/* =========================
   DEVICES
========================= */
function renderDevices() {
  const grid = document.getElementById("devicesGrid");
  if (!grid) return;

  if (Object.keys(devices).length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon" viewBox="0 0 48 48" fill="none">
          <rect x="4" y="16" width="40" height="20" rx="5" stroke="currentColor" stroke-width="2"/>
          <circle cx="14" cy="26" r="3" stroke="currentColor" stroke-width="2"/>
          <circle cx="34" cy="26" r="3" stroke="currentColor" stroke-width="2"/>
          <path d="M24 22v8M20 26h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <div class="empty-title">Nenhum dispositivo conectado</div>
        <div class="empty-sub">Os dispositivos aparecerão aqui quando se conectarem</div>
      </div>`;
    return;
  }

  grid.innerHTML = Object.entries(devices)
    .sort(([, a], [, b]) => (isOnline(b) ? 1 : 0) - (isOnline(a) ? 1 : 0))
    .map(([id, d]) => {
      const battery = d.battery ?? 0;
      const isSelected = selectedDevices.has(id);
      const online = isOnline(d);
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

          <div class="device-actions" onclick="event.stopPropagation()">
            ${renderAppButtons(id, online)}
          </div>
        </div>`;
    }).join("");
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
            title="${app.name}"
            oncontextmenu="event.preventDefault(); event.stopPropagation(); openEditAppModal('${app.id}'); return false;">
      <span class="app-btn-icon">${app.icon || app.name.slice(0, 2).toUpperCase()}</span>
      ${app.name}
    </button>`).join("");

  return html;
}

function toggleDevice(id) {
  if (selectedDevices.has(id)) selectedDevices.delete(id);
  else selectedDevices.add(id);
  renderDevices();
}

function selectAllDevices() {
  Object.keys(devices).forEach(id => selectedDevices.add(id));
  renderDevices();
}

async function sendCommand(deviceId, appId) {
  const device = devices[deviceId];
  if (!device || !isOnline(device)) {
    showToast("Dispositivo offline", "error");
    return;
  }

  const app = availableApps[appId];
  if (!app) {
    showToast("Aplicativo não encontrado", "error");
    return;
  }

  try {
    await set(ref(db, `devices/${deviceId}/command`), {
      action: appId,
      timestamp: Date.now()
    });
    showToast(`Comando enviado para ${deviceId}`, "info");
  } catch (error) {
    console.error("Erro ao enviar comando:", error);
    showToast("Erro ao enviar comando", "error");
  }
}

async function sendCommandToSelected() {
  const appId = document.getElementById("deviceAppSelect")?.value;

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
   USERS - CRUD
========================= */
function renderUsers() {
  const grid = document.getElementById("usersGrid");
  if (!grid) return;

  const searchTerm = document.getElementById("searchUsers")?.value.toLowerCase() || "";
  const sectorFilter = document.getElementById("filterSector")?.value || "";

  let filteredUsers = Object.entries(users);

  if (searchTerm) {
    filteredUsers = filteredUsers.filter(([id, user]) => 
      user.username.toLowerCase().includes(searchTerm)
    );
  }

  if (sectorFilter) {
    filteredUsers = filteredUsers.filter(([id, user]) => 
      user.sector === sectorFilter
    );
  }

  if (filteredUsers.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Nenhum usuário encontrado</div>
        <div class="empty-sub">Crie usuários para gerenciar acessos</div>
      </div>`;
    return;
  }

  grid.innerHTML = filteredUsers.map(([userId, user]) => {
    const sector = sectors[user.sector];
    const deviceCount = (user.allowedDevices || []).length;

    return `
      <div class="device-card" onclick="openEditUserModal('${userId}')">
        <div class="device-header">
          <div class="device-header-left">
            <span class="device-name">${user.username}</span>
          </div>
          <span class="device-status ${user.active ? 'status-online' : 'status-offline'}">
            ${user.active ? 'Ativo' : 'Inativo'}
          </span>
        </div>
        
        ${sector ? `
          <div class="user-sector-badge" style="--sector-color: ${sector.color}">
            <span class="user-sector-dot"></span>
            ${sector.name}
          </div>
        ` : ''}
        
        <div class="device-info">
          <div class="info-row">
            <span class="info-label">Dispositivos permitidos</span>
            <span class="info-value">${deviceCount}</span>
          </div>
          ${user.createdAt ? `
          <div class="info-row">
            <span class="info-label">Criado em</span>
            <span class="info-value">${formatTime(user.createdAt)}</span>
          </div>` : ''}
        </div>
      </div>
    `;
  }).join("");
}

function openCreateUserModal() {
  currentEditingUserId = null;
  document.getElementById("userModalTitle").textContent = "Criar Novo Usuário";
  document.getElementById("userName").value = "";
  document.getElementById("userPassword").value = "";
  document.getElementById("userSector").value = "";
  document.getElementById("userActive").checked = true;
  document.getElementById("btnDeleteUser").style.display = "none";
  
  updateDevicesChecklistInModals();
  
  document.getElementById("userModal").classList.add("active");
}

function openEditUserModal(userId) {
  currentEditingUserId = userId;
  const user = users[userId];
  
  document.getElementById("userModalTitle").textContent = "Editar Usuário";
  document.getElementById("userName").value = user.username;
  document.getElementById("userPassword").value = user.password;
  document.getElementById("userSector").value = user.sector || "";
  document.getElementById("userActive").checked = user.active !== false;
  document.getElementById("btnDeleteUser").style.display = "block";
  
  updateDevicesChecklistInModals(user.allowedDevices || []);
  
  document.getElementById("userModal").classList.add("active");
}

function closeUserModal() {
  document.getElementById("userModal").classList.remove("active");
}

async function saveUser() {
  const username = document.getElementById("userName").value.trim();
  const password = document.getElementById("userPassword").value;
  const sector = document.getElementById("userSector").value;
  const active = document.getElementById("userActive").checked;

  if (!username) {
    showToast("Digite um nome de usuário", "error");
    return;
  }

  if (!password || password.length < 4) {
    showToast("A senha deve ter no mínimo 4 caracteres", "error");
    return;
  }

  const allowedDevices = Array.from(
    document.querySelectorAll('#userDevicesList input[type="checkbox"]:checked')
  ).map(cb => cb.value);

  if (allowedDevices.length === 0) {
    showToast("Selecione ao menos um dispositivo", "error");
    return;
  }

  const userData = {
    username,
    password,
    sector,
    allowedDevices,
    active,
    createdAt: currentEditingUserId ? users[currentEditingUserId].createdAt : Date.now(),
    updatedAt: Date.now()
  };

  try {
    const userId = currentEditingUserId || push(ref(db, "users")).key;
    await set(ref(db, `users/${userId}`), userData);
    
    showToast("Usuário salvo com sucesso!", "success");
    closeUserModal();
  } catch (error) {
    console.error("Erro ao salvar usuário:", error);
    showToast("Erro ao salvar usuário", "error");
  }
}

function confirmDeleteUser() {
  if (!currentEditingUserId) return;
  
  const user = users[currentEditingUserId];
  showConfirm(
    "Excluir Usuário",
    `Tem certeza que deseja excluir o usuário "${user.username}"?`,
    async () => {
      try {
        await remove(ref(db, `users/${currentEditingUserId}`));
        showToast("Usuário excluído", "success");
        closeUserModal();
      } catch (error) {
        console.error("Erro ao excluir usuário:", error);
        showToast("Erro ao excluir usuário", "error");
      }
    }
  );
}

/* =========================
   SECTORS - CRUD
========================= */
function renderSectors() {
  const grid = document.getElementById("sectorsGrid");
  if (!grid) return;
  
  if (Object.keys(sectors).length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Nenhum setor criado</div>
        <div class="empty-sub">Crie setores para organizar seus usuários</div>
      </div>`;
    return;
  }
  
  grid.innerHTML = Object.entries(sectors).map(([sectorId, sector]) => {
    const usersInSector = Object.values(users).filter(u => u.sector === sectorId);
    const activeUsers = usersInSector.filter(u => u.active).length;
    
    return `
      <div class="sector-card" style="--sector-color: ${sector.color}" 
           onclick="openEditSectorModal('${sectorId}')">
        <div class="sector-header">
          <div class="sector-info">
            <div class="sector-name">${sector.name}</div>
            <div class="sector-description">${sector.description || 'Sem descrição'}</div>
          </div>
          <div class="sector-badge" style="background: ${sector.color}">
            ${sector.name.slice(0, 2).toUpperCase()}
          </div>
        </div>
        
        <div class="sector-stats">
          <div class="sector-stat">
            <div class="sector-stat-value">${usersInSector.length}</div>
            <div class="sector-stat-label">Usuários</div>
          </div>
          <div class="sector-stat">
            <div class="sector-stat-value">${activeUsers}</div>
            <div class="sector-stat-label">Ativos</div>
          </div>
        </div>
        
        ${usersInSector.length > 0 ? `
          <div class="sector-users-list">
            ${usersInSector.slice(0, 10).map(u => `
              <span class="sector-user-tag">${u.username}</span>
            `).join('')}
            ${usersInSector.length > 10 ? `<span class="sector-user-tag">+${usersInSector.length - 10}</span>` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }).join("");
}

function openCreateSectorModal() {
  currentEditingSectorId = null;
  document.getElementById("sectorModalTitle").textContent = "Criar Novo Setor";
  document.getElementById("sectorName").value = "";
  document.getElementById("sectorDescription").value = "";
  document.querySelectorAll('input[name="sectorColor"]')[0].checked = true;
  document.getElementById("btnDeleteSector").style.display = "none";
  document.getElementById("sectorModal").classList.add("active");
}

function openEditSectorModal(sectorId) {
  currentEditingSectorId = sectorId;
  const sector = sectors[sectorId];
  
  document.getElementById("sectorModalTitle").textContent = "Editar Setor";
  document.getElementById("sectorName").value = sector.name;
  document.getElementById("sectorDescription").value = sector.description || "";
  
  const colorRadios = document.querySelectorAll('input[name="sectorColor"]');
  colorRadios.forEach(radio => {
    radio.checked = radio.value === sector.color;
  });
  
  document.getElementById("btnDeleteSector").style.display = "block";
  document.getElementById("sectorModal").classList.add("active");
}

function closeSectorModal() {
  document.getElementById("sectorModal").classList.remove("active");
}

async function saveSector() {
  const name = document.getElementById("sectorName").value.trim();
  const description = document.getElementById("sectorDescription").value.trim();
  const color = document.querySelector('input[name="sectorColor"]:checked')?.value || "#3b82f6";

  if (!name) {
    showToast("Digite um nome para o setor", "error");
    return;
  }

  const sectorData = {
    id: currentEditingSectorId || `sector_${Date.now()}`,
    name,
    description,
    color,
    createdAt: currentEditingSectorId ? sectors[currentEditingSectorId].createdAt : Date.now(),
    updatedAt: Date.now(),
    createdBy: auth.currentUser.email
  };

  try {
    const sectorId = currentEditingSectorId || sectorData.id;
    await set(ref(db, `sectors/${sectorId}`), sectorData);
    
    showToast("Setor salvo com sucesso!", "success");
    closeSectorModal();
  } catch (error) {
    console.error("Erro ao salvar setor:", error);
    showToast("Erro ao salvar setor", "error");
  }
}

function confirmDeleteSector() {
  if (!currentEditingSectorId) return;
  
  const sector = sectors[currentEditingSectorId];
  const usersInSector = Object.values(users).filter(u => u.sector === currentEditingSectorId);
  
  let message = `Tem certeza que deseja excluir o setor "${sector.name}"?`;
  if (usersInSector.length > 0) {
    message += `\n\n${usersInSector.length} usuário(s) estão neste setor. Eles ficarão sem setor após a exclusão.`;
  }
  
  showConfirm("Excluir Setor", message, async () => {
    try {
      await remove(ref(db, `sectors/${currentEditingSectorId}`));
      
      // Remove setor dos usuários
      for (const user of usersInSector) {
        const userId = Object.keys(users).find(id => users[id].username === user.username);
        if (userId) {
          await update(ref(db, `users/${userId}`), { sector: "" });
        }
      }
      
      showToast("Setor excluído", "success");
      closeSectorModal();
    } catch (error) {
      console.error("Erro ao excluir setor:", error);
      showToast("Erro ao excluir setor", "error");
    }
  });
}

/* =========================
   GROUPS - CRUD
========================= */
function renderGroups() {
  const grid = document.getElementById("groupsGrid");
  if (!grid) return;
  
  if (Object.keys(groups).length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Nenhum grupo criado</div>
        <div class="empty-sub">Crie grupos para organizar dispositivos</div>
      </div>`;
    return;
  }
  
  grid.innerHTML = Object.entries(groups).map(([groupId, group]) => {
    const deviceCount = (group.devices || []).length;
    const app = availableApps[group.defaultApp];
    
    return `
      <div class="device-card" onclick="openEditGroupModal('${groupId}')">
        <div class="device-header">
          <div class="device-header-left">
            <span class="device-name">${group.name}</span>
          </div>
        </div>
        
        <div class="device-info">
          <div class="info-row">
            <span class="info-label">Dispositivos</span>
            <span class="info-value">${deviceCount}</span>
          </div>
          <div class="info-row">
            <span class="info-label">App padrão</span>
            <span class="info-value">${app ? app.name : "Nenhum"}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

function openCreateGroupModal() {
  currentEditingGroupId = null;
  document.getElementById("modalTitle").textContent = "Criar Novo Grupo";
  document.getElementById("groupName").value = "";
  document.getElementById("groupApp").value = "";
  document.getElementById("btnDeleteGroup").style.display = "none";
  
  updateDevicesChecklistInModals();
  
  document.getElementById("groupModal").classList.add("active");
}

function openEditGroupModal(groupId) {
  currentEditingGroupId = groupId;
  const group = groups[groupId];
  
  document.getElementById("modalTitle").textContent = "Editar Grupo";
  document.getElementById("groupName").value = group.name;
  document.getElementById("groupApp").value = group.defaultApp || "";
  document.getElementById("btnDeleteGroup").style.display = "block";
  
  updateDevicesChecklistInModals(group.devices || []);
  
  document.getElementById("groupModal").classList.add("active");
}

function closeGroupModal() {
  document.getElementById("groupModal").classList.remove("active");
}

async function saveGroup() {
  const name = document.getElementById("groupName").value.trim();
  const defaultApp = document.getElementById("groupApp").value;

  if (!name) {
    showToast("Digite um nome para o grupo", "error");
    return;
  }

  const groupDevices = Array.from(
    document.querySelectorAll('#devicesList input[type="checkbox"]:checked')
  ).map(cb => cb.value);

  const groupData = {
    name,
    defaultApp,
    devices: groupDevices,
    createdAt: currentEditingGroupId ? groups[currentEditingGroupId].createdAt : Date.now(),
    updatedAt: Date.now()
  };

  try {
    const groupId = currentEditingGroupId || push(ref(db, "groups")).key;
    await set(ref(db, `groups/${groupId}`), groupData);
    
    showToast("Grupo salvo com sucesso!", "success");
    closeGroupModal();
  } catch (error) {
    console.error("Erro ao salvar grupo:", error);
    showToast("Erro ao salvar grupo", "error");
  }
}

function confirmDeleteGroup() {
  if (!currentEditingGroupId) return;
  
  const group = groups[currentEditingGroupId];
  showConfirm(
    "Excluir Grupo",
    `Tem certeza que deseja excluir o grupo "${group.name}"?`,
    async () => {
      try {
        await remove(ref(db, `groups/${currentEditingGroupId}`));
        showToast("Grupo excluído", "success");
        closeGroupModal();
      } catch (error) {
        console.error("Erro ao excluir grupo:", error);
        showToast("Erro ao excluir grupo", "error");
      }
    }
  );
}

/* =========================
   APPS - CRUD
========================= */
function openAddAppModal() {
  currentEditingAppId = null;
  document.getElementById("appModalTitle").textContent = "Adicionar Aplicativo";
  document.getElementById("appName").value = "";
  document.getElementById("appIcon").value = "";
  document.getElementById("appPackage").value = "";
  document.getElementById("appId").value = "";
  document.getElementById("btnDeleteApp").style.display = "none";
  document.getElementById("appModal").classList.add("active");
}

function openEditAppModal(appId) {
  currentEditingAppId = appId;
  const app = availableApps[appId];
  
  if (app.isSystem) {
    showToast("Aplicativos do sistema não podem ser editados", "warning");
    return;
  }
  
  document.getElementById("appModalTitle").textContent = "Editar Aplicativo";
  document.getElementById("appName").value = app.name;
  document.getElementById("appIcon").value = app.icon || "";
  document.getElementById("appPackage").value = app.packageName;
  document.getElementById("appId").value = app.id;
  document.getElementById("btnDeleteApp").style.display = "block";
  document.getElementById("appModal").classList.add("active");
}

function closeAppModal() {
  document.getElementById("appModal").classList.remove("active");
}

async function saveApp() {
  const name = document.getElementById("appName").value.trim();
  const icon = document.getElementById("appIcon").value.trim();
  const packageName = document.getElementById("appPackage").value.trim();
  const id = document.getElementById("appId").value.trim();

  if (!name || !packageName || !id) {
    showToast("Preencha todos os campos obrigatórios", "error");
    return;
  }

  const appData = {
    id,
    name,
    icon: icon || name.slice(0, 2).toUpperCase(),
    packageName,
    launchType: "normal",
    createdAt: currentEditingAppId ? availableApps[currentEditingAppId].createdAt : Date.now(),
    isDefault: false,
    isSystem: false
  };

  try {
    await set(ref(db, `availableApps/${id}`), appData);
    showToast("Aplicativo salvo com sucesso!", "success");
    closeAppModal();
  } catch (error) {
    console.error("Erro ao salvar aplicativo:", error);
    showToast("Erro ao salvar aplicativo", "error");
  }
}

function confirmDeleteApp() {
  if (!currentEditingAppId) return;
  
  const app = availableApps[currentEditingAppId];
  
  if (app.isSystem || app.isDefault) {
    showToast("Aplicativos padrão não podem ser excluídos", "warning");
    return;
  }
  
  showConfirm(
    "Excluir Aplicativo",
    `Tem certeza que deseja excluir "${app.name}"?`,
    async () => {
      try {
        await remove(ref(db, `availableApps/${currentEditingAppId}`));
        showToast("Aplicativo excluído", "success");
        closeAppModal();
      } catch (error) {
        console.error("Erro ao excluir aplicativo:", error);
        showToast("Erro ao excluir aplicativo", "error");
      }
    }
  );
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

function updateDevicesChecklistInModals(selectedDevices = []) {
  // Para modal de usuário
  const userDevicesList = document.getElementById("userDevicesList");
  if (userDevicesList) {
    userDevicesList.innerHTML = Object.keys(devices).map(deviceId => `
      <label class="checkbox-label">
        <input type="checkbox" class="checkbox-input" value="${deviceId}"
               ${selectedDevices.includes(deviceId) ? "checked" : ""}>
        <span class="checkbox-text">${deviceId}</span>
      </label>
    `).join("") || '<p style="color: var(--text-muted); font-size: 14px;">Nenhum dispositivo disponível</p>';
  }

  // Para modal de grupo
  const devicesList = document.getElementById("devicesList");
  if (devicesList) {
    devicesList.innerHTML = Object.keys(devices).map(deviceId => `
      <label class="checkbox-label">
        <input type="checkbox" class="checkbox-input" value="${deviceId}"
               ${selectedDevices.includes(deviceId) ? "checked" : ""}>
        <span class="checkbox-text">${deviceId}</span>
      </label>
    `).join("") || '<p style="color: var(--text-muted); font-size: 14px;">Nenhum dispositivo disponível</p>';
  }
}

function populateAppSelects() {
  // Dropdown de apps para executar
  const deviceAppSelect = document.getElementById("deviceAppSelect");
  if (deviceAppSelect) {
    const apps = getAllApps().filter(a => a.id !== "home");
    deviceAppSelect.innerHTML = '<option value="">Selecionar Aplicativo</option>' +
      apps.map(app => `<option value="${app.id}">${app.name}</option>`).join("");
  }

  // Dropdown de app padrão do grupo
  const groupApp = document.getElementById("groupApp");
  if (groupApp) {
    const apps = getAllApps();
    groupApp.innerHTML = '<option value="">Nenhum</option>' +
      apps.map(app => `<option value="${app.id}">${app.name}</option>`).join("");
  }
}

function populateSectorSelects() {
  // Dropdown de setores no form de usuário
  const userSector = document.getElementById("userSector");
  if (userSector) {
    userSector.innerHTML = '<option value="">Sem setor</option>' +
      Object.entries(sectors).map(([id, sector]) => 
        `<option value="${id}">${sector.name}</option>`
      ).join("");
  }

  // Dropdown de filtro de setor
  const filterSector = document.getElementById("filterSector");
  if (filterSector) {
    const currentValue = filterSector.value;
    filterSector.innerHTML = '<option value="">Todos os Setores</option>' +
      Object.entries(sectors).map(([id, sector]) => 
        `<option value="${id}" ${currentValue === id ? "selected" : ""}>${sector.name}</option>`
      ).join("");
  }
}

function updateStats() {
  const totalDevicesEl = document.getElementById("totalDevices");
  const totalUsersEl = document.getElementById("totalUsers");
  const totalSectorsEl = document.getElementById("totalSectors");
  const totalGroupsEl = document.getElementById("totalGroups");

  if (totalDevicesEl) totalDevicesEl.textContent = Object.keys(devices).length;
  if (totalUsersEl) totalUsersEl.textContent = Object.keys(users).length;
  if (totalSectorsEl) totalSectorsEl.textContent = Object.keys(sectors).length;
  if (totalGroupsEl) totalGroupsEl.textContent = Object.keys(groups).length;
}

function formatTime(timestamp) {
  const diff = Date.now() - timestamp;
  if (diff < 60000) return "Agora";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min atrás`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h atrás`;
  return new Date(timestamp).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
  });
}

/* =========================
   CONFIRM MODAL
========================= */
let confirmCallback = null;

function showConfirm(title, message, callback) {
  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmMessage").textContent = message;
  confirmCallback = callback;
  document.getElementById("confirmModal").classList.add("active");
  
  const btnOk = document.getElementById("btnConfirmOk");
  btnOk.onclick = () => {
    if (confirmCallback) confirmCallback();
    closeConfirmModal();
  };
}

function closeConfirmModal() {
  document.getElementById("confirmModal").classList.remove("active");
  confirmCallback = null;
}

/* =========================
   TOAST
========================= */
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

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
window.sendCommand = sendCommand;
window.openEditUserModal = openEditUserModal;
window.openEditSectorModal = openEditSectorModal;
window.openEditGroupModal = openEditGroupModal;
window.openEditAppModal = openEditAppModal;