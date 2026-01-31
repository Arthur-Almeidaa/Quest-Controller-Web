import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update, remove, push, get } 
from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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
   ESTADO GLOBAL
========================= */
let devices = {};
let groups = {};
let commandLogs = {};
let availableApps = {}; // ← Apps carregados do Firebase
let selectedDevices = new Set();
let currentEditingGroupId = null;
let currentEditingAppId = null;
let unreadLogsCount = 0;
let pendingCommands = new Map();

/* =========================
   CONSTANTES
========================= */
const COMMAND_TIMEOUT = 10000;

/* =========================
   FIREBASE LISTENERS
========================= */
onValue(ref(db, "devices"), snap => {
  const devicesData = snap.val() || {};
  
  Object.entries(devicesData).forEach(([deviceId, deviceData]) => {
    if (deviceData.commandResponse) {
      processCommandResponse(deviceId, deviceData.commandResponse);
    }
  });
  
  devices = devicesData;
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

// ✅ NOVO: Listener de apps
onValue(ref(db, "availableApps"), snap => {
  availableApps = snap.val() || {};
  console.log(`📱 Apps carregados: ${Object.keys(availableApps).length}`);
  populateAppSelects();
  renderDevices();
});

/* =========================
   INICIALIZAÇÃO
========================= */
document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  initializeDefaultApps();
});

function initializeEventListeners() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabName = tab.dataset.tab;
      switchTab(tabName);
    });
  });

  document.getElementById('btnExecuteSelected').addEventListener('click', sendCommandToSelected);
  document.getElementById('btnSelectAll').addEventListener('click', selectAllDevices);
  document.getElementById('btnDeselectAll').addEventListener('click', deselectAllDevices);
  
  // Apps
  document.getElementById('btnAddApp').addEventListener('click', openAddAppModal);
  document.getElementById('btnCloseAppModal').addEventListener('click', closeAppModal);
  document.getElementById('btnCancelAppModal').addEventListener('click', closeAppModal);
  document.getElementById('btnSaveApp').addEventListener('click', saveApp);
  document.getElementById('btnDeleteApp').addEventListener('click', deleteApp);
  
  // Preview
  document.getElementById('appName').addEventListener('input', updateAppPreview);
  document.getElementById('appIcon').addEventListener('input', updateAppPreview);
  document.getElementById('appPackage').addEventListener('input', updateAppPreview);
  document.getElementById('appLaunchType').addEventListener('change', toggleSpecialActionField);
  
  // Groups
  document.getElementById('btnCreateGroup').addEventListener('click', openCreateGroupModal);
  document.getElementById('btnCloseModal').addEventListener('click', closeGroupModal);
  document.getElementById('btnCancelModal').addEventListener('click', closeGroupModal);
  document.getElementById('btnSaveGroup').addEventListener('click', saveGroup);
  document.getElementById('btnDeleteGroup').addEventListener('click', deleteGroup);
  
  // Logs
  document.getElementById('btnOpenLogs').addEventListener('click', openLogsModal);
  document.getElementById('btnCloseLogsModal').addEventListener('click', closeLogsModal);
  document.getElementById('btnClearLogs').addEventListener('click', clearLogs);
  document.getElementById('logFilterStatus').addEventListener('change', renderLogs);
  document.getElementById('logFilterDevice').addEventListener('change', renderLogs);

  document.getElementById('groupModal').addEventListener('click', (e) => {
    if (e.target.id === 'groupModal') closeGroupModal();
  });
  
  document.getElementById('logsModal').addEventListener('click', (e) => {
    if (e.target.id === 'logsModal') closeLogsModal();
  });
  
  document.getElementById('appModal').addEventListener('click', (e) => {
    if (e.target.id === 'appModal') closeAppModal();
  });
}

