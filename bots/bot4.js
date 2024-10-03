const { Client } = require("whatsapp-web.js");
const axios = require("axios");
const qrcode = require("qrcode");

// Unique conversation history per bot
const conversationHistory = {};

let client;
let qrCodeData = null;
let isAuthenticated = false;

function initializeBot(port, botName) {
  client = new Client();

  client.on("qr", (qr) => {
    qrCodeData = qr;
    console.log(`[${botName}] QR Code Generated`);
  });

  client.on("authenticated", () => {
    isAuthenticated = true;
    qrCodeData = null;
    console.log(`[${botName}] Authenticated successfully`);
  });

  client.on("ready", () => {
    console.log(`[${botName}] WhatsApp client is ready`);
  });

  client.on("disconnected", () => {
    isAuthenticated = false;
    console.log(`[${botName}] Client disconnected`);
  });

  client.on("message", async (message) => {
    console.log(
      `[${botName}] Received message from ${message.from}: ${message.body}`
    );

    const userId = message.from;

    if (message.body.startsWith("!")) {
      const userInput = message.body.slice(1).trim();
      const [command, ...args] = userInput.split(" ");
      const argString = args.join(" ");

      switch (command.toLowerCase()) {
        case "help":
          await message.reply(
            "List of commands:\n!help - Show help message\n!joke - Tell a joke\n!quote - Get an inspirational quote\n!reset - Reset the conversation history"
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
          // Reset conversation history for this bot
          conversationHistory[userId] = [];
          await message.reply("Conversation history has been reset.");
          break;

        default:
          await message.reply(
            "Unknown command. Type !help for a list of commands."
          );
      }
    } else {
      const userInput = message.body;

      // Initialize conversation history for new users in this bot
      if (!conversationHistory[userId]) {
        conversationHistory[userId] = [];
      }

      // Add user's message to the conversation history
      conversationHistory[userId].push({ role: "user", content: userInput });

      try {
        const reply = await getChatGPTReply(conversationHistory[userId]);
        await message.reply(reply);

        // Add bot's reply to the conversation history
        conversationHistory[userId].push({ role: "assistant", content: reply });
      } catch (error) {
        console.error(`[${botName}] Error with OpenAI API:`, error.message);
        await message.reply(
          "Sorry, I encountered an error while processing your request."
        );
      }
    }
  });

  client.initialize();

  return {
    getQRCode: async () => {
      if (!qrCodeData) return null;
      return await qrcode.toDataURL(qrCodeData);
    },
    isAuthenticated: () => isAuthenticated,
  };
}

// Function to get a joke
async function getJoke() {
  try {
    const response = await axios.get(
      "https://official-joke-api.appspot.com/random_joke"
    );
    const joke = `${response.data.setup}\n${response.data.punchline}`;
    return joke;
  } catch (error) {
    return "Sorry, I couldn't fetch a joke at this time.";
  }
}

// Function to get a quote
async function getQuote() {
  try {
    const response = await axios.get("https://zenquotes.io/api/random");
    const data = response.data[0];
    return `"${data.q}"\n- ${data.a}`;
  } catch (error) {
    return "Sorry, I couldn't fetch a quote at this time.";
  }
}

// Function to get a response from OpenAI API
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
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    throw error;
  }
}

module.exports = initializeBot;
