const firebase = require('firebase/compat/app');
require('firebase/compat/firestore');

// User's web app Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBs_OgQxibXXMXqmb1MzWfVI_OARvgThok",
  authDomain: "testing-ff0e3.firebaseapp.com",
  databaseURL: "https://testing-ff0e3-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "testing-ff0e3",
  storageBucket: "testing-ff0e3.appspot.com",
  messagingSenderId: "619833076225",
  appId: "1:619833076225:web:a9db974e3fa32d68046e00"
};

let db = null;
let useFirebase = false;

try {
  // Initialize Firebase Client SDK on the Server
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  useFirebase = true;
  console.log('[DB] Successfully connected to Firebase Client SDK (Firestore)!');
} catch (err) {
  console.error('[DB] Error initializing Firebase:', err.message);
}

// Save a new message
async function saveMessage(msg) {
  if (!useFirebase) return;
  try {
    await db.collection('messages').doc(msg.id).set(msg);
  } catch (err) {
    console.error('[DB] Failed to save message:', err.message);
  }
}

// Load the last N messages
async function loadRecentMessages(limitNum = 20) {
  if (!useFirebase) return [];
  try {
    const snapshot = await db.collection('messages')
      .orderBy('timestamp', 'desc')
      .limit(limitNum)
      .get();
    
    const msgs = [];
    snapshot.forEach(doc => {
      msgs.push(doc.data());
    });
    return msgs.reverse();
  } catch (err) {
    console.error('[DB] Failed to load messages. Ensure Cloud Firestore Database is "Created" and rules are public:', err.message);
    return [];
  }
}

module.exports = { saveMessage, loadRecentMessages, useFirebase };
