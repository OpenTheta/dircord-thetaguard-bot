// Start express server
// const express = require("express")
const fs = require('fs');
// const http = require('http');
// const https = require('https');
const {server, serverHttps} = require("./src/server");
// const {USER_REQUESTS, ADMIN_REQUESTS} = require('./src/Config')
const {Client, GatewayIntentBits} = require("discord.js");
const {backendTracking, interval} = require("./src/backend");
const database = require("./models/dbHelpers");
const {ADMIN_REQUESTS, USER_REQUESTS} = require("./src/Config");
const {setupRolesButton, letsGoButton, newGuild, resendMessage} = require("./src/discord-bot");

// Starting both http & https servers
// const server = http.createServer(app);


// const PORT = 5001;
const PORT = 80;
server.listen(PORT, () => console.log("server is running on port "+PORT));
serverHttps.listen(443, () => {
    console.log('HTTPS Server running on port 443');
});


// Start Discord Bot
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
        setInterval( () => backendTracking(), interval)
    });


    client.on('guildCreate', (guild) => {
        const { id } = guild;
        // console.log(id)
        newGuild(client, id).catch()
        // do something with id
    });

    client.on('guildDelete', async guild => {
        console.log(`${client.user.username} was kicked from ${guild.id}.`);
        await database.deleteGuild(guild.id)
        const adminKeys = Object.keys(ADMIN_REQUESTS);
        adminKeys.forEach((key, index) => {
            if(ADMIN_REQUESTS[key].guildId === guild.id) delete ADMIN_REQUESTS[key]
        })

        const userKeys = Object.keys(USER_REQUESTS);
        userKeys.forEach((key, index) => {
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
            // console.log(interaction)
            letsGoButton(interaction)
            // Do what you want with button 'id1'.
        }
        if (interaction.customId === "setupRoles") {
            // console.log(interaction)
            setupRolesButton(interaction)
            // Do what you want with button 'id1'.
        }

    });

    client.on('messageCreate', message => {
        // Ignore messages sent by a bot
        if (message.author.bot) return;

        console.log(message.content)
        if (message.content.trim() === '!reload') {
            // Execute the reload command
            resendMessage(message)
        }
    });


    client.login(process.env.DISCORD_BOT_TOKEN);

}


// Start Discord Bot
// const database = require("./models/dbHelpers")
// const discordFunctions = require("./src/discord-bot")
// require("dotenv").config();
// const { Client, Collection, GatewayIntentBits, DMChannel } = require('discord.js')
// const {backendTracking, interval} = require("./src/backend")
//
//
// global.client = new Client({
//     intents: [
//         GatewayIntentBits.Guilds,
//         GatewayIntentBits.GuildMessages,
//         GatewayIntentBits.GuildMembers,
//     ]});
//
// client.once('ready', () => {
//     // setInterval( () => backendTracking(), interval)
// });
//
//
// client.on('guildCreate', (guild) => {
//     const { id } = guild;
//     // console.log(id)
//     discordFunctions.newGuild(client, id).catch()
//     // do something with id
// });
//
// client.on('guildDelete', async guild => {
//     console.log(`${client.user.username} was kicked from ${guild.id}.`);
//     await database.deleteGuild(guild.id)
//     const adminKeys = Object.keys(ADMIN_REQUESTS);
//     adminKeys.forEach((key, index) => {
//         if(ADMIN_REQUESTS[key].guildId === guild.id) delete ADMIN_REQUESTS[key]
//     })
//
//     const userKeys = Object.keys(USER_REQUESTS);
//     userKeys.forEach((key, index) => {
//         if(USER_REQUESTS[key].guildId === guild.id) delete USER_REQUESTS[key]
//     })
//     let roles = await database.getGuildRoles(guild.id)
//     roles.forEach(async (role) => {
//         await database.deleteGuildRole(guild.id, role.roleId)
//     })
// });
//
// client.on('interactionCreate', interaction => {
//
//     if (!interaction.isButton()) return;
//
//     if (interaction.customId === "letsgo") {
//         // console.log(interaction)
//         discordFunctions.letsGoButton(interaction)
//         // Do what you want with button 'id1'.
//     }
//     if (interaction.customId === "setupRoles") {
//         // console.log(interaction)
//         discordFunctions.setupRolesButton(interaction)
//         // Do what you want with button 'id1'.
//     }
//
// });
//
// client.login(process.env.DISCORD_BOT_TOKEN);