/* =========================
   APPS PADRÃO
========================= */
async function initializeDefaultApps() {
  const appsSnapshot = await get(ref(db, "availableApps"));
  
  if (!appsSnapshot.exists()) {
    console.log('📱 Criando apps padrão...');
    
    const defaultApps = {
      home: {
        id: 'home',
        name: 'Menu Principal',
        icon: '🏠',
        packageName: 'com.oculus.vrshell',
        launchType: 'special',
        specialAction: 'HOME',
        createdAt: Date.now(),
        isDefault: true,
        isSystem: true
      },
      beatsaber: {
        id: 'beatsaber',
        name: 'Beat Saber',
        icon: '🎵',
        packageName: 'com.beatgames.beatsaber',
        launchType: 'special',
        specialAction: 'BEAT_SABER',
        createdAt: Date.now(),
        isDefault: true
      },
      blaston: {
        id: 'blaston',
        name: 'Blaston',
        icon: '🔫',
        packageName: 'com.resolutiongames.ignis',
        launchType: 'special',
        specialAction: 'BLASTON',
        createdAt: Date.now(),
        isDefault: true
      },
      hyperdash: {
        id: 'hyperdash',
        name: 'Hyper Dash',
        icon: '⚡',
        packageName: 'com.TriangleFactory.HyperDash',
        launchType: 'special',
        specialAction: 'HYPER_DASH',
        createdAt: Date.now(),
        isDefault: true
      },
      trolin: {
        id: 'trolin',
        name: 'Spatial Ops',
        icon: '🎯',
        packageName: 'com.resolutiongames.trolin',
        launchType: 'special',
        specialAction: 'TROLIN',
        createdAt: Date.now(),
        isDefault: true
      },
      homeinvasion: {
        id: 'homeinvasion',
        name: 'Home Invasion',
        icon: '🏠',
        packageName: 'com.soulassembly.homeinvasion',
        launchType: 'special',
        specialAction: 'HOME_INVASION',
        createdAt: Date.now(),
        isDefault: true
      },
      creed: {
        id: 'creed',
        name: 'Creed',
        icon: '🥊',
        packageName: 'com.survios.creed',
        launchType: 'normal',
        createdAt: Date.now(),
        isDefault: true
      }
    };
    
    await set(ref(db, "availableApps"), defaultApps);
    console.log('✅ Apps padrão criados!');
  }
}

/* =========================
   APPS - MODAL
========================= */
function toggleSpecialActionField() {
  const launchType = document.getElementById('appLaunchType').value;
  const specialActionGroup = document.getElementById('specialActionGroup');
  
  if (launchType === 'special') {
    specialActionGroup.style.display = 'block';
  } else {
    specialActionGroup.style.display = 'none';
  }
}

function openAddAppModal() {
  currentEditingAppId = null;
  
  document.getElementById('appModalTitle').textContent = '➕ Adicionar Novo Jogo';
  document.getElementById('appName').value = '';
  document.getElementById('appIcon').value = '';
  document.getElementById('appPackage').value = '';
  document.getElementById('appId').value = '';
  document.getElementById('appLaunchType').value = 'normal';
  document.getElementById('appSpecialAction').value = '';
  document.getElementById('specialActionGroup').style.display = 'none';
  document.getElementById('btnDeleteApp').style.display = 'none';
  document.getElementById('appPreview').style.display = 'none';
  
  document.getElementById('appModal').classList.add('active');
}

function openEditAppModal(appId) {
  currentEditingAppId = appId;
  const app = availableApps[appId];
  
  if (!app) return;
  
  document.getElementById('appModalTitle').textContent = '✏️ Editar Jogo';
  document.getElementById('appName').value = app.name;
  document.getElementById('appIcon').value = app.icon;
  document.getElementById('appPackage').value = app.packageName;
  document.getElementById('appId').value = app.id;
  document.getElementById('appId').disabled = true;
  document.getElementById('appLaunchType').value = app.launchType || 'normal';
  document.getElementById('appSpecialAction').value = app.specialAction || '';
  
  // Mostrar/ocultar campo de ação especial
  if (app.launchType === 'special') {
    document.getElementById('specialActionGroup').style.display = 'block';
  } else {
    document.getElementById('specialActionGroup').style.display = 'none';
  }
  
  document.getElementById('btnDeleteApp').style.display = app.isDefault ? 'none' : 'block';
  document.getElementById('appPreview').style.display = 'block';
  updateAppPreview();
  
  document.getElementById('appModal').classList.add('active');
}

function closeAppModal() {
  document.getElementById('appModal').classList.remove('active');
  document.getElementById('appId').disabled = false;
  currentEditingAppId = null;
}

