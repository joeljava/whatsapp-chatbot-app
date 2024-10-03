// index.js

const { Client, LocalAuth } = require("whatsapp-web.js");
const express = require("express");
const axios = require("axios");
require("dotenv").config();
const qrcode = require("qrcode");

const app = express();
const port = process.env.PORT || 3000;

// Base URL for constructing full URLs
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;

// List of bot IDs
const botIds = ["bot1", "bot2", "bot3", "bot4", "bot5"];

// Map to store clients and their statuses
const clients = {}; // botId => { client, isInitialized, isAuthenticated, qrCodeData, conversationHistory }

botIds.forEach((botId) => {
  clients[botId] = {
    client: null,
    isInitialized: false,
    isAuthenticated: false,
    qrCodeData: null,
    qrCodeGeneratedAt: null,
    conversationHistory: new Map(), // userId => messages array
  };
});

// Root endpoint to show basic info
app.get("/", (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>Welcome to the WhatsApp ChatGPT Bots</h1>
        <p>Select a bot to authenticate:</p>
        <ul>
          ${botIds
            .map((botId) => `<li><a href="/${botId}">${botId}</a></li>`)
            .join("")}
        </ul>
      </body>
    </html>
  `);
});

// Endpoint for each bot
botIds.forEach((botId) => {
  app.get(`/${botId}`, async (req, res) => {
    console.log(
      `[${new Date().toISOString()}] /${botId} endpoint was accessed`
    );

    const bot = clients[botId];

    if (bot.isAuthenticated) {
      console.log(
        `[${new Date().toISOString()}] ${botId} is already authenticated`
      );
      res.send(`
        <html>
          <body>
            <h1>${botId} is already authenticated</h1>
            <p>Your WhatsApp client is already connected and ready to receive messages.</p>
          </body>
        </html>
      `);
      return;
    }

    if (!bot.isInitialized) {
      console.log(
        `[${new Date().toISOString()}] Initializing ${botId} client...`
      );
      initializeBotClient(botId);
    }

    // Wait for QR code to be generated
    const startTime = Date.now();
    while (!bot.qrCodeData && Date.now() - startTime < 30000) {
      // Wait up to 30 seconds
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (bot.qrCodeData) {
      const qrCodeImageUrl = await qrcode.toDataURL(bot.qrCodeData);
      console.log(
        `[${new Date().toISOString()}] Serving QR code for ${botId} to client`
      );
      res.send(`
        <html>
          <body>
            <h1>Scan the QR Code for ${botId}</h1>
            <img src="${qrCodeImageUrl}" alt="QR Code" />
            <p>QR code generated at: ${bot.qrCodeGeneratedAt}</p>
          </body>
        </html>
      `);
    } else {
      console.error(
        `[${new Date().toISOString()}] QR code was not generated in time for ${botId}`
      );
      res.send(`
        <html>
          <body>
            <h1>QR Code Not Available for ${botId}</h1>
            <p>Sorry, the QR code could not be generated at this time. Please try again later.</p>
          </body>
        </html>
      `);
    }
  });
});

// Start the Express server
app.listen(port, () => {
  console.log(
    `[${new Date().toISOString()}] Express server is running on port ${port}`
  );
});

// Function to initialize a bot client
function initializeBotClient(botId) {
  const bot = clients[botId];
  bot.client = new Client({
    authStrategy: new LocalAuth({ clientId: botId }),
    puppeteer: {
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  bot.isInitialized = true;

  bot.client.on("qr", (qr) => {
    bot.qrCodeData = qr;
    bot.qrCodeGeneratedAt = new Date().toISOString();
    console.log(`[${bot.qrCodeGeneratedAt}] QR code generated for ${botId}`);
  });

  bot.client.on("authenticated", () => {
    bot.isAuthenticated = true;
    bot.qrCodeData = null;
    console.log(
      `[${new Date().toISOString()}] ${botId} authenticated successfully`
    );
  });

  bot.client.on("auth_failure", (msg) => {
    bot.isAuthenticated = false;
    console.error(
      `[${new Date().toISOString()}] Authentication failure for ${botId}: ${msg}`
    );
  });

  bot.client.on("ready", () => {
    console.log(`[${new Date().toISOString()}] ${botId} client is ready`);
  });

  bot.client.on("disconnected", (reason) => {
    bot.isAuthenticated = false;
    bot.isInitialized = false;
    bot.qrCodeData = null;
    console.log(
      `[${new Date().toISOString()}] ${botId} client was logged out: ${reason}`
    );
    // Re-initialize the client
    initializeBotClient(botId);
  });

  // Message handler
  bot.client.on("message", async (message) => {
    console.log(
      `[${new Date().toISOString()}] [${botId}] Received message from ${
        message.from
      }: ${message.body}`
    );

    const userId = message.from;
    const conversationHistory = bot.conversationHistory;

    if (message.body.startsWith("!")) {
      const userInput = message.body.slice(1).trim();
      const [command, ...args] = userInput.split(" ");
      const argString = args.join(" ");

      switch (command.toLowerCase()) {
        case "help":
          await message.reply(
            "List of commands:\n" +
              "!help - Show this help message\n" +
              "!joke - Tell a joke\n" +
              "!quote - Get an inspirational quote\n" +
              "!reset - Reset the conversation history"
          );
          break;

        case "joke":
          const joke = await getJoke();
          await message.reply(joke);
          break;

        case "quote":
          const quote = await getQuote();
          await message.reply(quote);
          break;

        case "reset":
          // Reset conversation history for this user
          conversationHistory.set(userId, []);
          await message.reply("Conversation history has been reset.");
          break;

        default:
          await message.reply(
            "Unknown command. Type !help for a list of commands."
          );
      }
    } else {
      // Handle conversation messages

      // Initialize conversation history for new users
      if (!conversationHistory.has(userId)) {
        conversationHistory.set(userId, []);
      }

      const conversation = conversationHistory.get(userId);

      // Add user's message to conversation history
      conversation.push({ role: "user", content: message.body });

      try {
        const reply = await getChatGPTReply(conversation);
        await message.reply(reply);

        // Add assistant's reply to conversation history
        conversation.push({ role: "assistant", content: reply });
      } catch (error) {
        console.error(
          `[${new Date().toISOString()}] Error with OpenAI API for ${botId}:`,
          error.response ? error.response.data : error.message
        );
        await message.reply(
          "Sorry, I encountered an error while processing your request."
        );
      }
    }
  });

  bot.client.initialize();
}

// Function to call OpenAI Chat Completion API
async function getChatGPTReply(conversation) {
  const apiKey = process.env.OPENAI_API_KEY;
  const apiUrl = "https://api.openai.com/v1/chat/completions";

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const data = {
    model: "gpt-3.5-turbo",
    messages: conversation,
  };

  try {
    const response = await axios.post(apiUrl, data, { headers });
    const reply = response.data.choices[0].message.content.trim();
    console.log(`[${new Date().toISOString()}] OpenAI API response received`);
    return reply;
  } catch (error) {
    throw error;
  }
}

// Function to get a joke
async function getJoke() {
  try {
    const response = await axios.get(
      "https://official-joke-api.appspot.com/random_joke"
    );
    console.log(`[${new Date().toISOString()}] Joke fetched successfully`);
    const joke = `${response.data.setup}\n${response.data.punchline}`;
    return joke;
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Error fetching joke:`,
      error.message
    );
    return "Sorry, I couldn't fetch a joke at this time.";
  }
}

// Function to get a quote
async function getQuote() {
  try {
    const response = await axios.get("https://zenquotes.io/api/random");
    console.log(`[${new Date().toISOString()}] Quote fetched successfully`);
    const data = response.data[0];
    const quote = `"${data.q}"\n- ${data.a}`;
    return quote;
  } catch (error) {
    console.error(
      `[${new Date().toISOString()}] Error fetching quote:`,
      error.message
    );
    return "Sorry, I couldn't fetch a quote at this time.";
  }
}
