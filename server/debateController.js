const { loadAllAgents, generateWithGemini, getDramaMessage, generateEscalation, pickSmartSpeakerWithGemini } = require('./agentEngine');
const { getRandomTopic, getRandomHeadline } = require('./newsService');
const { saveMessage, loadRecentMessages } = require('./db');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const FORCE_SCRIPTED = process.env.FORCE_SCRIPTED === 'true';

const DELAY_MIN_MS = 3000;
const DELAY_MAX_MS = 11000;

// Wide random reaction emoji pool (not tied to any agent)
const REACTION_POOL = [
  '😂','💀','🤣','😤','🔥','💯','👀','😳','🤡','😬','☠️','💢',
  '🫡','🤨','😏','🙄','💪','🤦','🫠','😮','🤯','👏','💥','⚠️',
  '🥱','😑','💤','🧐','🤔','✅','❌','🫵','👎','👍','🤝','💔'
];

function randomDelay(chaosLevel) {
  const scale = 1 - (Math.max(1, Math.min(10, chaosLevel)) - 1) / 12;
  const min = DELAY_MIN_MS * scale;
  const max = DELAY_MAX_MS * scale;
  return min + Math.random() * (max - min);
}

class DebateController {
  constructor(io) {
    this.io = io;
    this.agents = loadAllAgents();
    this.agentKeys = Object.keys(this.agents);
    this.messageHistory = []; // { id, country, flag, ambassadorName, text }
    this.currentTopic = getRandomTopic();
    this.chaosLevel = 1;
    this.debateActive = false;
    this.timer = null;
    this.usedDramaIndices = {};
    this.lastSpeaker = null;
    this.recentSpeakers = [];
    this.typingCountry = null;
    this.agentMemory = {}; // Stores grudges

    for (const key of this.agentKeys) {
      this.usedDramaIndices[key] = new Set();
      this.agentMemory[key] = [];
    }

    this.initDB();
  }

  async initDB() {
    const historical = await loadRecentMessages(20);
    if (historical && historical.length > 0) {
      this.messageHistory = historical;
      this.lastSpeaker = historical[historical.length - 1].country;
      this.recentSpeakers = historical.slice(-5).map(m => m.country);
    }
  }

  pushMessageLog(msg) {
    this.messageHistory.push(msg);
    if (this.messageHistory.length > 20) this.messageHistory.shift();
    saveMessage(msg);
  }

  start() {
    if (this.debateActive) return;
    this.debateActive = true;
    console.log('[DebateController] Debate started. Topic:', this.currentTopic);
    this.io.emit('topic-update', { topic: this.currentTopic, chaosLevel: this.chaosLevel });
    this.scheduleNext();
  }

  stop() {
    this.debateActive = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.clearTyping();
  }

  async scheduleNext() {
    if (!this.debateActive) return;
    const delay = randomDelay(this.chaosLevel);

    // Show typing indicator partway through the delay
    const typingDelay = delay * (0.3 + Math.random() * 0.35);
    setTimeout(async () => {
      if (!this.debateActive) return;
      const nextSpeaker = await this.pickNextSpeaker(this.lastSpeaker);
      this.showTyping(nextSpeaker);
    }, typingDelay);

    this.timer = setTimeout(async () => {
      await this.executeTurn();
      this.scheduleNext();
    }, delay);
  }

  showTyping(country) {
    this.typingCountry = country;
    const agent = this.agents[country];
    this.io.volatile.emit('typing', {
      country,
      flag: agent ? agent.flag : '🌍',
      ambassadorName: agent ? agent.ambassadorName : country
    });
  }

  clearTyping() {
    if (this.typingCountry) {
      this.io.volatile.emit('typing-stop', { country: this.typingCountry });
      this.typingCountry = null;
    }
  }

