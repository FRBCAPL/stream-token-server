require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { google } = require('googleapis');
const { StreamChat } = require('stream-chat');

const app = express();

// --- CORS: Allow multiple origins (deployed + local + GoDaddy) ---
const allowedOrigins = [
  'https://stream-chat-frontend.onrender.com',
  'http://localhost:3000',
  'https://www.frusapl.com'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like curl or Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json());

const SHEET_ID = '1tvMgMHsRwQxsR6lMNlSnztmwpK7fhZeNEyqjTqmRFRc';
const STREAM_API_KEY = 'emnbag2b9jt4';
const STREAM_API_SECRET = 't8ehrbr2yz5uv84u952mkud9bnjd42zcggwny8at2e9qmvyc5aahsfqexrjtxa5g';

// --- Google Sheets Auth ---
const auth = new google.auth.GoogleAuth({
  keyFile: 'service-account.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });

// --- Stream Chat Server Client ---
const serverClient = StreamChat.getInstance(STREAM_API_KEY, STREAM_API_SECRET);

// --- Helper: Find user by PIN ---
async function getUserByPin(pin) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: "'Contact Info'!A:H",
  });
  const rows = res.data.values || [];

  for (let i = 1; i < rows.length; i++) {
    const name = rows[i][0];
    const sheetPin = rows[i][7];
    if (sheetPin === pin) {
      if (!name) return null;
      const userId = `${name.toLowerCase().replace(/\s+/g, '_')}_${pin}`;
      return { id: userId, name };
    }
  }
  return null;
}

// --- POST /verify-pin ---
app.post('/verify-pin', async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN is required' });

  try {
    const user = await getUserByPin(pin);
    if (!user) return res.status(401).json({ error: 'Invalid PIN' });

    await serverClient.upsertUser({ id: user.id, name: user.name });

    // Create or get the user's personal channel
    const userChannel = serverClient.channel('messaging', user.id, {
      name: user.name,
      members: [user.id],
    });
    await userChannel.create().catch(() => {});

    // Ensure user is member of general channel
    const generalChannel = serverClient.channel('messaging', 'general', { name: 'General' });
    await generalChannel.create().catch(() => {});

    // Fetch current members
    const channelState = await generalChannel.query({ watch: false, state: true });
    const currentMemberIds = (channelState.members || []).map(m => m.user_id);

    if (!currentMemberIds.includes(user.id)) {
      await generalChannel.addMembers([user.id]);
    }

    const token = serverClient.createToken(user.id);

    res.json({ userId: user.id, name: user.name, token });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// --- TEST ROUTE ---
app.get('/test', (req, res) => {
  res.send('Backend is alive!');
});

// --- Listen on the correct port for Render and local ---
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
