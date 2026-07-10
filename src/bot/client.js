const { Client, GatewayIntentBits } = require('discord.js');

function createClient() {
    return new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMembers,
            // Needed only for the !reload text command; replaced by a slash
            // command (and dropped) in Phase 5.
            GatewayIntentBits.MessageContent,
        ],
    });
}

module.exports = { createClient };
