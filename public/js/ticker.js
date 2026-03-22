// ticker.js — News ticker management

let tickerHeadlines = [];
let tickerIndex = 0;

function initTicker(headlines) {
  tickerHeadlines = headlines || [];
  updateTicker();
  // Rotate every 20 seconds
  setInterval(updateTicker, 20000);
}

function updateTicker() {
  const inner = document.getElementById('tickerInner');
  if (!inner || tickerHeadlines.length === 0) return;
  
  // Show 5 headlines rotating
  const count = Math.min(5, tickerHeadlines.length);
  const batch = [];
  for (let i = 0; i < count; i++) {
    const idx = (tickerIndex + i) % tickerHeadlines.length;
    batch.push(tickerHeadlines[idx]);
  }
  tickerIndex = (tickerIndex + 3) % tickerHeadlines.length;
  
  // Format with separators and highlight hot keywords
  const HOT_WORDS = ['BREAKING', 'WAR', 'NUCLEAR', 'ATTACK', 'CRISIS', 'THREAT', 'SANCTIONS', 'MISSILE', 'COUP', 'INVASION'];
  
  let text = batch.join('  ·  ');
  for (const word of HOT_WORDS) {
    const re = new RegExp(`(${word})`, 'gi');
    text = text.replace(re, '<span style="color:#ef4444;font-weight:700;">$1</span>');
  }
  
  inner.innerHTML = text + '  &nbsp;&nbsp;&nbsp;';
  
  // Reset animation
  inner.style.animation = 'none';
  inner.offsetHeight; // reflow
  inner.style.animation = '';
}

function addHeadline(headline) {
  if (!tickerHeadlines.includes(headline)) {
    tickerHeadlines.unshift(headline);
    if (tickerHeadlines.length > 30) tickerHeadlines.pop();
    updateTicker();
  }
}

window.TickerModule = { initTicker, addHeadline, updateTicker };
