require("dotenv").config();
const {server} = require("./src/server");
const {Client, GatewayIntentBits} = require("discord.js");
const {backendTracking, interval} = require("./src/backend");
const database = require("./models/dbHelpers");
const {ADMIN_REQUESTS, USER_REQUESTS} = require("./src/Config");
const {setupRolesButton, letsGoButton, newGuild, resendMessage} = require("./src/discord-bot");

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => console.log("server is running on port " + PORT));

startDiscordBot();

function startDiscordBot() {
    global.client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.MessageContent,
        ]});

    client.once('ready', () => {
        setInterval(() => backendTracking(), interval)
    });

    client.on('guildCreate', (guild) => {
        const {id} = guild;
        newGuild(client, id).catch()
    });

    client.on('guildDelete', async guild => {
        console.log(`${client.user.username} was kicked from ${guild.id}.`);
        await database.deleteGuild(guild.id)
        const adminKeys = Object.keys(ADMIN_REQUESTS);
        adminKeys.forEach((key) => {
            if(ADMIN_REQUESTS[key].guildId === guild.id) delete ADMIN_REQUESTS[key]
        })

        const userKeys = Object.keys(USER_REQUESTS);
        userKeys.forEach((key) => {
            if(USER_REQUESTS[key].guildId === guild.id) delete USER_REQUESTS[key]
        })
        let roles = await database.getGuildRoles(guild.id)
        roles.forEach(async (role) => {
            await database.deleteGuildRole(guild.id, role.roleId)
        })
    });

    client.on('interactionCreate', interaction => {
        if (!interaction.isButton()) return;

        if (interaction.customId === "letsgo") {
            letsGoButton(interaction)
        }
        if (interaction.customId === "setupRoles") {
            setupRolesButton(interaction)
        }
    });

    client.on('messageCreate', message => {
        // Ignore messages sent by a bot
        if (message.author.bot) return;

        if (message.content.trim() === '!reload') {
            resendMessage(message)
        }
    });

    client.login(process.env.DISCORD_BOT_TOKEN);
}
