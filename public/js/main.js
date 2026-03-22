// main.js — Socket.IO client bootstrap and event handling

(function () {
  const socket = io();
  let currentTopic = '';

  // ---- Init ----
  socket.on('connect', () => {
    console.log('[DividedNations] Connected to chamber:', socket.id);
  });

  socket.on('disconnect', () => {
    console.warn('[DividedNations] Disconnected from chamber');
  });

  // Initial state from server
  socket.on('init', (state) => {
    console.log('[DividedNations] Init state received', state);
    
    // Populate delegates sidebar
    if (state.agents) {
      ChatModule.populateDelegates(state.agents);
    }
    
    // Set topic
    if (state.topic) {
      currentTopic = state.topic;
      const topicEl = document.getElementById('topicText');
      if (topicEl) topicEl.textContent = state.topic;
    }
    
    // Set chaos level
    if (state.chaosLevel) {
      ControlsModule.updateChaosUI(state.chaosLevel);
    }
  });

  // Headlines (ticker)
  socket.on('headlines', (data) => {
    if (data.headlines && data.headlines.length) {
      TickerModule.initTicker(data.headlines);
    }
  });

  // Topic update
  socket.on('topic-update', (data) => {
    currentTopic = data.topic;
    const topicEl = document.getElementById('topicText');
    if (topicEl) {
      topicEl.style.opacity = '0';
      setTimeout(() => {
        topicEl.textContent = data.topic;
        topicEl.style.opacity = '1';
        topicEl.style.transition = 'opacity 0.4s';
      }, 200);
    }
    if (data.chaosLevel !== undefined) {
      ControlsModule.updateChaosUI(data.chaosLevel);
    }
  });

  // Chaos level update
  socket.on('chaos-update', (data) => {
    ControlsModule.updateChaosUI(data.chaosLevel);
  });

  // New message from a bot
  socket.on('message', (msg) => {
    ChatModule.renderMessage(msg);
  });

  // Emoji reaction to a message
  socket.on('reaction', (reaction) => {
    ChatModule.renderReaction(reaction);
  });

  // Typing indicator
  socket.on('typing', (data) => {
    ChatModule.showTypingIndicator(data);
    ChatModule.updateDelegateTyping(data.country, true);
    ChatModule.setDelegateStatus(data.country, 'typing...');
  });

  socket.on('typing-stop', (data) => {
    ChatModule.removeTypingIndicator();
    ChatModule.updateDelegateTyping(data.country, false);
    ChatModule.setDelegateStatus(data.country, 'Online');
  });

  // Escalation event (mic leak, breaking news, hot mic, sanctions)
  socket.on('escalation', (esc) => {
    // Show dramatic overlay
    ControlsModule.showEscalationOverlay(esc);
    
    // Also render as inline message if it has text and a speaker
    if (esc.flag) {
      ChatModule.renderEscalationMessage(esc);
      
      // Render the escalation text as a special message card
      if (esc.text && esc.ambassadorName) {
        ChatModule.renderMessage({
          id: `esc_${Date.now()}`,
          country: esc.country || '🌍',
          ambassadorName: esc.ambassadorName,
          flag: esc.flag,
          text: esc.text,
          timestamp: Date.now(),
          isEscalation: true,
          isFired: true
        });
      }
    } else if (esc.text && esc.type === 'BREAKING_NEWS') {
      // Breaking news — add to ticker
      TickerModule.addHeadline('🚨 ' + esc.text);
      ChatModule.renderEscalationMessage(esc);
    }
    
    // Update stats
    const statEl = document.getElementById('statEscalations');
    if (statEl) statEl.textContent = parseInt(statEl.textContent || 0) + 1;
  });

  // UN Vote events
  socket.on('vote', (vote) => {
    // Open vote panel on first vote
    const overlay = document.getElementById('voteOverlay');
    if (overlay && overlay.style.display === 'none') {
      ControlsModule.showVoteOverlay(currentTopic);
    }
    ChatModule.renderVoteRow(vote);
  });

  // Initialize controls with socket reference
  ControlsModule.initControls(socket);
  
  // Start fake viewer counter
  ControlsModule.startViewerCounter();

})();
