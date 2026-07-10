const { PermissionsBitField, ChannelType } = require('discord.js');
const { setupRolesChannelMessage, verifyChannelMessage } = require('./embeds');
const { logger } = require('../logger');

// Create the thetaguard-config (private) and thetaguard-verify (public)
// channels in a newly joined guild and store their ids.
async function newGuild(client, guildId, repos) {
    try {
        logger.info({ guildId }, 'Setting up new guild');
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
            logger.error({ guildId, err: e }, 'Failed to store new guild');
        });
    } catch (e) {
        logger.error({ guildId, err: e }, 'Error adding new guild');
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
    let syncTimer = null;
    let stopped = false;

    // Self-rescheduling timeout instead of setInterval: adds jitter so
    // restarts don't align the sync across processes, and a slow pass delays
    // the next one instead of stacking.
    function scheduleSync() {
        if (stopped) return;
        const jitter = Math.floor(Math.random() * 30000);
        syncTimer = setTimeout(async () => {
            try {
                await fullSync.run();
            } catch (e) {
                logger.error({ err: e }, 'Full sync failed');
            }
            scheduleSync();
        }, syncIntervalMs + jitter);
    }

    client.once('ready', () => {
        logger.info({ user: client.user.tag }, 'Discord bot ready');
        scheduleSync();
    });

    client.on('guildCreate', (guild) => {
        newGuild(client, guild.id, repos).catch(() => {});
    });

    client.on('guildDelete', async (guild) => {
        logger.info({ guildId: guild.id }, 'Bot was removed from guild');
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
                logger.error({ guildId: message.guildId, err: e }, 'Error resending setup message');
            });
        }
    });

    return {
        stop() {
            stopped = true;
            if (syncTimer) clearTimeout(syncTimer);
        },
    };
}

module.exports = { registerBotEvents, newGuild, resendMessage };
