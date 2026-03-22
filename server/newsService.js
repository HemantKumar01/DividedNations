const Parser = require('rss-parser');
const parser = new Parser({ timeout: 8000 });

// Curated fake headlines for fallback (dramatic, relevant)
const FAKE_HEADLINES = [
  "🚨 BREAKING: US Imposes New Sweeping Sanctions Package on Three Nations",
  "🌍 China's Military Spending Surpasses All of Europe Combined",
  "💥 Nuclear Tensions Rise as Missile Tests Rattle Pacific Region",
  "🔥 Israel Conducts Largest Airstrikes in Five Years, Citing 'Imminent Threat'",
  "⚡ Russia Cuts Energy Supplies to Two EU Members Overnight",
  "🛑 India-Pakistan Border: Third Ceasefire Violation This Week",
  "📉 Global Markets Plunge as Trade War Rhetoric Escalates",
  "🌿 Amazon Deforestation Hits Record High Amid Policy Reversal",
  "🚀 China Launches Mystery Satellite, Pentagon Calls It 'Concerning'",
  "💣 UN Security Council Deadlocked Again on Gaza Resolution",
  "🏦 IMF Warns: Three Major Economies on Brink of Recession",
  "🔴 NATO Emergency Meeting Called After Incursion Alert",
  "🌊 South China Sea: US Carrier Group Deployment Prompts Beijing Warning",
  "⚔️ Coup Attempt Foiled in West African Nation, Outside Powers Accused",
  "💰 BRICS Nations Launch New Reserve Currency Challenge to US Dollar",
  "🛢️ OPEC+ Slashes Production; Oil Hits $120/Barrel",
  "🧪 Bioweapon Allegations Fly at UN: Russia Points Finger at US Labs",
  "📡 Massive Cyberattack Hits NATO Infrastructure; No Group Claims Responsibility",
  "🤝 Surprise: India and China Announce Major Border Deal",
  "🌐 Twitter / X Banned in Four Countries Following 'Destabilization' Claims",
  "🔒 CIA Director Fired After Leak About Israeli Operations Published",
  "🚁 Russia Deploys Drones Over Black Sea; NATO Scrambles Alert",
  "🇺🇦 Zelensky Addresses UN: 'The World Is Still Not Doing Enough'",
  "💬 Secret US-Iran Back-Channel Talks Exposed by Whistleblower",
  "🏴 Pakistan PM Survives Assassination Attempt; India Denies Involvement",
  "🌡️ UN Climate Report: World Now 1.7°C Above Pre-Industrial Levels",
  "🛸 Pentagon UFO Report: 'Non-Human Intelligence' Language Causes Uproar",
  "⚓ Taiwan Strait: Chinese Navy Encirclement Exercise Called 'Rehearsal'",
  "🧨 North Korea Tests ICBM, Calls It 'Warning to Washington'",
  "💵 US National Debt Hits $40 Trillion; World Debates Dollar Dominance"
];

// RSS feed sources (public, no auth)
const RSS_FEEDS = [
  'http://feeds.bbci.co.uk/news/world/rss.xml',
  'https://feeds.reuters.com/reuters/worldNews',
  'https://www.aljazeera.com/xml/rss/all.xml',
];

let cachedHeadlines = [...FAKE_HEADLINES];
let lastFetchTime = 0;
const seenTitles = new Set();

async function fetchLiveHeadlines() {
  const now = Date.now();
  if (now - lastFetchTime < 60000) {
    return { headlines: cachedHeadlines, newItems: [] };
  }
  
  const liveHeadlines = [];
  const newItems = [];
  
  for (const feedUrl of RSS_FEEDS) {
    try {
      const feed = await parser.parseURL(feedUrl);
      const items = feed.items.slice(0, 8);
      for (const item of items) {
        if (item.title) {
          liveHeadlines.push(item.title);
          if (!seenTitles.has(item.title)) {
            newItems.push({ title: item.title, snippet: item.contentSnippet || item.content || '' });
            seenTitles.add(item.title);
          }
        }
      }
    } catch (err) {
      // silently fail per feed, use fallback
    }
  }
  
  if (liveHeadlines.length > 5) {
    // Mix live and fake for drama
    cachedHeadlines = [
      ...liveHeadlines.slice(0, 15),
      ...FAKE_HEADLINES.slice(0, 15)
    ];
    console.log(`[NewsService] Fetched ${liveHeadlines.length} live headlines`);
  } else {
    console.log('[NewsService] Using fallback headlines (RSS unavailable)');
    cachedHeadlines = [...FAKE_HEADLINES];
  }
  
  lastFetchTime = now;
  return { headlines: cachedHeadlines, newItems };
}

function getRandomHeadline(exclude = null) {
  const pool = cachedHeadlines.filter(h => h !== exclude);
  return pool[Math.floor(Math.random() * pool.length)];
}

function getAllHeadlines() {
  return cachedHeadlines.slice(0, 20);
}

// Debate topic seeds — rich scenarios that trigger all kinds of drama
const DEBATE_TOPICS = [
  "The UN Security Council veto system is obsolete and must be abolished",
  "Economic sanctions are an act of war and should be treated as such",
  "The United States has too much influence over global financial systems",
  "China's Belt and Road Initiative is debt-trap diplomacy",
  "Russia's actions in Eastern Europe are fully justified by NATO expansion",
  "The Amazon rainforest should be treated as international territory",
  "Nuclear-armed states should be required to disarm under international supervision",
  "The Global South has been systematically exploited by G7 nations",
  "Social media companies should be regulated by an international body",
  "Climate change obligations should be proportional to historical emissions",
  "The ICC should have binding jurisdiction over all UN members",
  "Kashmir is a disputed territory requiring immediate international resolution",
  "Israel's right to self-defense has no limits under international law",
  "NATO expansion is the primary cause of current European instability",
  "BRICS nations represent the future of global economic governance",
  "Artificial intelligence weapons should be immediately banned internationally",
  "The petrodollar system disadvantages developing economies",
  "Taiwan's democratic status should be formally recognized by the UN",
  "Sanctions on Iran have failed and should be lifted immediately",
  "Cybersecurity attacks on critical infrastructure should be treated as acts of war"
];

function getRandomTopic() {
  if (cachedHeadlines && cachedHeadlines.length > 0) {
    return getRandomHeadline();
  }
  return DEBATE_TOPICS[Math.floor(Math.random() * DEBATE_TOPICS.length)];
}

module.exports = {
  fetchLiveHeadlines,
  getRandomHeadline,
  getAllHeadlines,
  getRandomTopic,
  FAKE_HEADLINES
};
