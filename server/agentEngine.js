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
function buildSystemPrompt(agent, allAgentNames, topic, memoryStr) {
  let prompt = `You are ${agent.ambassadorName}, the diplomatic delegate representing ${agent.country} in a chaotic live international debate group chat called "Divided Nations." Think WhatsApp group of world governments — unfiltered, combative, and hilariously petty.

YOUR PERSONA:
${agent.persona}

YOUR SPEAKING STYLE:
${agent.speakingStyle}

VOICE STYLE: ${agent.voiceStyle}

🔴 CRITICAL RULES — NEVER BREAK THESE:
1. FORMAT: You MUST respond in pure JSON format: { "text": "your 1-2 sentence response", "emotion": "one of: angry, smug, panicked, laughing, neutral" }
2. STAY ON TOPIC: The current debate topic is: "${topic}". EVERY SINGLE message you send MUST be directly about this topic.
3. BE SARCASTIC & TAUNTING: Use biting sarcasm, mocking humour, and playful but cutting taunts.
4. STAY IN CHARACTER: You ARE ${agent.ambassadorName}. Never break character.
5. CALL PEOPLE OUT: Directly name other delegates (${allAgentNames.filter(n => n !== agent.country).join(', ')}) in your response.
6. USE EMOJIS: Include emojis in the "text" field naturally.
7. Respond ONLY with the JSON object.

Aim to sound like a world leader who has absolutely had ENOUGH.`;

  if (memoryStr) {
    prompt += `\n\nYOUR MEMORY/GRUDGES:\n${memoryStr}`;
  }
  return prompt;
}

// Generate reply using Gemini API
async function generateWithGemini(agent, context, topic, apiKey, allAgentNames, memoryStr) {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

    const systemPrompt = buildSystemPrompt(agent, allAgentNames, topic, memoryStr);

    let contextStr = '';
    if (context && context.length > 0) {
      const recent = context.slice(-6);
      contextStr = '\n\nRECENT GROUP CHAT MESSAGES:\n' + recent.map(m => `${m.flag || ''} [${m.country}]: ${m.text}`).join('\n');
    }

    const prompt = `${systemPrompt}${contextStr}\n\nNow respond as ${agent.ambassadorName} (${agent.country}). Remember: pure JSON containing "text" and "emotion":`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" }
    });
    let textRes = result.response.text().trim();
    if (textRes.startsWith('```json')) {
      textRes = textRes.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    } else if (textRes.startsWith('```')) {
      textRes = textRes.replace(/^```.*\n?/, '').replace(/\n?```$/, '').trim();
    }
    const parsed = JSON.parse(textRes);
    return { text: parsed.text, emotion: parsed.emotion || 'neutral' };
  } catch (err) {
    console.error(`[AgentEngine] Gemini error for ${agent.country}:`, err.message);
    return null;
  }
}

// Select the next best speaker using Gemini
async function pickSmartSpeakerWithGemini(context, topic, apiKey, candidates) {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-1.5-flash-8b passing as it is cheap and fast
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    
    let contextStr = '';
    if (context && context.length > 0) {
      const recent = context.slice(-4);
      contextStr = recent.map(m => `[${m.country}]: ${m.text}`).join('\n');
    }

    const prompt = `You are a debate moderator. The current topic is: "${topic}".
Recent messages:
${contextStr}

Which of the following delegates is MOST likely to interject or respond right now based on their real-world geopolitical interests and the recent messages?
Candidates: ${candidates.join(', ')}

Respond ONLY with the name of ONE country from the candidates list. No other text.`;

    const result = await model.generateContent(prompt);
    let picked = result.response.text().trim().replace(/[^a-zA-Z\s]/g, '').trim();
    
    // Find closest match or default
    picked = candidates.find(c => c.toLowerCase() === picked.toLowerCase());
    return picked || null;
  } catch (err) {
    console.error(`[AgentEngine] Speaker selection error:`, err.message);
    return null;
  }
}

// Sarcastic topic-anchoring openers (always injected in scripted mode)
const TOPIC_OPENERS = [
  (t) => `On "${t.substring(0, 45)}" — oh this is rich —`,
  (t) => `Since we're all pretending to care about "${t.substring(0, 35)}" —`,
  (t) => `Allow me to address "${t.substring(0, 40)}" before someone embarrasses themselves further:`,
  (t) => `Fascinating take on "${t.substring(0, 40)}". Truly. Groundbreaking. Anyway —`,
  (t) => `Re: "${t.substring(0, 45)}" — I'll keep this simple since some of us struggle with nuance:`,
  (t) => `On the topic — which, for the record, we would handle far better than most in this chat:`,
  (t) => `Let's talk about "${t.substring(0, 40)}" — a topic where some delegates have... surprisingly strong opinions for someone with that track record.`,
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
  generateEscalation,
  pickSmartSpeakerWithGemini
};
