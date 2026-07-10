const { Client, GatewayIntentBits } = require('discord.js');

// Only non-privileged intents plus GuildMembers (needed to fetch members for
// role assignment). MessageContent/GuildMessages are gone — the old !reload
// text command is now the /reload slash command.
function createClient() {
    return new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
        ],
    });
}

module.exports = { createClient };
