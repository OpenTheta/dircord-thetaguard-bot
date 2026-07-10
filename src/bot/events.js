const { PermissionsBitField, PermissionFlagsBits, ChannelType } = require('discord.js');
const { setupRolesChannelMessage, verifyChannelMessage } = require('./embeds');
const { logger } = require('../logger');

// Create the thetaguard-config (private) and thetaguard-verify (public)
// channels in a newly joined guild and store their ids.
async function newGuild(client, guildId, repos) {
    let guild;
    try {
        guild = await client.guilds.fetch(guildId);
    } catch (e) {
        logger.error({ guildId, err: e }, 'Could not fetch newly joined guild');
        return;
    }

    try {
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
        });
        logger.info({ guildId }, 'New guild set up');
    } catch (e) {
        logger.error({ guildId, err: e }, 'Error setting up new guild');
        // Most common cause: the bot is missing the Manage Channels
        // permission. Tell the guild owner instead of failing silently.
        try {
            const owner = await guild.fetchOwner();
            await owner.send(
                `Hi! ThetaGuard could not create its channels in "${guild.name}". ` +
                'Please make sure the bot has the "Manage Channels" and "Manage Roles" ' +
                'permissions, then kick and re-invite it to try again.'
            );
        } catch (dmError) {
            logger.warn({ guildId, err: dmError }, 'Could not DM the guild owner about the failed setup');
        }
    }
}

// /reload — re-send the pinned setup message in the private config channel
// (used when the original message was deleted).
async function handleReloadCommand(interaction, repos) {
    const guildRows = await repos.guilds.get(interaction.guildId);
    if (!guildRows[0]) {
        await interaction.reply({
            content: 'ThetaGuard is not set up in this server yet.',
            ephemeral: true,
        });
        return;
    }
    if (interaction.channelId !== guildRows[0].configChannelId) {
        await interaction.reply({
            content: 'Please run /reload inside the thetaguard-config channel.',
            ephemeral: true,
        });
        return;
    }
    await interaction.channel.send(setupRolesChannelMessage());
    await interaction.reply({ content: 'Setup message re-sent.', ephemeral: true });
}

async function registerSlashCommands(client) {
    await client.application.commands.create({
        name: 'reload',
        description: 'Re-send the ThetaGuard setup message in this channel',
        defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
        dmPermission: false,
    });
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
        registerSlashCommands(client).catch((e) => {
            logger.error({ err: e }, 'Failed to register slash commands');
        });
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
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'reload') {
                handleReloadCommand(interaction, repos).catch((e) => {
                    logger.error({ guildId: interaction.guildId, err: e }, 'Reload command failed');
                });
            }
            return;
        }

        if (!interaction.isButton()) return;

        if (interaction.customId === 'letsgo') {
            interactions.letsGoButton(interaction);
        }
        if (interaction.customId === 'setupRoles') {
            interactions.setupRolesButton(interaction);
        }
    });

    return {
        stop() {
            stopped = true;
            if (syncTimer) clearTimeout(syncTimer);
        },
    };
}

module.exports = { registerBotEvents, newGuild, handleReloadCommand, registerSlashCommands };
