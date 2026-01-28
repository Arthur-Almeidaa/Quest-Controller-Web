import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update, remove, push } 
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
let selectedDevices = new Set();
let currentEditingGroupId = null;
let unreadLogsCount = 0;
let pendingCommands = new Map();

/* =========================
   CONSTANTES
========================= */
const COMMAND_TIMEOUT = 10000;
const APPS_INFO = {
  beatsaber:   { name: 'Beat Saber', icon: '🎵' },
  blaston:     { name: 'Blaston', icon: '🔫' },
  hyperdash:   { name: 'Hyper Dash', icon: '⚡' },
  creed:       { name: 'Creed', icon: '🥊' },
  spatialops:  { name: 'Spatial Ops', icon: '🎯' },
  homeinvasion:{ name: 'Home Invasion', icon: '🏠' }
};

/* =========================
   FIREBASE LISTENERS
========================= */
onValue(ref(db, "devices"), snap => {
  const devicesData = snap.val() || {};
  
  // Processar respostas de comandos
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

/* =========================
   INICIALIZAÇÃO
========================= */
document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
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
  document.getElementById('btnCreateGroup').addEventListener('click', openCreateGroupModal);
  document.getElementById('btnCloseModal').addEventListener('click', closeGroupModal);
  document.getElementById('btnCancelModal').addEventListener('click', closeGroupModal);
  document.getElementById('btnSaveGroup').addEventListener('click', saveGroup);
  document.getElementById('btnDeleteGroup').addEventListener('click', deleteGroup);
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
        <div style="font-size: 48px; margin-bottom: 16px;"></div>
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
  return Object.entries(APPS_INFO).map(([id, info]) => `
    <button class="btn btn-primary btn-small" 
            onclick="sendCommand('${deviceId}','${id}')"
            ${!online ? 'disabled' : ''}>
      ${info.icon} ${info.name}
    </button>
  `).join('');
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
  showToast('Todos os dispositivos selecionados', 'success');
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
    showToast('Selecione um aplicativo', 'error');
    return;
  }

  const device = devices[deviceId];
  if (!device || !isOnline(device)) {
    showToast(`⚠️ ${deviceId} está offline ou desligado`, 'error');
    createCommandLog(deviceId, action, 'timeout', 'Dispositivo offline ou desligado');
    return;
  }

  const commandId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  
  set(ref(db, `devices/${deviceId}/command`), {
    commandId,
    action,
    timestamp: Date.now()
  }).then(() => {
    showToast(`📤 Comando enviado para ${deviceId}`, 'info');
    createCommandLog(deviceId, action, 'pending', 'Aguardando resposta...', commandId);
    
    const timeoutId = setTimeout(() => {
      updateCommandLog(commandId, 'timeout', 'Dispositivo não respondeu (timeout 10s)');
      showToast(`⚠️ ${deviceId} não respondeu ao comando`, 'error');
      pendingCommands.delete(commandId);
    }, COMMAND_TIMEOUT);
    
    pendingCommands.set(commandId, timeoutId);
    
  }).catch(err => {
    showToast(`Erro ao enviar comando: ${err.message}`, 'error');
    createCommandLog(deviceId, action, 'error', `Erro ao enviar: ${err.message}`);
  });
}