  async pickNextSpeaker(respondingTo = null) {
    const useGemini = GEMINI_API_KEY && GEMINI_API_KEY !== 'your_key_here' && !FORCE_SCRIPTED;
    let candidates = [...this.agentKeys];
    
    // 30% chance or high chaos to use Gemini for smart speaking
    if (useGemini && (this.chaosLevel >= 6 || Math.random() < 0.3)) {
      const picked = await pickSmartSpeakerWithGemini(this.messageHistory, this.currentTopic, GEMINI_API_KEY, candidates);
      if (picked && picked !== this.lastSpeaker) return picked;
    }

    if (respondingTo) {
      const beefMap = {
        USA: ['China', 'Russia'], China: ['USA', 'India'], Russia: ['USA', 'UK'],
        India: ['Pakistan', 'China'], Pakistan: ['India'], Israel: ['Pakistan'],
        UK: ['Russia', 'France'], France: ['UK'], Germany: ['Russia'], Brazil: ['USA', 'UK']
      };
      const rivals = beefMap[respondingTo] || [];
      const rivalCandidates = candidates.filter(c => rivals.includes(c));
      if (rivalCandidates.length > 0 && Math.random() < 0.6) candidates = rivalCandidates;
    }
    candidates = candidates.filter(c => c !== this.lastSpeaker);
    const nonRecent = candidates.filter(c => !this.recentSpeakers.slice(-2).includes(c));
    if (nonRecent.length > 0) candidates = nonRecent;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // 30% chance: independent message (no reply). Otherwise weighted pick from history
  pickReplyTarget(speakerKey) {
    if (Math.random() < 0.30) return null; // independent message

    const eligible = this.messageHistory.filter(m => m.country !== speakerKey);
    if (eligible.length === 0) return null;

    // Weighted: recent messages more likely, older ones still possible
    const weights = eligible.map((_, i, arr) => 1 / Math.pow(arr.length - i, 0.65));
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * totalWeight;
    for (let i = 0; i < eligible.length; i++) {
      r -= weights[i];
      if (r <= 0) return eligible[i];
    }
    return eligible[eligible.length - 1];
  }

  async generateMessage(agentKey) {
    const agent = this.agents[agentKey];
    const useGemini = GEMINI_API_KEY && GEMINI_API_KEY !== 'your_key_here' && !FORCE_SCRIPTED;

    let text;
    let emotion = 'neutral';
    
    // Compile memory string
    const memoryStr = this.agentMemory[agentKey].length > 0 ? this.agentMemory[agentKey].join('\n') : null;

    if (useGemini) {
      const generated = await generateWithGemini(
        agent, this.messageHistory, this.currentTopic, GEMINI_API_KEY, this.agentKeys, memoryStr
      );
      if (generated) {
        text = generated.text;
        emotion = generated.emotion;
      } else {
        text = getDramaMessage(agent, this.usedDramaIndices[agentKey], this.currentTopic);
      }
    } else {
      text = getDramaMessage(agent, this.usedDramaIndices[agentKey], this.currentTopic);
    }
    return { text, emotion };
  }

  async executeTurn() {
    const speakerKey = await this.pickNextSpeaker(this.lastSpeaker);
    const agent = this.agents[speakerKey];

    this.clearTyping();

    const { text, emotion } = await this.generateMessage(speakerKey);
    const msgId = `msg_${Date.now()}_${speakerKey}`;
    const replyTarget = this.pickReplyTarget(speakerKey);

    // Build grudges safely
    if (replyTarget && this.agentMemory[replyTarget.country]) {
      this.agentMemory[replyTarget.country].push(`${speakerKey} recently attacked you saying: "${text}"`);
      if (this.agentMemory[replyTarget.country].length > 3) this.agentMemory[replyTarget.country].shift();
    }

    const message = {
      id: msgId,
      country: speakerKey,
      ambassadorName: agent.ambassadorName,
      flag: agent.flag,
      text,
      emotion,
      timestamp: Date.now(),
      chaosLevel: this.chaosLevel,
      replyTo: replyTarget ? {
        id: replyTarget.id,
        country: replyTarget.country,
        flag: replyTarget.flag,
        text: replyTarget.text.substring(0, 80) + (replyTarget.text.length > 80 ? '…' : '')
      } : null
    };

    this.pushMessageLog(message);

    this.lastSpeaker = speakerKey;
    this.recentSpeakers.push(speakerKey);
    if (this.recentSpeakers.length > 5) this.recentSpeakers.shift();

    this.io.emit('message', message);

    if (Math.random() < 0.15) {
      this.chaosLevel = Math.min(10, this.chaosLevel + 1);
      this.io.volatile.emit('chaos-update', { chaosLevel: this.chaosLevel });
    }

    setTimeout(() => this.triggerReactions(msgId, speakerKey), 600 + Math.random() * 700);
    return message;
  }

  triggerReactions(msgId, speakerKey) {
    const others = this.agentKeys.filter(k => k !== speakerKey);
    const shuffled = others.sort(() => Math.random() - 0.5);
    // 1–3 reactors (more random)
    const reactorCount = 1 + Math.floor(Math.random() * 3);
    const reactors = shuffled.slice(0, reactorCount);

    reactors.forEach((reactorKey, i) => {
      setTimeout(() => {
        const agent = this.agents[reactorKey];

        // 60% chance: agent's own emoji, 40% random global pool
        const useOwn = Math.random() < 0.6;
        const emoji = useOwn
          ? agent.emojis[Math.floor(Math.random() * agent.emojis.length)]
          : REACTION_POOL[Math.floor(Math.random() * REACTION_POOL.length)];

        this.io.volatile.emit('reaction', {
          messageId: msgId,
          country: reactorKey,
          flag: agent.flag,
          emoji,
          timestamp: Date.now()
        });
      }, i * (200 + Math.random() * 400));
    });
  }

  async triggerAction(actionType, targetCountry = null) {
    this.chaosLevel = Math.min(10, this.chaosLevel + 2);
    this.io.volatile.emit('chaos-update', { chaosLevel: this.chaosLevel });

    switch (actionType) {
      case 'MIC_LEAK': {
        const agentKey = targetCountry || this.agentKeys[Math.floor(Math.random() * this.agentKeys.length)];
        const agent = this.agents[agentKey];
        const text = generateEscalation(agent, 'MIC_LEAK');
        const msgId = `esc_${Date.now()}`;
        this.io.emit('escalation', { type: 'MIC_LEAK', label: '🎙️ MIC LEAK', country: agentKey, flag: agent.flag, ambassadorName: agent.ambassadorName, text, msgId, timestamp: Date.now() });
        this.messageHistory.push({ id: msgId, country: agentKey, flag: agent.flag, ambassadorName: agent.ambassadorName, text: `[MIC LEAK] ${text}` });
        if (this.messageHistory.length > 20) this.messageHistory.shift();
        setTimeout(() => this.triggerChainReaction(agentKey, 4), 1800);
        break;
      }
      case 'BREAKING_NEWS': {
        const headline = getRandomHeadline(null);
        this.io.emit('escalation', { type: 'BREAKING_NEWS', label: '📺 BREAKING NEWS', text: headline, timestamp: Date.now() });
        this.currentTopic = `Responding to: "${headline}"`;
        this.io.emit('topic-update', { topic: this.currentTopic, chaosLevel: this.chaosLevel });
        this.messageHistory = [];
        setTimeout(() => this.triggerChainReaction(null, 3), 1200);
        break;
      }
      case 'HOT_MIC': {
        const agents = [...this.agentKeys].sort(() => Math.random() - 0.5).slice(0, 2);
        const agent1 = this.agents[agents[0]];
        const text1 = generateEscalation(agent1, 'HOT_MIC');
        const escId = `esc_${Date.now()}`;
        this.io.emit('escalation', { type: 'HOT_MIC', label: '🔥 HOT MIC CAUGHT', country: agents[0], flag: agent1.flag, ambassadorName: agent1.ambassadorName, text: text1, msgId: escId, target: agents[1], timestamp: Date.now() });
        this.pushMessageLog({ id: escId, country: agents[0], flag: agent1.flag, ambassadorName: agent1.ambassadorName, text: text1, timestamp: Date.now() });
        setTimeout(async () => {
          const agent2 = this.agents[agents[1]];
          const { text: reactText, emotion } = await this.generateMessage(agents[1]);
          const replyMsgId = `msg_${Date.now()}`;
          this.io.emit('message', { id: replyMsgId, country: agents[1], ambassadorName: agent2.ambassadorName, flag: agent2.flag, text: `❗ ${reactText}`, emotion, timestamp: Date.now(), replyTo: { id: escId, country: agents[0], flag: agent1.flag, text: text1.substring(0, 80) }, isFired: true });
          this.pushMessageLog({ id: replyMsgId, country: agents[1], flag: agent2.flag, ambassadorName: agent2.ambassadorName, text: reactText, timestamp: Date.now() });
        }, 2200);
        break;
      }
      case 'UN_VOTE': {
        this.io.emit('escalation', { type: 'UN_VOTE', label: '🗳️ UN EMERGENCY VOTE CALLED', text: `All delegates must now vote on: "${this.currentTopic}"`, timestamp: Date.now() });
        let delay = 1000;
        for (const agentKey of this.agentKeys) {
          setTimeout(async () => {
            const agent = this.agents[agentKey];
            const vote = Math.random() < 0.5 ? '✅ IN FAVOUR' : '❌ AGAINST';
            const { text, emotion } = await this.generateMessage(agentKey);
            this.io.emit('vote', { country: agentKey, flag: agent.flag, ambassadorName: agent.ambassadorName, vote, reason: text.substring(0, 100) + (text.length > 100 ? '...' : ''), timestamp: Date.now() });
          }, delay);
          delay += 500 + Math.random() * 400;
        }
        break;
      }
      case 'SANCTIONS_THREAT': {
        const sender = this.agentKeys[Math.floor(Math.random() * this.agentKeys.length)];
        const target = this.agentKeys.filter(k => k !== sender)[Math.floor(Math.random() * (this.agentKeys.length - 1))];
        const senderAgent = this.agents[sender];
        const targetAgent = this.agents[target];
        const threatText = `${senderAgent.flag} ${sender} has formally threatened ${targetAgent.flag} ${target} with economic sanctions unless immediate action is taken.`;
        const escId = `esc_${Date.now()}`;
        this.io.emit('escalation', { type: 'SANCTIONS_THREAT', label: '💰 SANCTIONS THREAT', country: sender, flag: senderAgent.flag, ambassadorName: senderAgent.ambassadorName, text: threatText, msgId: escId, target, timestamp: Date.now() });
        this.pushMessageLog({ id: escId, country: sender, flag: senderAgent.flag, ambassadorName: senderAgent.ambassadorName, text: threatText, timestamp: Date.now() });
        this.chaosLevel = Math.min(10, this.chaosLevel + 3);
        this.io.volatile.emit('chaos-update', { chaosLevel: this.chaosLevel });
        setTimeout(async () => {
          const { text, emotion } = await this.generateMessage(target);
          const replyId = `msg_${Date.now()}`;
          this.io.emit('message', { id: replyId, country: target, ambassadorName: targetAgent.ambassadorName, flag: targetAgent.flag, text: `⚡ ${text}`, emotion, timestamp: Date.now(), replyTo: { id: escId, country: sender, flag: senderAgent.flag, text: threatText.substring(0, 80) }, isFired: true });
          this.pushMessageLog({ id: replyId, country: target, flag: targetAgent.flag, ambassadorName: targetAgent.ambassadorName, text, timestamp: Date.now() });
        }, 2000);
        break;
      }
    }
  }

  async triggerChainReaction(ignoredKey, count) {
    let candidates = ignoredKey ? this.agentKeys.filter(k => k !== ignoredKey) : [...this.agentKeys];
    candidates = candidates.sort(() => Math.random() - 0.5).slice(0, count);
    let delay = 0;
    for (const agentKey of candidates) {
      const d = delay;
      setTimeout(async () => {
        const agent = this.agents[agentKey];
        this.showTyping(agentKey);
        await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
        this.clearTyping();
        const { text, emotion } = await this.generateMessage(agentKey);
        const rid = `msg_${Date.now()}_${agentKey}`;
        const replyTarget = this.pickReplyTarget(agentKey);
        this.io.emit('message', {
          id: rid, country: agentKey, ambassadorName: agent.ambassadorName, flag: agent.flag,
          text, emotion, timestamp: Date.now(), isFired: true,
          replyTo: replyTarget ? { id: replyTarget.id, country: replyTarget.country, flag: replyTarget.flag, text: replyTarget.text.substring(0, 80) } : null
        });
        this.pushMessageLog({ id: rid, country: agentKey, flag: agent.flag, ambassadorName: agent.ambassadorName, text, timestamp: Date.now() });
        setTimeout(() => this.triggerReactions(rid, agentKey), 700);
      }, d);
      delay += 1600 + Math.random() * 800;
    }
  }

  changeTopic(newTopic) {
    this.currentTopic = newTopic;
    this.chaosLevel = Math.max(1, this.chaosLevel - 2);
    this.messageHistory = [];
    this.io.emit('topic-update', { topic: this.currentTopic, chaosLevel: this.chaosLevel });
  }

  getState() {
    return {
      topic: this.currentTopic,
      chaosLevel: this.chaosLevel,
      agents: Object.entries(this.agents).map(([k, v]) => ({ country: k, flag: v.flag, ambassadorName: v.ambassadorName, emojis: v.emojis })),
      active: this.debateActive,
      messageHistory: this.messageHistory
    };
  }
}

module.exports = DebateController;
