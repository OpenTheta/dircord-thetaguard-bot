// Tests for the button interaction handlers and the /reload slash command:
// discriminator handling (Discord deprecated user#1234 tags), session
// registration, and the reload channel guard.

import { describe, it, expect } from 'vitest';
import { createInteractionHandlers, displayName } from '../../src/bot/interactions.js';
import { createRequestStore } from '../../src/services/requestStore.js';
import { handleReloadCommand } from '../../src/bot/events.js';

function makeInteraction({ discriminator = '1234' } = {}) {
    const replies = [];
    return {
        id: 'interaction-1',
        user: { id: 'u1', username: 'tester', discriminator },
        member: {
            guild: { name: 'Test Guild', id: 'g1' },
            displayAvatarURL: () => 'https://example.com/u.png',
        },
        guild: { iconURL: () => 'https://example.com/g.png' },
        message: { guildId: 'g1' },
        deferReply: async () => {},
        editReply: async (payload) => {
            replies.push(payload);
        },
        replies,
    };
}

describe('displayName', () => {
    it('keeps username#discriminator for legacy users', () => {
        expect(displayName({ username: 'tester', discriminator: '1234' })).toBe('tester#1234');
    });

    it('uses the plain username for migrated users (discriminator 0)', () => {
        expect(displayName({ username: 'tester', discriminator: '0' })).toBe('tester');
    });

    it('uses the plain username when discriminator is missing entirely', () => {
        expect(displayName({ username: 'tester' })).toBe('tester');
    });
});

describe('button handlers', () => {
    it('setupRolesButton registers an admin session and replies with the admin link', async () => {
        const requestStore = createRequestStore();
        const handlers = createInteractionHandlers({
            requestStore,
            verifyBaseUrl: 'https://verify.example/',
        });
        const interaction = makeInteraction();

        await handlers.setupRolesButton(interaction);

        const requestIds = Object.keys(requestStore.adminRequests);
        expect(requestIds).toHaveLength(1);
        const session = requestStore.adminRequests[requestIds[0]];
        expect(session).toMatchObject({
            name: 'tester#1234',
            guildId: 'g1',
            userId: 'u1',
        });

        expect(interaction.replies).toHaveLength(1);
        const buttonUrl = interaction.replies[0].components[0].components[0].data.url;
        expect(buttonUrl).toBe(`https://verify.example/admin/?requestId=${requestIds[0]}`);
    });

    it('letsGoButton registers a user session including the message to sign', async () => {
        const requestStore = createRequestStore();
        const handlers = createInteractionHandlers({
            requestStore,
            verifyBaseUrl: 'https://verify.example/',
        });
        const interaction = makeInteraction({ discriminator: '0' });

        await handlers.letsGoButton(interaction);

        const requestIds = Object.keys(requestStore.userRequests);
        expect(requestIds).toHaveLength(1);
        const session = requestStore.userRequests[requestIds[0]];
        expect(session.name).toBe('tester'); // migrated user, no #0 suffix
        expect(session.message).toContain('- User: tester\n');
        expect(session.message).toContain('- Community: Test Guild\n');

        const buttonUrl = interaction.replies[0].components[0].components[0].data.url;
        expect(buttonUrl).toBe(`https://verify.example/verify/?requestId=${requestIds[0]}`);
    });
});

describe('handleReloadCommand', () => {
    function makeCommandInteraction({ channelId }) {
        const sent = [];
        const replies = [];
        return {
            guildId: 'g1',
            channelId,
            channel: { send: async (payload) => sent.push(payload) },
            reply: async (payload) => replies.push(payload),
            sent,
            replies,
        };
    }

    const repos = {
        guilds: {
            get: async (guildId) =>
                guildId === 'g1'
                    ? [{ guildId: 'g1', verifyChannelId: 'verify-ch', configChannelId: 'config-ch' }]
                    : [],
        },
    };

    it('re-sends the setup message in the config channel', async () => {
        const interaction = makeCommandInteraction({ channelId: 'config-ch' });
        await handleReloadCommand(interaction, repos);

        expect(interaction.sent).toHaveLength(1);
        expect(interaction.sent[0].embeds[0].data.title).toBe('Setup Your Guild Roles');
        expect(interaction.replies[0]).toMatchObject({ ephemeral: true });
    });

    it('refuses to run outside the config channel', async () => {
        const interaction = makeCommandInteraction({ channelId: 'random-ch' });
        await handleReloadCommand(interaction, repos);

        expect(interaction.sent).toHaveLength(0);
        expect(interaction.replies[0].content).toMatch(/thetaguard-config/);
    });

    it('reports when the guild is not set up', async () => {
        const interaction = makeCommandInteraction({ channelId: 'config-ch' });
        interaction.guildId = 'unknown-guild';
        await handleReloadCommand(interaction, repos);

        expect(interaction.sent).toHaveLength(0);
        expect(interaction.replies[0].content).toMatch(/not set up/);
    });
});
