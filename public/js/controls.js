// controls.js — Action buttons and cooldown management

const COOLDOWNS = {
  MIC_LEAK: 15000,
  BREAKING_NEWS: 20000,
  HOT_MIC: 18000,
  UN_VOTE: 30000,
  SANCTIONS_THREAT: 12000
};

const cooldownState = {};
let escalationCount = 0;

function initControls(socket) {
  const buttons = document.querySelectorAll('.action-btn[data-action]');
  
  buttons.forEach(btn => {
    const action = btn.dataset.action;
    cooldownState[action] = false;
    
    btn.addEventListener('click', () => {
      if (cooldownState[action]) return;
      
      // Fire action
      socket.emit('action', { type: action });
      
      // Start cooldown
      startCooldown(btn, action);
      
      // Track stat
      escalationCount++;
      const statEl = document.getElementById('statEscalations');
      if (statEl) statEl.textContent = escalationCount;
    });
  });
  
  // New topic button
  const newTopicBtn = document.getElementById('newTopicBtn');
  if (newTopicBtn) {
    newTopicBtn.addEventListener('click', () => {
      socket.emit('change-topic', {});
      newTopicBtn.textContent = '⏳ CHANGING...';
      newTopicBtn.disabled = true;
      setTimeout(() => {
        newTopicBtn.textContent = '🔀 NEW TOPIC';
        newTopicBtn.disabled = false;
      }, 3000);
    });
  }
  
  // Escalation overlay click to dismiss
  const overlay = document.getElementById('escalationOverlay');
  if (overlay) {
    overlay.addEventListener('click', hideEscalationOverlay);
    // Auto dismiss after 4s
  }
  
  // Vote close
  const voteClose = document.getElementById('voteCloseBtn');
  if (voteClose) {
    voteClose.addEventListener('click', hideVoteOverlay);
  }
}

function startCooldown(btn, action) {
  const cooldownMs = COOLDOWNS[action] || 15000;
  cooldownState[action] = true;
  btn.classList.add('disabled');
  
  const bar = btn.querySelector('.cooldown-bar');
  if (bar) {
    bar.style.width = '100%';
    bar.style.transition = `width ${cooldownMs}ms linear`;
    // Trigger reflow
    bar.offsetWidth;
    bar.style.width = '0%';
  }
  
  setTimeout(() => {
    cooldownState[action] = false;
    btn.classList.remove('disabled');
    if (bar) {
      bar.style.transition = '';
      bar.style.width = '0%';
    }
  }, cooldownMs);
}

// Escalation overlay
function showEscalationOverlay(esc) {
  const overlay = document.getElementById('escalationOverlay');
  const label = document.getElementById('escalationLabel');
  const flag = document.getElementById('escalationFlag');
  const name = document.getElementById('escalationName');
  const text = document.getElementById('escalationText');
  
  if (!overlay) return;
  
  label.textContent = esc.label || '⚡ ESCALATION';
  flag.textContent = esc.flag || '🌍';
  name.textContent = esc.ambassadorName || '';
  text.textContent = esc.text || '';
  
  overlay.style.display = 'flex';
  
  // Auto-dismiss
  setTimeout(() => {
    hideEscalationOverlay();
  }, 5000);
}

function hideEscalationOverlay() {
  const overlay = document.getElementById('escalationOverlay');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.3s';
    setTimeout(() => {
      overlay.style.display = 'none';
      overlay.style.opacity = '1';
      overlay.style.transition = '';
    }, 300);
  }
}

function showVoteOverlay(topic) {
  const overlay = document.getElementById('voteOverlay');
  const topicEl = document.getElementById('voteTopic');
  const rows = document.getElementById('voteRows');
  
  if (!overlay) return;
  
  if (topicEl) topicEl.textContent = topic;
  if (rows) rows.innerHTML = '';
  
  overlay.style.display = 'flex';
}

function hideVoteOverlay() {
  const overlay = document.getElementById('voteOverlay');
  if (overlay) overlay.style.display = 'none';
}

// Chaos level UI update
function updateChaosUI(level) {
  const fill = document.getElementById('chaosFill');
  const value = document.getElementById('chaosValue');
  const emoji = document.getElementById('chaosEmoji');
  
  if (fill) fill.style.width = `${level * 10}%`;
  if (value) value.textContent = level;
  
  const chaosEmojis = ['😐','😑','🤨','😬','😤','😠','🤬','💢','🔥','💥'];
  if (emoji) emoji.textContent = chaosEmojis[Math.min(level - 1, 9)];
  
  // Body class for high chaos effects
  document.body.classList.toggle('chaos-high', level >= 7);
  if (level >= 10) {
    document.body.classList.add('chaos-max');
    setTimeout(() => document.body.classList.remove('chaos-max'), 600);
  }
}

// Viewer count fake simulation
function startViewerCounter() {
  const el = document.getElementById('viewerCount');
  if (!el) return;
  
  let count = 12847;
  setInterval(() => {
    const delta = Math.floor(Math.random() * 80) - 30;
    count = Math.max(9000, count + delta);
    el.textContent = count.toLocaleString();
  }, 4000);
}

window.ControlsModule = {
  initControls,
  showEscalationOverlay,
  hideEscalationOverlay,
  showVoteOverlay,
  hideVoteOverlay,
  updateChaosUI,
  startViewerCounter
};
