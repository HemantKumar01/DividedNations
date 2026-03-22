require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { fetchLiveHeadlines, getAllHeadlines, getRandomTopic } = require('./newsService');
const DebateController = require('./debateController');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Initialize debate controller
const debate = new DebateController(io);

// --- REST API ---

app.get('/api/state', (req, res) => {
  res.json(debate.getState());
});

app.get('/api/news', async (req, res) => {
  const headlines = getAllHeadlines();
  res.json({ headlines });
});

app.post('/api/action', (req, res) => {
  const { type, targetCountry } = req.body;
  const validActions = ['MIC_LEAK', 'BREAKING_NEWS', 'HOT_MIC', 'UN_VOTE', 'SANCTIONS_THREAT'];
  
  if (!validActions.includes(type)) {
    return res.status(400).json({ error: 'Invalid action type' });
  }
  
  debate.triggerAction(type, targetCountry || null, io);
  res.json({ success: true, action: type });
});

app.post('/api/topic', (req, res) => {
  const { topic } = req.body;
  if (topic) {
    debate.changeTopic(topic);
    res.json({ success: true, topic });
  } else {
    const newTopic = getRandomTopic();
    debate.changeTopic(newTopic);
    res.json({ success: true, topic: newTopic });
  }
});

// --- Socket.IO ---

io.on('connection', (socket) => {
  console.log(`[Server] Client connected: ${socket.id}`);
  
  // Send current state to new client
  socket.emit('init', debate.getState());
  
  // Send initial headlines
  const headlines = getAllHeadlines();
  socket.emit('headlines', { headlines });
  
  socket.on('action', (data) => {
    const { type, targetCountry } = data;
    debate.triggerAction(type, targetCountry || null, io);
  });
  
  socket.on('change-topic', (data) => {
    if (data.topic) {
      debate.changeTopic(data.topic);
    } else {
      debate.changeTopic(getRandomTopic());
    }
  });
  
  socket.on('disconnect', () => {
    console.log(`[Server] Client disconnected: ${socket.id}`);
  });
});

// --- News refresh loop ---
async function startNewsRefresh() {
  await fetchLiveHeadlines();
  setInterval(async () => {
    await fetchLiveHeadlines();
    const headlines = getAllHeadlines();
    io.emit('headlines', { headlines });
    console.log('[Server] Headlines refreshed');
  }, 60000);
}

// --- Boot ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  console.log(`\n🌍 DIVIDED NATIONS running at http://localhost:${PORT}`);
  console.log(`🤖 API Mode: ${process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_key_here' ? 'Gemini AI' : 'Scripted Drama Bank'}`);
  console.log(`⚡ Bot interval: ${process.env.BOT_INTERVAL_MS || 5000}ms\n`);
  
  await startNewsRefresh();
  
  // Auto-start the debate
  debate.start();
});

module.exports = { app, io };
