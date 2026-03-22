// chat.js — WhatsApp-style message rendering, quoted replies, typing indicator

let messageCount = 0;
let reactionCount = 0;

function timeAgo(timestamp) {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Per-country accent color (WhatsApp uses different colors per sender in groups)
const COUNTRY_COLORS = {
  USA:     '#1a73e8',
  China:   '#e53935',
  Russia:  '#6a1b9a',
  India:   '#f4511e',
  UK:      '#0097a7',
  France:  '#7b1fa2',
  Germany: '#2e7d32',
  Brazil:  '#00897b',
  Pakistan:'#00695c',
  Israel:  '#c49000'
};
function getCountryColor(country) {
  return COUNTRY_COLORS[country] || '#667781';
}

// ── Message rendering ──────────────────────────────────────

function renderMessage(msg) {
  const container = document.getElementById('chatContainer');

  // Remove intro if present
  const intro = container.querySelector('.chat-intro');
  if (intro) intro.remove();

  const card = document.createElement('div');
  card.className = `message-card${msg.isFired ? ' fired' : ''}${msg.isEscalation ? ' escalation-msg' : ''}`;
  card.id = msg.id;
  card.dataset.country = msg.country;

  const color = getCountryColor(msg.country);

  // WhatsApp quoted reply block
  let quotedHtml = '';
  if (msg.replyTo) {
    const qColor = getCountryColor(msg.replyTo.country);
    quotedHtml = `
      <div class="quoted-reply" data-target="${escapeHtml(msg.replyTo.id || '')}" title="Jump to message">
        <div class="quoted-bar" style="background:${qColor}"></div>
        <div class="quoted-inner">
          <div class="quoted-country" style="color:${qColor}">${escapeHtml(msg.replyTo.flag || '')} ${escapeHtml(msg.replyTo.country)}</div>
          <div class="quoted-text">${escapeHtml(msg.replyTo.text || '')}</div>
        </div>
      </div>`;
  }

  let emotionEmoji = '';
  if (msg.emotion) {
    switch (msg.emotion) {
      case 'angry': emotionEmoji = '💢'; break;
      case 'smug': emotionEmoji = '😏'; break;
      case 'panicked': emotionEmoji = '😨'; break;
      case 'laughing': emotionEmoji = '😂'; break;
      case 'neutral': emotionEmoji = '😐'; break;
      default: emotionEmoji = '💬'; break;
    }
  }

  card.innerHTML = `
    <div class="msg-avatar-wrapper" style="position:relative; display:inline-block;">
      <div class="msg-avatar">${escapeHtml(msg.flag)}</div>
      ${emotionEmoji ? `<div class="msg-emotion" style="position:absolute; bottom:-4px; right:-4px; font-size:12px; background:#222b31; padding:2px; border-radius:50%; line-height:1;">${emotionEmoji}</div>` : ''}
    </div>
    <div class="msg-body${msg.isEscalation ? ' escalation-body' : ''}">
      <div class="msg-country-name" style="color:${color}">
        ${escapeHtml(msg.ambassadorName)}
        <span class="msg-country-tag">${escapeHtml(msg.country)}</span>
      </div>
      ${quotedHtml}
      <div class="msg-text">${escapeHtml(msg.text)}</div>
      <div class="msg-footer">
        <div class="msg-reactions" id="reactions_${msg.id}"></div>
        <span class="msg-time">${timeAgo(msg.timestamp)}</span>
      </div>
    </div>
  `;

  // Click quoted → scroll to original
  if (msg.replyTo) {
    const qBlock = card.querySelector('.quoted-reply');
    if (qBlock) {
      qBlock.addEventListener('click', () => {
        const targetEl = document.getElementById(msg.replyTo.id);
        if (targetEl) {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          targetEl.classList.add('highlight-flash');
          setTimeout(() => targetEl.classList.remove('highlight-flash'), 1600);
        }
      });
    }
  }

  container.appendChild(card);
  container.scrollTop = container.scrollHeight;

  messageCount++;
  const statEl = document.getElementById('statMessages');
  if (statEl) statEl.textContent = messageCount;

  updateDelegateSpeaking(msg.country);
  return card;
}

function renderReaction(reaction) {
  const reactionsEl = document.getElementById(`reactions_${reaction.messageId}`);
  if (!reactionsEl) return;

  // Skip duplicates from same country
  if (reactionsEl.querySelector(`[data-reactor="${reaction.country}"]`)) return;

  const chip = document.createElement('div');
  chip.className = 'reaction-chip';
  chip.dataset.reactor = reaction.country;
  chip.innerHTML = `${escapeHtml(reaction.flag)}${escapeHtml(reaction.emoji)}`;
  reactionsEl.appendChild(chip);

  reactionCount++;
  const statEl = document.getElementById('statReactions');
  if (statEl) statEl.textContent = reactionCount;
}

function renderEscalationMessage(esc) {
  const container = document.getElementById('chatContainer');
  const intro = container.querySelector('.chat-intro');
  if (intro) intro.remove();

  const divider = document.createElement('div');
  divider.className = 'escalation-divider';
  divider.textContent = esc.label || '⚡ ESCALATION';
  container.appendChild(divider);
  container.scrollTop = container.scrollHeight;
}

// ── Typing Indicator (DOM element is in HTML, just toggle it) ──

function showTypingIndicator(typing) {
  const el = document.getElementById('typingIndicator');
  const avatar = document.getElementById('typingAvatar');
  const name = document.getElementById('typingName');

  if (!el) return;

  if (avatar) avatar.textContent = typing.flag || '🌍';
  if (name) {
    const color = getCountryColor(typing.country);
    name.textContent = typing.ambassadorName || typing.country;
    name.style.color = color;
  }

  el.classList.add('visible');
}

function removeTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (el) el.classList.remove('visible');
}