function updateAppPreview() {
  const name = document.getElementById('appName').value.trim();
  const icon = document.getElementById('appIcon').value.trim();
  const packageName = document.getElementById('appPackage').value.trim();
  
  if (name || icon || packageName) {
    document.getElementById('appPreview').style.display = 'block';
    document.getElementById('previewIcon').textContent = icon || '🎮';
    document.getElementById('previewName').textContent = name || 'Nome do Jogo';
    document.getElementById('previewPackage').textContent = packageName || 'com.empresa.jogo';
  } else {
    document.getElementById('appPreview').style.display = 'none';
  }
}

function saveApp() {
  const name = document.getElementById('appName').value.trim();
  const icon = document.getElementById('appIcon').value.trim();
  const packageName = document.getElementById('appPackage').value.trim();
  const id = document.getElementById('appId').value.trim().toLowerCase();
  const launchType = document.getElementById('appLaunchType').value;
  const specialAction = document.getElementById('appSpecialAction').value.trim().toUpperCase();
  
  if (!name) {
    showToast('Digite o nome do jogo', 'error');
    return;
  }
  
  if (!packageName) {
    showToast('Digite o package name', 'error');
    return;
  }
  
  if (!id) {
    showToast('Digite o ID único', 'error');
    return;
  }
  
  if (!/^[a-z0-9]+$/.test(id)) {
    showToast('ID deve conter apenas letras minúsculas e números', 'error');
    return;
  }
  
  if (!currentEditingAppId && availableApps[id]) {
    showToast('Este ID já existe! Escolha outro.', 'error');
    return;
  }
  
  if (launchType === 'special' && !specialAction) {
    showToast('Digite a ação especial para apps do tipo "Especial"', 'error');
    return;
  }
  
  const appData = {
    id,
    name,
    icon: icon || '🎮',
    packageName,
    launchType,
    createdAt: currentEditingAppId ? availableApps[id].createdAt : Date.now(),
    updatedAt: Date.now(),
    isDefault: false
  };
  
  // Adicionar specialAction apenas se launchType for 'special'
  if (launchType === 'special') {
    appData.specialAction = specialAction;
  }
  
  set(ref(db, `availableApps/${id}`), appData)
    .then(() => {
      showToast(`✅ "${name}" ${currentEditingAppId ? 'atualizado' : 'adicionado'}!`, 'success');
      closeAppModal();
    })
    .catch(err => {
      showToast(`Erro: ${err.message}`, 'error');
    });
}

function deleteApp() {
  if (!currentEditingAppId) return;
  
  const app = availableApps[currentEditingAppId];
  
  if (app.isDefault) {
    showToast('Apps padrão não podem ser deletados', 'error');
    return;
  }
  
  if (!confirm(`Deletar "${app.name}"?`)) return;
  
  remove(ref(db, `availableApps/${currentEditingAppId}`))
    .then(() => {
      showToast('App deletado!', 'success');
      closeAppModal();
    })
    .catch(err => {
      showToast(`Erro: ${err.message}`, 'error');
    });
}

/* =========================
   APPS - UTILS
========================= */
function getAppInfo(appId) {
  return availableApps[appId] || { 
    id: appId,
    name: appId, 
    icon: '📱',
    packageName: appId
  };
}

function getAllApps() {
  return Object.values(availableApps);
}

function populateAppSelects() {
  const selects = ['deviceAppSelect', 'groupApp'];
  const apps = getAllApps();
  
  const optionsHTML = apps
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(app => `<option value="${app.id}">${app.icon} ${app.name}</option>`)
    .join('');
  
  selects.forEach(selectId => {
    const select = document.getElementById(selectId);
    if (select) {
      const firstOption = select.querySelector('option:first-child');
      select.innerHTML = firstOption.outerHTML + optionsHTML;
    }
  });
}

/* =========================
   TABS
========================= */
function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById(`${tabName}Tab`).classList.add('active');
}

