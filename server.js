require('dotenv').config();

const StreamChat = require('stream-chat').StreamChat;
const express = require('express');
const cors = require('cors');

const app = express();
const apiKey = process.env.STREAM_API_KEY;      // Use environment variables!
const apiSecret = process.env.STREAM_API_SECRET;

const serverClient = StreamChat.getInstance(apiKey, apiSecret);

app.use(cors());
app.use(express.json());

app.post('/get-token', async (req, res) => {
  const { user_id, name } = req.body;
  try {
    await serverClient.upsertUser({ id: user_id, name });
    const token = serverClient.createToken(user_id);
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Token server running on port ${PORT}`));