// ── Delegates sidebar ──────────────────────────────────────

function updateDelegateSpeaking(country) {
  document.querySelectorAll('.delegate-card.speaking').forEach(el => el.classList.remove('speaking'));
  const card = document.querySelector(`.delegate-card[data-country="${country}"]`);
  if (card) {
    card.classList.add('speaking');
    setTimeout(() => card.classList.remove('speaking'), 4000);
  }
}

function updateDelegateTyping(country, isTyping) {
  const card = document.querySelector(`.delegate-card[data-country="${country}"]`);
  if (card) card.classList.toggle('typing', isTyping);
}

function setDelegateStatus(country, status) {
  const el = document.getElementById(`status_${country}`);
  if (el) el.textContent = status;
}

function populateDelegates(agents) {
  const list = document.getElementById('delegatesList');
  if (!list) return;
  list.innerHTML = '';

  for (const agent of agents) {
    const card = document.createElement('div');
    card.className = 'delegate-card';
    card.dataset.country = agent.country;
    const color = getCountryColor(agent.country);
    card.innerHTML = `
      <div class="delegate-flag">${escapeHtml(agent.flag)}</div>
      <div class="delegate-info">
        <div class="delegate-country" style="color:${color};font-weight:600;">${escapeHtml(agent.country)}</div>
        <div class="delegate-status" id="status_${agent.country}">Online</div>
      </div>
      <div class="delegate-indicator"></div>
    `;
    list.appendChild(card);
  }
}

// ── UN Vote row ────────────────────────────────────────────

function renderVoteRow(vote) {
  const rows = document.getElementById('voteRows');
  if (!rows) return;
  const isFavour = vote.vote.includes('FAVOUR');
  const row = document.createElement('div');
  row.className = 'vote-row';
  row.innerHTML = `
    <div class="vote-flag">${escapeHtml(vote.flag)}</div>
    <div style="flex:1;min-width:0;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px;">
        <span class="vote-country">${escapeHtml(vote.country)}</span>
        <span class="vote-result ${isFavour ? 'favour' : 'against'}">${escapeHtml(vote.vote)}</span>
      </div>
      <div class="vote-reason">${escapeHtml(vote.reason)}</div>
    </div>
  `;
  rows.appendChild(row);
}

window.ChatModule = {
  renderMessage, renderReaction, renderEscalationMessage,
  populateDelegates, renderVoteRow,
  showTypingIndicator, removeTypingIndicator,
  updateDelegateTyping, setDelegateStatus
};
