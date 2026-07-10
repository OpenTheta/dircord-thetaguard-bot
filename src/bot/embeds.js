const { EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');

const LOGO_URL = 'https://images.opentheta.io/creators/opentheta.jpg';
const FOOTER_TEXT = '**Make sure you sign the EXACT message and NEVER share your seed phrase or private key.**';
const DESCRIPTION = 'You should expect to sign the following message when prompted by a non-custodial wallet such as MetaMask:';

const FALLBACK_GUILD_ICON = 'https://img.freepik.com/free-psd/discord-logo-3d-social-media-icon-isolated_47987-11941.jpg?w=1380&t=st=1678739624~exp=1678740224~hmac=fed9154bbfdde3e8b96ffa1a800c7264377f5d55da20778b6a0b88cc7c19e9e5';
const FALLBACK_USER_ICON = 'https://ia803204.us.archive.org/4/items/discordprofilepictures/discordgreen.png';

const SETUP_INSTRUCTIONS =
    '1. Create the Roles that you want to connect to tokens\n' +
    '2. Follow the link below to setup the rules for each role\n\n' +
    'You can set:\n' +
    '- NFT contract\n' +
    '- Amount of tokens (min & max)\n' +
    '- Trait that the NFT needs to have';

function docsButton() {
    return new ButtonBuilder()
        .setLabel('Docs')
        .setStyle('Link')
        .setURL('https://opentheta.io');
}

// The pinned message in the private thetaguard-config channel (sent on guild
// join and re-sent by the !reload command).
function setupRolesChannelMessage() {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel('Setup Roles!')
                .setCustomId('setupRoles')
                .setStyle('Primary')
        )
        .addComponents(docsButton());

    return {
        embeds: [
            new EmbedBuilder()
                .setThumbnail(LOGO_URL)
                .setTitle('Setup Your Guild Roles')
                .setColor('#0F52BA')
                .setDescription(
                    '** Keep this channel private, because everyone that has access can setup new roles!\n' +
                    SETUP_INSTRUCTIONS
                ),
        ],
        components: [row],
    };
}

// The pinned message in the public thetaguard-verify channel.
function verifyChannelMessage() {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel("Let's Go!")
                .setCustomId('letsgo')
                .setStyle('Primary')
        )
        .addComponents(docsButton());

    return {
        embeds: [
            new EmbedBuilder()
                .setThumbnail(LOGO_URL)
                .setTitle('Verify your Assets')
                .setColor('#0F52BA')
                .setDescription('This is a read-only connection. Do not share your private keys. We will never ask for your seed phrase or DM you.'),
        ],
        components: [row],
    };
}

// Ephemeral reply with the personal admin link for the role-setup frontend.
function adminLinkReply(guildId, userId, requestUrl) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Setup Roles!').setStyle('Link').setURL(requestUrl)
    );

    return {
        content: `Use this custom link to connect (valid for 5 minutes) \nGuild: ${guildId} Member: ${userId}`,
        embeds: [
            new EmbedBuilder()
                .setThumbnail(LOGO_URL)
                .setTitle('Please read instructions carefully before getting started:')
                .setColor('#FF132B')
                .setDescription(SETUP_INSTRUCTIONS),
        ],
        components: [row],
        ephemeral: true,
    };
}

// Ephemeral reply with the personal verification link and the message the
// user is expected to sign.
function verifyLinkReply(guildId, userId, message, requestUrl) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setLabel('Verify').setStyle('Link').setURL(requestUrl)
    );

    return {
        content: `Use this custom link to connect (valid for 20 minutes) \nGuild: ${guildId} Member: ${userId}`,
        embeds: [
            new EmbedBuilder()
                .setThumbnail(LOGO_URL)
                .setTitle('Please read instructions carefully before connecting')
                .setColor('#FF132B')
                .setDescription(DESCRIPTION + '```' + message + '```' + FOOTER_TEXT),
        ],
        components: [row],
        ephemeral: true,
    };
}

module.exports = {
    LOGO_URL,
    FALLBACK_GUILD_ICON,
    FALLBACK_USER_ICON,
    setupRolesChannelMessage,
    verifyChannelMessage,
    adminLinkReply,
    verifyLinkReply,
};
