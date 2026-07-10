// Unit tests for the role-eligibility business rules in services/roleSync:
// min/max amounts, trait matching, multi-wallet ownership merging, and the
// add/remove decisions against Discord.

import { describe, it, expect, beforeEach } from 'vitest';
import { createRoleSync } from '../../src/services/roleSync.js';

const GUILD_ID = 'guild-1';
const ROLE_ID = 'role-1';
const USER_ID = 'user-1';

function makeRole(overrides = {}) {
    return {
        roleId: ROLE_ID,
        roleName: 'Holder',
        contract: '0xcontract',
        min_amount: 1,
        max_amount: null,
        trait_type: null,
        trait_value: null,
        include_market: 0,
        guildId: GUILD_ID,
        ...overrides,
    };
}

// Fake Discord client that records role add/remove calls per member.
function makeFakeDiscord({ memberHasRole = false, memberExists = true } = {}) {
    const actions = { added: [], removed: [] };
    const discordRole = { id: ROLE_ID };
    const member = {
        roles: {
            cache: { has: (id) => memberHasRole && id === ROLE_ID },
            add: async (role) => actions.added.push(role.id),
            remove: async (role) => actions.removed.push(role.id),
        },
    };
    const guild = {
        roles: { cache: { get: (id) => (id === ROLE_ID ? discordRole : undefined) } },
        members: {
            fetch: async () => {
                if (!memberExists) {
                    const error = new Error('Unknown Member');
                    error.code = 10007;
                    throw error;
                }
                return member;
            },
        },
    };
    const client = { guilds: { cache: { get: () => guild } } };
    return { client, actions };
}

function makeRoleSync(discord) {
    // repos and openTheta are unused by setUserRole/mergeOwnersForWallets
    return createRoleSync({ client: discord.client, repos: {}, openTheta: {} });
}

describe('setUserRole — amount rules', () => {
    let discord;
    beforeEach(() => {
        discord = makeFakeDiscord();
    });

    it('adds the role when ownedAmount meets min_amount', async () => {
        const roleSync = makeRoleSync(discord);
        await roleSync.setUserRole(makeRole({ min_amount: 2 }), USER_ID, { ownedAmount: 2 });
        expect(discord.actions.added).toEqual([ROLE_ID]);
        expect(discord.actions.removed).toEqual([]);
    });

    it('does not add the role below min_amount', async () => {
        const roleSync = makeRoleSync(discord);
        await roleSync.setUserRole(makeRole({ min_amount: 3 }), USER_ID, { ownedAmount: 2 });
        expect(discord.actions.added).toEqual([]);
    });

    it('treats max_amount null as unbounded', async () => {
        const roleSync = makeRoleSync(discord);
        await roleSync.setUserRole(makeRole({ max_amount: null }), USER_ID, { ownedAmount: 9999 });
        expect(discord.actions.added).toEqual([ROLE_ID]);
    });

    it('does not add the role above max_amount', async () => {
        const roleSync = makeRoleSync(discord);
        await roleSync.setUserRole(makeRole({ max_amount: 5 }), USER_ID, { ownedAmount: 6 });
        expect(discord.actions.added).toEqual([]);
    });

    it('removes the role from an ineligible member who has it', async () => {
        discord = makeFakeDiscord({ memberHasRole: true });
        const roleSync = makeRoleSync(discord);
        await roleSync.setUserRole(makeRole(), USER_ID, undefined);
        expect(discord.actions.removed).toEqual([ROLE_ID]);
    });

    it('does not re-add the role when the member already has it', async () => {
        discord = makeFakeDiscord({ memberHasRole: true });
        const roleSync = makeRoleSync(discord);
        await roleSync.setUserRole(makeRole(), USER_ID, { ownedAmount: 1 });
        expect(discord.actions.added).toEqual([]);
        expect(discord.actions.removed).toEqual([]);
    });

    it('ignores members who have left the guild', async () => {
        discord = makeFakeDiscord({ memberExists: false });
        const roleSync = makeRoleSync(discord);
        await expect(
            roleSync.setUserRole(makeRole(), USER_ID, { ownedAmount: 1 })
        ).resolves.toBeUndefined();
        expect(discord.actions.added).toEqual([]);
    });
});

