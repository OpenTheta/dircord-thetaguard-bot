const wait = require('node:timers/promises').setTimeout;
const { generateRequestId, buildSignMessage } = require('../services/verification');
const { FALLBACK_GUILD_ICON, FALLBACK_USER_ICON, adminLinkReply, verifyLinkReply } = require('./embeds');

// Button handlers for the two pinned channel messages. Each click registers a
// short-lived session in the request store and replies with a personal link
// into the frontend, which then talks to our HTTP API using the requestId.
// Discord deprecated discriminators; migrated users report '0' and are
// displayed by plain username. Legacy users keep the username#1234 format
// (this name appears in the message the user signs, so it must stay stable
// for a given user).
function displayName(user) {
    return user.discriminator && user.discriminator !== '0'
        ? `${user.username}#${user.discriminator}`
        : user.username;
}

function createInteractionHandlers({ requestStore, verifyBaseUrl }) {

    function sessionBasics(interaction) {
        return {
            name: displayName(interaction.user),
            timestamp: new Date().getTime(),
            interactionId: interaction.id,
            community: interaction.member.guild.name,
            guildId: interaction.member.guild.id,
            userId: interaction.user.id,
            guildIcon: interaction.guild.iconURL() ?? FALLBACK_GUILD_ICON,
            userIcon: interaction.member.displayAvatarURL() ?? FALLBACK_USER_ICON,
        };
    }

    // "Setup Roles!" button in the private config channel -> admin session.
    async function setupRolesButton(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const session = sessionBasics(interaction);
        const requestId = generateRequestId();
        requestStore.addAdminRequest(requestId, session);

        await interaction.editReply(
            adminLinkReply(
                interaction.message.guildId,
                interaction.user.id,
                verifyBaseUrl + 'admin/?requestId=' + requestId
            )
        );
    }

    // "Let's Go!" button in the public verify channel -> user session.
    async function letsGoButton(interaction) {
        await interaction.deferReply({ ephemeral: true });
        await wait(500);

        const session = sessionBasics(interaction);
        session.message = buildSignMessage(
            session.community,
            session.name,
            session.interactionId,
            session.timestamp
        );
        const requestId = generateRequestId();
        requestStore.addUserRequest(requestId, session);

        await interaction.editReply(
            verifyLinkReply(
                interaction.message.guildId,
                interaction.user.id,
                session.message,
                verifyBaseUrl + 'verify/?requestId=' + requestId
            )
        );
    }

    return { setupRolesButton, letsGoButton };
}

module.exports = { createInteractionHandlers, displayName };