function sendCommandToSelected() {
  const app = document.getElementById("deviceAppSelect").value;
  
  if (!app) {
    showToast('Selecione um aplicativo', 'error');
    return;
  }

  if (selectedDevices.size === 0) {
    showToast('Selecione pelo menos um dispositivo', 'error');
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
    showToast(`⚠️ ${offlineCount} dispositivo(s) offline foram ignorados`, 'warning');
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
    showToast(`✅ ${deviceId}: ${message || 'App iniciado com sucesso'}`, 'success');
  } else if (status === 'error') {
    showToast(`❌ ${deviceId}: ${message || 'Erro ao iniciar app'}`, 'error');
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
  const appInfo = APPS_INFO[action] || { name: action, icon: '📱' };
  
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
  if (!confirm('Tem certeza que deseja limpar todos os logs?')) {
    return;
  }
  
  remove(ref(db, 'commandLogs')).then(() => {
    commandLogs = {};
    unreadLogsCount = 0;
    updateUnreadBadge();
    renderLogs();
    showToast('Logs limpos com sucesso', 'success');
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
        <div>Nenhum comando foi executado ainda</div>
        <div style="font-size: 14px; margin-top: 8px; opacity: 0.7;">
          Os logs de comandos aparecerão aqui
        </div>
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
    container.innerHTML = `
      <div class="logs-empty">
        <div class="logs-empty-icon">🔍</div>
        <div>Nenhum log encontrado com os filtros selecionados</div>
      </div>
    `;
    return;
  }
  
  filteredLogs.sort((a, b) => b.timestamp - a.timestamp);
  
  container.innerHTML = filteredLogs.map(log => {
    const statusIcons = {
      success: '✅',
      error: '❌',
      pending: '⏳',
      timeout: '⚠️'
    };
    
    const statusTexts = {
      success: 'Sucesso',
      error: 'Erro',
      pending: 'Aguardando',
      timeout: 'Timeout'
    };
    
    return `
      <div class="log-item log-${log.status}">
        <div class="log-header">
          <span class="log-device">${log.appIcon} ${log.deviceId}</span>
          <span class="log-status status-${log.status}">
            ${statusIcons[log.status]} ${statusTexts[log.status]}
          </span>
        </div>
        
        <div class="log-details">
          <div class="log-detail-row">
            <span>App:</span>
            <span>${log.appName}</span>
          </div>
          <div class="log-detail-row">
            <span>Mensagem:</span>
            <span>${log.message}</span>
          </div>
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
        <div style="font-size: 48px; margin-bottom: 16px;"></div>
        <div>Nenhum grupo criado</div>
        <div style="font-size: 14px; margin-top: 8px; opacity: 0.7;">Crie grupos para organizar seus dispositivos</div>
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

        ${g.defaultApp ? `
          <div class="group-app">
            <span>App Padrão:</span>
            <strong>${appInfo.name}</strong>
          </div>
        ` : ''}

        <div class="group-devices">
          ${deviceCount > 0 
            ? (g.devices || []).map(d => `<span class="device-tag">${d}</span>`).join('') 
            : '<span style="color: var(--text-muted);">Nenhum dispositivo neste grupo</span>'}
        </div>

        <div class="group-actions" onclick="event.stopPropagation()">
          <button class="btn btn-primary btn-small" 
                  onclick="executeGroup('${id}')"
                  ${!g.defaultApp || deviceCount === 0 ? 'disabled' : ''}>
            🚀 Executar Grupo
          </button>
          <button class="btn btn-secondary btn-small" onclick="openEditGroupModal('${id}')">
            ✏️ Editar
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function getAppInfo(appId) {
  return APPS_INFO[appId] || { name: 'Nenhum', icon: '📱' };
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
    container.innerHTML = '<div style="color: var(--text-muted); padding: 20px; text-align: center;">Nenhum dispositivo disponível</div>';
    return;
  }

  container.innerHTML = Object.entries(devices)
    .sort(([idA], [idB]) => idA.localeCompare(idB))
    .map(([id, d]) => {
      const isChecked = selectedDeviceIds.includes(id);
      const online = isOnline(d);
      
      return `
        <div class="device-checkbox-item">
          <input type="checkbox" 
                 id="device-${id}" 
                 value="${id}"
                 ${isChecked ? 'checked' : ''}>
          <label class="device-checkbox-label" for="device-${id}">
            ${id} ${online ? '🟢' : '🔴'}
          </label>
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
    showToast('Digite um nome para o grupo', 'error');
    return;
  }

  if (selectedDevicesList.length === 0) {
    showToast('Selecione pelo menos um dispositivo', 'error');
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
        showToast('Grupo atualizado com sucesso!', 'success');
        closeGroupModal();
      })
      .catch(err => {
        showToast(`Erro ao atualizar grupo: ${err.message}`, 'error');
      });
  } else {
    const newGroupRef = push(ref(db, 'groups'));
    set(newGroupRef, groupData)
      .then(() => {
        showToast('Grupo criado com sucesso!', 'success');
        closeGroupModal();
      })
      .catch(err => {
        showToast(`Erro ao criar grupo: ${err.message}`, 'error');
      });
  }
}

function deleteGroup() {
  if (!currentEditingGroupId) return;
  const groupName = groups[currentEditingGroupId]?.name || 'este grupo';
  if (!confirm(`Tem certeza que deseja deletar o grupo "${groupName}"?`)) return;

  remove(ref(db, `groups/${currentEditingGroupId}`))
    .then(() => {
      showToast('Grupo deletado com sucesso!', 'success');
      closeGroupModal();
    })
    .catch(err => {
      showToast(`Erro ao deletar grupo: ${err.message}`, 'error');
    });
}

function executeGroup(groupId) {
  const group = groups[groupId];
  if (!group || !group.defaultApp || !group.devices || group.devices.length === 0) {
    showToast('Grupo inválido ou sem dispositivos', 'error');
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
    showToast(`📤 Comando enviado para ${sentCount} dispositivo(s) do grupo "${group.name}"`, 'success');
  }
  
  if (offlineCount > 0) {
    showToast(`⚠️ ${offlineCount} dispositivo(s) offline foram ignorados`, 'warning');
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
  if (diff < 60000) return 'Agora mesmo';
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
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
  `;
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