describe('setUserRole — trait rules', () => {
    it('adds the role when enough tokens have the configured trait', async () => {
        const discord = makeFakeDiscord();
        const roleSync = makeRoleSync(discord);
        const role = makeRole({ trait_type: 'Fur', trait_value: 'Gold', min_amount: 2 });
        await roleSync.setUserRole(role, USER_ID, {
            ownedAmount: 3,
            attributes: { Fur: ['Gold', 'Gold', 'Brown'] },
        });
        expect(discord.actions.added).toEqual([ROLE_ID]);
    });

    it('removes the role when too few tokens have the trait', async () => {
        const discord = makeFakeDiscord({ memberHasRole: true });
        const roleSync = makeRoleSync(discord);
        const role = makeRole({ trait_type: 'Fur', trait_value: 'Gold', min_amount: 2 });
        await roleSync.setUserRole(role, USER_ID, {
            ownedAmount: 3,
            attributes: { Fur: ['Gold', 'Brown', 'Brown'] },
        });
        expect(discord.actions.removed).toEqual([ROLE_ID]);
    });

    it('removes the role when the trait type is missing entirely', async () => {
        const discord = makeFakeDiscord({ memberHasRole: true });
        const roleSync = makeRoleSync(discord);
        const role = makeRole({ trait_type: 'Fur', trait_value: 'Gold' });
        await roleSync.setUserRole(role, USER_ID, {
            ownedAmount: 3,
            attributes: { Background: ['Blue'] },
        });
        expect(discord.actions.removed).toEqual([ROLE_ID]);
    });

    it('applies max_amount to the trait count', async () => {
        const discord = makeFakeDiscord();
        const roleSync = makeRoleSync(discord);
        const role = makeRole({ trait_type: 'Fur', trait_value: 'Gold', min_amount: 1, max_amount: 2 });
        await roleSync.setUserRole(role, USER_ID, {
            ownedAmount: 3,
            attributes: { Fur: ['Gold', 'Gold', 'Gold'] },
        });
        expect(discord.actions.added).toEqual([]);
    });
});

describe('mergeOwnersForWallets', () => {
    const discord = makeFakeDiscord();
    const roleSync = makeRoleSync(discord);

    const owners = [
        { address: '0xAAA', ownedAmount: 2, attributes: { Fur: ['Gold'] } },
        { address: '0xBBB', ownedAmount: 3, attributes: { Fur: ['Brown'], Hat: ['Cap'] } },
        { address: '0xCCC', ownedAmount: 1, attributes: {} },
    ];

    it('returns undefined when no wallet owns anything', () => {
        expect(roleSync.mergeOwnersForWallets(owners, ['0xZZZ'])).toBeUndefined();
    });

    it('returns the single owner record for one matching wallet', () => {
        const merged = roleSync.mergeOwnersForWallets(owners, ['0xAAA']);
        expect(merged.ownedAmount).toBe(2);
        expect(merged.attributes).toEqual({ Fur: ['Gold'] });
    });

    it('matches wallet addresses case-insensitively', () => {
        const merged = roleSync.mergeOwnersForWallets(owners, ['0xaaa']);
        expect(merged.ownedAmount).toBe(2);
    });

    it('sums amounts and merges attributes across wallets', () => {
        const merged = roleSync.mergeOwnersForWallets(owners, ['0xAAA', '0xBBB']);
        expect(merged.ownedAmount).toBe(5);
        expect(merged.attributes).toEqual({ Fur: ['Gold', 'Brown'], Hat: ['Cap'] });
    });

    it('never mutates the shared owners array', () => {
        const before = JSON.parse(JSON.stringify(owners));
        roleSync.mergeOwnersForWallets(owners, ['0xAAA', '0xBBB', '0xCCC']);
        expect(owners).toEqual(before);
    });
});

describe('groupUsersByWallets', () => {
    const discord = makeFakeDiscord();
    const roleSync = makeRoleSync(discord);

    it('groups multiple wallet rows of the same user', () => {
        const rows = [
            { id: 1, userId: 'u1', guildId: GUILD_ID, wallet: '0xAAA' },
            { id: 2, userId: 'u1', guildId: GUILD_ID, wallet: '0xBBB' },
            { id: 3, userId: 'u2', guildId: GUILD_ID, wallet: '0xCCC' },
        ];
        expect(roleSync.groupUsersByWallets(rows)).toEqual([
            { id: 1, userId: 'u1', guildId: GUILD_ID, wallets: ['0xAAA', '0xBBB'] },
            { id: 3, userId: 'u2', guildId: GUILD_ID, wallets: ['0xCCC'] },
        ]);
    });

    it('skips rows without a wallet', () => {
        const rows = [{ id: 1, userId: 'u1', guildId: GUILD_ID, wallet: null }];
        expect(roleSync.groupUsersByWallets(rows)).toEqual([]);
    });
});
