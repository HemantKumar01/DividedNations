// insightGenerator.js - Deep AI analyst module
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function generateGeopoliticalInsight(headline, contentSnippet, debateContext, apiKey) {
  if (!apiKey || apiKey === 'your_key_here') return null;
  
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
    
    let contextStr = '';
    if (debateContext && debateContext.length > 0) {
      const recent = debateContext.slice(-8);
      contextStr = recent.map(m => `[${m.country}]: ${m.text}`).join('\n');
    }
    
    const systemPrompt = `You are a brilliant, objective AI Geopolitical Analyst observing a chaotic debate among world leaders.
A new breaking news event has occurred: "${headline}"
Details: ${contentSnippet || 'No additional details.'}

Recent debate context:
${contextStr}

Your task is to provide a single, piercing insight (2-3 sentences max) connecting this breaking news to the delegates' recent behavior, exposing underlying geopolitical realities, hypocrisies, or shifting alliances that humans might miss. Be analytical, slightly dry but incredibly sharp.`;

    const result = await model.generateContent(systemPrompt);
    return result.response.text().trim();
  } catch (err) {
    console.error("[InsightGenerator] Error:", err.message);
    return null;
  }
}

module.exports = { generateGeopoliticalInsight };
