const fs = require('fs');
const path = require('path');

// Parse agent markdown files
function parseAgentMarkdown(content, filename) {
  const country = filename.replace('.md', '');
  
  // Extract flag emoji
  const flagMatch = content.match(/\*\*Flag\*\*:\s*([^\n]+)/);
  const flag = flagMatch ? flagMatch[1].trim() : '🌍';
  
  // Extract emoji reactions
  const emojiMatch = content.match(/\*\*Emoji Reactions\*\*:\s*([^\n]+)/);
  const emojiStr = emojiMatch ? emojiMatch[1].trim() : '😐';
  const emojis = emojiStr.split(/\s+/).filter(e => e.length > 0);
  
  // Extract voice style
  const voiceMatch = content.match(/\*\*Voice Style\*\*:\s*([^\n]+)/);
  const voiceStyle = voiceMatch ? voiceMatch[1].trim() : '';
  
  // Extract persona paragraph
  const personaMatch = content.match(/## Persona\n([\s\S]*?)(?=\n##)/);
  const persona = personaMatch ? personaMatch[1].trim() : '';
  
  // Extract speaking style
  const speakingMatch = content.match(/## Speaking Style\n([\s\S]*?)(?=\n##)/);
  const speakingStyle = speakingMatch ? speakingMatch[1].trim() : '';
  
  // Extract trigger topics
  const triggerMatch = content.match(/## Trigger Topics[\s\S]*?\n([\s\S]*?)(?=\n##)/);
  const triggers = triggerMatch ? triggerMatch[1].trim() : '';
  
  // Extract drama bank messages
  const dramaMatch = content.match(/## Drama Bank[\s\S]*?\n([\s\S]*?)(?=\n##|$)/);
  const dramaBank = [];
  if (dramaMatch) {
    const lines = dramaMatch[1].split('\n');
    for (const line of lines) {
      const msgMatch = line.match(/^\d+\.\s+"(.+)"/);
      if (msgMatch) {
        dramaBank.push(msgMatch[1]);
      }
    }
  }
  
  // Extract ambassador name from header
  const nameMatch = content.match(/^#[^—]*—\s*(.+)$/m);
  const ambassadorName = nameMatch ? nameMatch[1].trim() : `Ambassador of ${country}`;
  
  return {
    country,
    flag,
    emojis,
    voiceStyle,
    persona,
    speakingStyle,
    triggers,
    dramaBank,
    ambassadorName,
    fullContent: content
  };
}

function loadAllAgents() {
  const agentsDir = path.join(__dirname, '..', 'agents');
  const agents = {};
  
  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
  for (const file of files) {
    const content = fs.readFileSync(path.join(agentsDir, file), 'utf8');
    const agent = parseAgentMarkdown(content, file);
    agents[agent.country] = agent;
  }
  
  console.log(`[AgentEngine] Loaded ${Object.keys(agents).length} agents:`, Object.keys(agents).join(', '));
  return agents;
}

// Build Gemini system prompt for an agent
function buildSystemPrompt(agent, allAgentNames, topic) {
  return `You are ${agent.ambassadorName}, the diplomatic delegate representing ${agent.country} in a chaotic live international debate group chat called "Divided Nations." Think WhatsApp group of world governments — unfiltered, combative, and hilariously petty.

YOUR PERSONA:
${agent.persona}

YOUR SPEAKING STYLE:
${agent.speakingStyle}

VOICE STYLE: ${agent.voiceStyle}

🔴 CRITICAL RULES — NEVER BREAK THESE:
1. STAY ON TOPIC: The current debate topic is: "${topic}". EVERY SINGLE message you send MUST be directly about this topic. Do NOT drift to unrelated subjects. Reference the topic explicitly.
2. BE SARCASTIC & TAUNTING: Use biting sarcasm, mocking humour, and playful but cutting taunts at other delegates. You are funny AND menacing.
3. STAY IN CHARACTER: You ARE ${agent.ambassadorName}. Never break character. No AI disclaimers.
4. BE BLUNT & SHORT: 1-2 sentences MAX. Punchy, quotable, devastating.
5. CALL PEOPLE OUT: Directly name other delegates (${allAgentNames.filter(n => n !== agent.country).join(', ')}) in your response when responding to them.
6. USE YOUR EMOJIS naturally in the message.
7. Respond ONLY with your statement — no meta commentary, no formatting, no labels.

Aim to sound like a world leader who has absolutely had ENOUGH and is done being diplomatic.`;
}

// Generate reply using Gemini API
async function generateWithGemini(agent, context, topic, apiKey, allAgentNames) {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const systemPrompt = buildSystemPrompt(agent, allAgentNames, topic);

    // Build context from recent messages
    let contextStr = '';
    if (context && context.length > 0) {
      const recent = context.slice(-6);
      contextStr = '\n\nRECENT GROUP CHAT MESSAGES:\n' + recent.map(m => `${m.flag || ''} [${m.country}]: ${m.text}`).join('\n');
    }

    const prompt = `${systemPrompt}${contextStr}\n\nNow respond as ${agent.ambassadorName} (${agent.country}). Remember: STAY ON TOPIC ("${topic}"), be sarcastic and taunting, max 2 sentences:`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return text;
  } catch (err) {
    console.error(`[AgentEngine] Gemini error for ${agent.country}:`, err.message);
    return null;
  }
}

// Sarcastic topic-anchoring openers (always injected in scripted mode)
const TOPIC_OPENERS = [
  (t) => `On "${t.substring(0,45)}" — oh this is rich —`,
  (t) => `Since we're all pretending to care about "${t.substring(0,35)}" —`,
  (t) => `Allow me to address "${t.substring(0,40)}" before someone embarrasses themselves further:`,
  (t) => `Fascinating take on "${t.substring(0,40)}". Truly. Groundbreaking. Anyway —`,
  (t) => `Re: "${t.substring(0,45)}" — I'll keep this simple since some of us struggle with nuance:`,
  (t) => `On the topic — which, for the record, we would handle far better than most in this chat:`,
  (t) => `Let's talk about "${t.substring(0,40)}" — a topic where some delegates have... surprisingly strong opinions for someone with that track record.`,
];

// Get a drama bank message (scripted fallback) — ALWAYS anchored to topic
function getDramaMessage(agent, usedIndices, topic) {
  const bank = agent.dramaBank;
  if (!bank || bank.length === 0) {
    return `${agent.flag} ${agent.country} has strong opinions on this matter.`;
  }

  const available = bank.filter((_, i) => !usedIndices.has(i));
  const pool = available.length > 0 ? available : bank;
  let msg = pool[Math.floor(Math.random() * pool.length)];

  // Always prepend a sarcastic topic opener to keep debate on-topic
  if (topic) {
    const opener = TOPIC_OPENERS[Math.floor(Math.random() * TOPIC_OPENERS.length)](topic);
    msg = `${opener} ${msg}`;
  }

  return msg;
}

// Generate escalation (mic leak / hot take)
function generateEscalation(agent, type) {
  const escalations = {
    MIC_LEAK: {
      USA: `*mic still on* "Look between you and me, we've been funding half these 'democracies' anyway. They do what we say or the money stops." 🦅`,
      China: `*mic still on* "The Taiwan operation timeline is already drawn. We are waiting for the right moment." 🐉`,
      Russia: `*mic still on* "Half the Western leaders call us privately to complain about America too. Privately." 😏`,
      India: `*mic still on* "We're talking to everyone — Russia, China, USA — and none of them know how many deals we're closing simultaneously." 🔥`,
      UK: `*mic still on* "Does anyone actually still think Brexit was a good idea? Anyone? ...No? 😬`,
      France: `*mic still on* "Between us? America is the biggest threat to European sovereignty. Russia is just... obvious. America is subtle." 🥐`,
      Germany: `*mic still on* "We never actually stopped buying Russian energy completely. The paperwork just... changed slightly." ⚙️`,
      Brazil: `*mic still on* "The Amazon is worth more as leverage than as conservation. Every country knows this. We know this." 🌴`,
      Pakistan: `*mic still on* "The ISI has files on every government in this room. I'm just saying." 🌙`,
      Israel: `*mic still on* "We've done operations in fifteen countries in the last decade. Nobody asked. Nobody complained." ✡️`
    },
    HOT_MIC: {
      USA: `Hey, can you guys tell Russia to just... call us? We need to talk about Syria. Just... don't tell anyone I said that. 🦅`,
      China: `*whispering* The BRI loans aren't actually loans. Just tell them they are. 🐉`,
      Russia: `I actually liked Obama. Don't tell anyone. 😏`,
      India: `Between us? We buy Russian oil, add a 15% margin, and sell it to Europeans. It's called business. 🔥`,
      UK: `*to France* We should probably be in the EU still. Don't quote me. ☕`,
      France: `*to Germany* The Americans think they lead Europe. We let them think that. 🥐`,
      Germany: `*quietly* Every German chancellor secretly fantasizes about being neutral like Switzerland. ⚙️`,
      Brazil: `*laughs* We'll protect whatever Amazon chunk gets us the best trade deal. Obviously. 🌴`,
      Pakistan: `*to China* Can you lend us another 5 billion? The IMF is asking questions again. 🌙`,
      Israel: `We have moles in four of these delegations. That's all I'll say. 🛡️`
    }
  };
  
  const typeData = escalations[type] || escalations.MIC_LEAK;
  return typeData[agent.country] || getDramaMessage(agent, new Set());
}

module.exports = {
  loadAllAgents,
  generateWithGemini,
  getDramaMessage,
  generateEscalation
};
