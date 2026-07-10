const { PermissionsBitField, ChannelType } = require('discord.js');
const { setupRolesChannelMessage, verifyChannelMessage } = require('./embeds');

// Create the thetaguard-config (private) and thetaguard-verify (public)
// channels in a newly joined guild and store their ids.
async function newGuild(client, guildId, repos) {
    try {
        console.log('Create new guild', guildId);
        const guild = await client.guilds.fetch(guildId);

        // private admin channel
        const configChannel = await guild.channels.create({
            name: 'thetaguard-config',
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.SendMessages,
                        PermissionsBitField.Flags.ReadMessageHistory,
                    ],
                },
            ],
        });
        await configChannel.send(setupRolesChannelMessage());

        // public verify channel
        const verifyChannel = await guild.channels.create({
            name: 'thetaguard-verify',
            type: ChannelType.GuildText,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionsBitField.Flags.SendMessages],
                },
            ],
        });
        await verifyChannel.send(verifyChannelMessage());

        await repos.guilds.add({
            guildId: guildId,
            verifyChannelId: verifyChannel.id,
            configChannelId: configChannel.id,
        }).catch((e) => {
            console.log(e);
        });
    } catch (e) {
        console.log('Error adding new Guild', e);
    }
}

// Re-send the pinned setup message in the private config channel (used when
// the original message was deleted).
async function resendMessage(message, repos) {
    const guild = await repos.guilds.get(message.guildId);
    if (message.channel.id !== guild[0].configChannelId) return;
    await message.channel.send(setupRolesChannelMessage());
}

function registerBotEvents(client, { repos, requestStore, interactions, fullSync, syncIntervalMs }) {
    client.once('ready', () => {
        setInterval(() => fullSync.run(), syncIntervalMs);
    });

    client.on('guildCreate', (guild) => {
        newGuild(client, guild.id, repos).catch(() => {});
    });

    client.on('guildDelete', async (guild) => {
        console.log(`${client.user.username} was kicked from ${guild.id}.`);
        // the FK cascade removes the guild's roles rows
        await repos.guilds.delete(guild.id);
        requestStore.deleteByGuild(guild.id);
    });

    client.on('interactionCreate', (interaction) => {
        if (!interaction.isButton()) return;

        if (interaction.customId === 'letsgo') {
            interactions.letsGoButton(interaction);
        }
        if (interaction.customId === 'setupRoles') {
            interactions.setupRolesButton(interaction);
        }
    });

    client.on('messageCreate', (message) => {
        // Ignore messages sent by a bot
        if (message.author.bot) return;

        if (message.content.trim() === '!reload') {
            resendMessage(message, repos).catch((e) => {
                console.log('Error resending setup message', e);
            });
        }
    });
}

module.exports = { registerBotEvents, newGuild, resendMessage };