/* =========================
   DEVICES - RENDER
========================= */
function renderDevices() {
  const grid = document.getElementById("devicesGrid");

  if (Object.keys(devices).length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div style="font-size: 48px; margin-bottom: 16px;">📱</div>
        <div>Nenhum dispositivo conectado</div>
        <div style="font-size: 14px; margin-top: 8px; opacity: 0.7;">Os dispositivos aparecerão aqui quando conectarem</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = Object.entries(devices)
    .sort(([, a], [, b]) => {
      const aOnline = isOnline(a);
      const bOnline = isOnline(b);
      if (aOnline !== bOnline) return bOnline - aOnline;
      return 0;
    })
    .map(([id, d]) => {
      const battery = d.battery ?? 0;
      const isSelected = selectedDevices.has(id);
      const online = isOnline(d);

      return `
        <div class="device-card ${isSelected ? 'selected' : ''}" onclick="toggleDevice('${id}')">
          <div class="device-header">
            <div>
              <input type="checkbox" ${isSelected ? 'checked' : ''} 
                     onclick="event.stopPropagation(); toggleDevice('${id}')">
              <span class="device-name">${id}</span>
            </div>
            <span class="device-status ${online ? 'status-online' : 'status-offline'}">
              ${online ? '● Online' : '○ Offline'}
            </span>
          </div>

          <div class="device-info">
            <div class="info-row">
              <span>Email</span>
              <span>${d.email || '-'}</span>
            </div>
            <div class="info-row">
              <span>IP</span>
              <span>${d.ip || '-'}</span>
            </div>
            <div class="info-row">
              <span>Bateria</span>
              <div class="battery">
                <div class="battery-bar">
                  <div class="battery-fill" style="width:${battery}%"></div>
                </div>
                ${battery}%
              </div>
            </div>
            ${d.lastUpdate ? `
              <div class="info-row">
                <span>Última resposta</span>
                <span>${formatTime(d.lastUpdate)}</span>
              </div>
            ` : ''}
          </div>

          <div class="device-actions" onclick="event.stopPropagation()">
            ${renderAppButtons(id, online)}
          </div>
        </div>
      `;
    }).join("");
}

function renderAppButtons(deviceId, online) {
  const apps = getAllApps();
  
  // Separar app "home" dos outros
  const homeApp = apps.find(app => app.id === 'home');
  const otherApps = apps.filter(app => app.id !== 'home');
  
  let buttonsHTML = '';
  
  // Botão HOME em destaque (se existir)
  if (homeApp) {
    buttonsHTML += `
      <button class="btn btn-danger btn-small" 
              onclick="sendCommand('${deviceId}','home')"
              ${!online ? 'disabled' : ''}
              style="grid-column: 1 / -1; background: #dc2626; font-weight: 600;"
              title="Voltar ao Menu Principal">
        🏠 Menu Principal
      </button>
    `;
  }
  
  // Outros apps
  buttonsHTML += otherApps.map(app => `
    <button class="btn btn-primary btn-small" 
            onclick="sendCommand('${deviceId}','${app.id}')"
            ${!online ? 'disabled' : ''}
            oncontextmenu="event.preventDefault(); event.stopPropagation(); openEditAppModal('${app.id}'); return false;">
      ${app.icon} ${app.name}
    </button>
  `).join('');
  
  return buttonsHTML;
}

function isOnline(device) {
  return device.status === "online";
}

/* =========================
   DEVICES - SELEÇÃO
========================= */
function toggleDevice(id) {
  if (selectedDevices.has(id)) {
    selectedDevices.delete(id);
  } else {
    selectedDevices.add(id);
  }
  renderDevices();
}

function selectAllDevices() {
  selectedDevices = new Set(Object.keys(devices));
  renderDevices();
  showToast('Todos selecionados', 'success');
}

function deselectAllDevices() {
  selectedDevices.clear();
  renderDevices();
  showToast('Seleção limpa', 'info');
}

/* =========================
   COMANDOS
========================= */
function sendCommand(deviceId, action) {
  if (!action) {
    showToast('Selecione um app', 'error');
    return;
  }

  const device = devices[deviceId];
  if (!device || !isOnline(device)) {
    showToast(`⚠️ ${deviceId} offline`, 'error');
    createCommandLog(deviceId, action, 'timeout', 'Dispositivo offline');
    return;
  }

  const commandId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  set(ref(db, `devices/${deviceId}/command`), {
    commandId,
    action,
    timestamp: Date.now()
  }).then(() => {
    showToast(`📤 Enviado para ${deviceId}`, 'info');
    createCommandLog(deviceId, action, 'pending', 'Aguardando...', commandId);
    
    const timeoutId = setTimeout(() => {
      updateCommandLog(commandId, 'timeout', 'Sem resposta (10s)');
      showToast(`⚠️ ${deviceId} não respondeu`, 'error');
      pendingCommands.delete(commandId);
    }, COMMAND_TIMEOUT);
    
    pendingCommands.set(commandId, timeoutId);
    
  }).catch(err => {
    showToast(`Erro: ${err.message}`, 'error');
    createCommandLog(deviceId, action, 'error', `Erro: ${err.message}`);
  });
}

function sendCommandToSelected() {
  const app = document.getElementById("deviceAppSelect").value;
  
  if (!app) {
    showToast('Selecione um app', 'error');
    return;
  }

  if (selectedDevices.size === 0) {
    showToast('Selecione dispositivos', 'error');
    return;
  }

  let sentCount = 0;
  let offlineCount = 0;
  
  selectedDevices.forEach(id => {
    const device = devices[id];
    if (device && isOnline(device)) {
      sendCommand(id, app);
      sentCount++;
    } else {
      offlineCount++;
    }
  });

  if (offlineCount > 0) {
    showToast(`⚠️ ${offlineCount} offline ignorados`, 'warning');
  }
}

function processCommandResponse(deviceId, response) {
  const { commandId, status, message } = response;
  
  if (!commandId || !pendingCommands.has(commandId)) {
    return;
  }
  
  clearTimeout(pendingCommands.get(commandId));
  pendingCommands.delete(commandId);
  
  updateCommandLog(commandId, status, message || '');
  
  if (status === 'success') {
    showToast(`✅ ${deviceId}: ${message}`, 'success');
  } else if (status === 'error') {
    showToast(`❌ ${deviceId}: ${message}`, 'error');
  }
  
  remove(ref(db, `devices/${deviceId}/commandResponse`));
  
  update(ref(db, `devices/${deviceId}`), {
    lastUpdate: Date.now()
  });
}

/* =========================
   LOGS
========================= */
function createCommandLog(deviceId, action, status, message, commandId = null) {
  const logId = commandId || (Date.now() + '_' + Math.random().toString(36).substr(2, 9));
  const appInfo = getAppInfo(action);
  
  const logData = {
    logId,
    deviceId,
    action,
    appName: appInfo.name,
    appIcon: appInfo.icon,
    status,
    message,
    timestamp: Date.now()
  };
  
  set(ref(db, `commandLogs/${logId}`), logData);
}

function updateCommandLog(commandId, status, message) {
  update(ref(db, `commandLogs/${commandId}`), {
    status,
    message,
    updatedAt: Date.now()
  });
}

function clearLogs() {
  if (!confirm('Limpar todos os logs?')) return;
  
  remove(ref(db, 'commandLogs')).then(() => {
    commandLogs = {};
    unreadLogsCount = 0;
    updateUnreadBadge();
    renderLogs();
    showToast('Logs limpos', 'success');
  });
}

function openLogsModal() {
  document.getElementById('logsModal').classList.add('active');
  unreadLogsCount = 0;
  updateUnreadBadge();
  renderLogs();
}

function closeLogsModal() {
  document.getElementById('logsModal').classList.remove('active');
}

function updateUnreadBadge() {
  const badge = document.getElementById('unreadLogsCount');
  if (unreadLogsCount > 0) {
    badge.textContent = unreadLogsCount > 99 ? '99+' : unreadLogsCount;
    badge.style.display = 'block';
  } else {
    badge.style.display = 'none';
  }
}

function updateLogFilters() {
  const deviceFilter = document.getElementById('logFilterDevice');
  const currentValue = deviceFilter.value;
  
  deviceFilter.innerHTML = '<option value="all">Todos os Dispositivos</option>';
  
  Object.keys(devices).forEach(deviceId => {
    const option = document.createElement('option');
    option.value = deviceId;
    option.textContent = deviceId;
    deviceFilter.appendChild(option);
  });
  
  deviceFilter.value = currentValue;
}

function renderLogs() {
  const container = document.getElementById('logsContainer');
  const statusFilter = document.getElementById('logFilterStatus').value;
  const deviceFilter = document.getElementById('logFilterDevice').value;
  
  const logsArray = Object.values(commandLogs);
  
  if (logsArray.length === 0) {
    container.innerHTML = `
      <div class="logs-empty">
        <div class="logs-empty-icon">📋</div>
        <div>Nenhum comando executado</div>
      </div>
    `;
    return;
  }
  
  const filteredLogs = logsArray.filter(log => {
    if (statusFilter !== 'all' && log.status !== statusFilter) return false;
    if (deviceFilter !== 'all' && log.deviceId !== deviceFilter) return false;
    return true;
  });
  
  if (filteredLogs.length === 0) {
    container.innerHTML = `<div class="logs-empty"><div class="logs-empty-icon">🔍</div><div>Nenhum log encontrado</div></div>`;
    return;
  }
  
  filteredLogs.sort((a, b) => b.timestamp - a.timestamp);
  
  container.innerHTML = filteredLogs.map(log => {
    const statusIcons = { success: '✅', error: '❌', pending: '⏳', timeout: '⚠️' };
    const statusTexts = { success: 'Sucesso', error: 'Erro', pending: 'Aguardando', timeout: 'Timeout' };
    
    return `
      <div class="log-item log-${log.status}">
        <div class="log-header">
          <span class="log-device">${log.appIcon} ${log.deviceId}</span>
          <span class="log-status status-${log.status}">
            ${statusIcons[log.status]} ${statusTexts[log.status]}
          </span>
        </div>
        <div class="log-details">
          <div class="log-detail-row"><span>App:</span><span>${log.appName}</span></div>
          <div class="log-detail-row"><span>Mensagem:</span><span>${log.message}</span></div>
        </div>
        <div class="log-time">${formatFullTime(log.timestamp)}</div>
      </div>
    `;
  }).join('');
}

/* =========================
   GROUPS
========================= */
function renderGroups() {
  const grid = document.getElementById("groupsGrid");

  if (Object.keys(groups).length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div style="font-size: 48px; margin-bottom: 16px;">👥</div>
        <div>Nenhum grupo criado</div>
      </div>
    `;
    return;
  }

  grid.innerHTML = Object.entries(groups).map(([id, g]) => {
    const deviceCount = g.devices?.length || 0;
    const appInfo = getAppInfo(g.defaultApp);

    return `
      <div class="group-card" onclick="openEditGroupModal('${id}')">
        <div class="group-header">
          <span class="group-name">${appInfo.icon} ${g.name}</span>
          <span class="group-count">${deviceCount} device${deviceCount !== 1 ? 's' : ''}</span>
        </div>
        ${g.defaultApp ? `<div class="group-app"><span>App Padrão:</span><strong>${appInfo.name}</strong></div>` : ''}
        <div class="group-devices">
          ${deviceCount > 0 ? (g.devices || []).map(d => `<span class="device-tag">${d}</span>`).join('') : '<span style="color: var(--text-muted);">Nenhum dispositivo</span>'}
        </div>
        <div class="group-actions" onclick="event.stopPropagation()">
          <button class="btn btn-primary btn-small" onclick="executeGroup('${id}')" ${!g.defaultApp || deviceCount === 0 ? 'disabled' : ''}>🚀 Executar</button>
          <button class="btn btn-secondary btn-small" onclick="openEditGroupModal('${id}')">✏️ Editar</button>
        </div>
      </div>
    `;
  }).join("");
}

function openCreateGroupModal() {
  currentEditingGroupId = null;
  document.getElementById('modalTitle').textContent = 'Criar Novo Grupo';
  document.getElementById('groupName').value = '';
  document.getElementById('groupApp').value = '';
  document.getElementById('btnDeleteGroup').style.display = 'none';
  updateDevicesChecklistInModal();
  document.getElementById('groupModal').classList.add('active');
}

function openEditGroupModal(groupId) {
  currentEditingGroupId = groupId;
  const group = groups[groupId];
  if (!group) return;
  document.getElementById('modalTitle').textContent = 'Editar Grupo';
  document.getElementById('groupName').value = group.name;
  document.getElementById('groupApp').value = group.defaultApp || '';
  document.getElementById('btnDeleteGroup').style.display = 'block';
  updateDevicesChecklistInModal(group.devices);
  document.getElementById('groupModal').classList.add('active');
}

function closeGroupModal() {
  document.getElementById('groupModal').classList.remove('active');
  currentEditingGroupId = null;
}

function updateDevicesChecklistInModal(selectedDeviceIds = []) {
  const container = document.getElementById('devicesList');
  
  if (Object.keys(devices).length === 0) {
    container.innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">Nenhum dispositivo</div>';
    return;
  }

  container.innerHTML = Object.entries(devices)
    .sort(([idA], [idB]) => idA.localeCompare(idB))
    .map(([id, d]) => {
      const isChecked = selectedDeviceIds.includes(id);
      const online = isOnline(d);
      
      return `
        <div class="device-checkbox-item">
          <input type="checkbox" id="device-${id}" value="${id}" ${isChecked ? 'checked' : ''}>
          <label class="device-checkbox-label" for="device-${id}">${id} ${online ? '🟢' : '🔴'}</label>
        </div>
      `;
    }).join('');
}

function saveGroup() {
  const name = document.getElementById('groupName').value.trim();
  const defaultApp = document.getElementById('groupApp').value;
  
  const selectedDevicesList = Array.from(
    document.querySelectorAll('#devicesList input[type="checkbox"]:checked')
  ).map(input => input.value);

  if (!name) {
    showToast('Digite um nome', 'error');
    return;
  }

  if (selectedDevicesList.length === 0) {
    showToast('Selecione dispositivos', 'error');
    return;
  }

  const groupData = {
    name,
    defaultApp: defaultApp || null,
    devices: selectedDevicesList,
    createdAt: currentEditingGroupId ? groups[currentEditingGroupId].createdAt : Date.now(),
    updatedAt: Date.now()
  };

  if (currentEditingGroupId) {
    update(ref(db, `groups/${currentEditingGroupId}`), groupData)
      .then(() => {
        showToast('Grupo atualizado!', 'success');
        closeGroupModal();
      })
      .catch(err => showToast(`Erro: ${err.message}`, 'error'));
  } else {
    const newGroupRef = push(ref(db, 'groups'));
    set(newGroupRef, groupData)
      .then(() => {
        showToast('Grupo criado!', 'success');
        closeGroupModal();
      })
      .catch(err => showToast(`Erro: ${err.message}`, 'error'));
  }
}

function deleteGroup() {
  if (!currentEditingGroupId) return;
  const groupName = groups[currentEditingGroupId]?.name || 'este grupo';
  if (!confirm(`Deletar "${groupName}"?`)) return;

  remove(ref(db, `groups/${currentEditingGroupId}`))
    .then(() => {
      showToast('Grupo deletado!', 'success');
      closeGroupModal();
    })
    .catch(err => showToast(`Erro: ${err.message}`, 'error'));
}

function executeGroup(groupId) {
  const group = groups[groupId];
  if (!group || !group.defaultApp || !group.devices || group.devices.length === 0) {
    showToast('Grupo inválido', 'error');
    return;
  }

  let sentCount = 0;
  let offlineCount = 0;

  group.devices.forEach(deviceId => {
    const device = devices[deviceId];
    if (device && isOnline(device)) {
      sendCommand(deviceId, group.defaultApp);
      sentCount++;
    } else {
      offlineCount++;
    }
  });

  if (sentCount > 0) {
    showToast(`📤 ${sentCount} enviados`, 'success');
  }
  
  if (offlineCount > 0) {
    showToast(`⚠️ ${offlineCount} offline`, 'warning');
  }
}

/* =========================
   UTILIDADES
========================= */
function updateStats() {
  const totalDevices = Object.keys(devices).length;
  const onlineDevices = Object.values(devices).filter(isOnline).length;
  const totalGroups = Object.keys(groups).length;
  document.getElementById("totalDevices").textContent = totalDevices;
  document.getElementById("onlineDevices").textContent = onlineDevices;
  document.getElementById("totalGroups").textContent = totalGroups;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  if (diff < 60000) return 'Agora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m atrás`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h atrás`;
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatFullTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-message">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastSlideIn 0.3s ease reverse';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* =========================
   EXPORTAR
========================= */
window.switchTab = switchTab;
window.toggleDevice = toggleDevice;
window.selectAllDevices = selectAllDevices;
window.deselectAllDevices = deselectAllDevices;
window.sendCommand = sendCommand;
window.sendCommandToSelected = sendCommandToSelected;
window.openCreateGroupModal = openCreateGroupModal;
window.openEditGroupModal = openEditGroupModal;
window.closeGroupModal = closeGroupModal;
window.saveGroup = saveGroup;
window.deleteGroup = deleteGroup;
window.executeGroup = executeGroup;
window.openLogsModal = openLogsModal;
window.closeLogsModal = closeLogsModal;
window.clearLogs = clearLogs;
window.openEditAppModal = openEditAppModal;