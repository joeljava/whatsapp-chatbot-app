const express = require("express");
require("dotenv").config(); // Load environment variables

const app = express();
const port = process.env.PORT || 3000;
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`; // Use BASE_URL from environment variables

// Import bots
const bot1 = require("./bots/bot1")(3001, "Bot1");
const bot2 = require("./bots/bot2")(3002, "Bot2");
const bot3 = require("./bots/bot3")(3003, "Bot3");
const bot4 = require("./bots/bot4")(3004, "Bot4");
const bot5 = require("./bots/bot5")(3005, "Bot5");

const bots = { bot1, bot2, bot3, bot4, bot5 };

// Home route
app.get("/", (req, res) => {
  res.send(`
    <html>
      <body>
        <h1>WhatsApp Bots Dashboard</h1>
        <p>Select a bot to view its QR code and authentication status:</p>
        <ul>
          ${Object.keys(bots)
            .map(
              (botName) => `
            <li>
              <a href="${baseUrl}/${botName}/qr">${botName} QR Code</a> |
              <a href="${baseUrl}/${botName}/status">${botName} Status</a>
            </li>
          `
            )
            .join("")}
        </ul>
      </body>
    </html>
  `);
});

// Route to get QR code for each bot
Object.keys(bots).forEach((botName) => {
  app.get(`/${botName}/qr`, async (req, res) => {
    const bot = bots[botName];
    const qrCode = await bot.getQRCode();
    if (qrCode) {
      res.send(`
        <html>
          <body>
            <h1>Scan the QR Code for ${botName}</h1>
            <img src="${qrCode}" alt="QR Code" />
            <p>To authenticate, please go to: <a href="${baseUrl}/${botName}/qr">${baseUrl}/${botName}/qr</a></p>
          </body>
        </html>
      `);
    } else {
      res.send(
        `<h1>${botName} is already authenticated or no QR code available</h1>`
      );
    }
  });

  // Route to get authentication status
  app.get(`/${botName}/status`, (req, res) => {
    const bot = bots[botName];
    const status = bot.isAuthenticated()
      ? "Authenticated"
      : "Not Authenticated";
    res.send(`<h1>${botName} Status: ${status}</h1>`);
  });
});

// Start server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
