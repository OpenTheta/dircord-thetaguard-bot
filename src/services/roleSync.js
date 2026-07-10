// Role synchronization: decides which Discord roles a user is entitled to
// based on NFT ownership (fetched from the OpenTheta API) and the per-guild
// role rules stored in the database, then applies adds/removals through the
// Discord client. This encodes the product's core business rules:
//
// - a rule matches when the user owns between min_amount and max_amount
//   tokens of the rule's contract (max_amount null = unbounded)
// - when trait_type/trait_value are set, only tokens with that trait count
// - a user's ownership is the merged ownership of ALL wallets they have
//   connected to the guild
//
// All Discord role mutations go through a small bounded queue so overlapping
// syncs can't fire unbounded parallel writes.

const { createTaskQueue } = require('./taskQueue');
const { logger } = require('../logger');

function createRoleSync({ client, repos, openTheta, mutationConcurrency = 3 }) {
    const mutationQueue = createTaskQueue({ concurrency: mutationConcurrency });

    // Merge the ownership records of all of a user's wallets into a single
    // owner object. Returns undefined when none of the wallets own anything.
    // Always builds a fresh object — the entries in `owners` are shared
    // across users within one sync pass and must never be mutated.
    function mergeOwnersForWallets(owners, wallets) {
        let merged;
        for (const wallet of wallets) {
            if (!wallet) continue;
            const match = owners.find(
                (owner) => owner.address.toLowerCase() === wallet.toLowerCase()
            );
            if (!match) continue;
            if (!merged) {
                merged = { ...match, attributes: { ...(match.attributes || {}) } };
            } else {
                merged.ownedAmount += match.ownedAmount;
                Object.keys(match.attributes || {}).forEach((key) => {
                    if (merged.attributes[key]) {
                        merged.attributes[key] = [...merged.attributes[key], ...match.attributes[key]];
                    } else {
                        merged.attributes[key] = match.attributes[key];
                    }
                });
            }
        }
        return merged;
    }

    // Apply a single rule to a single user: add the Discord role when the
    // user's (merged) ownership satisfies the rule, remove it when not.
    // userData undefined means "owns nothing" and always removes.
    async function setUserRole(role, userId, userData) {
        const ctx = { userId, guildId: role?.guildId, roleId: role?.roleId };
        try {
            const guild = client.guilds.cache.get(role.guildId);
            if (!guild) {
                logger.warn(ctx, '[setUserRole] Guild not found');
                return;
            }

            const discordRole = guild.roles.cache.get(role.roleId);
            if (!discordRole) {
                logger.warn(ctx, '[setUserRole] Role not found');
                return;
            }

            let member;
            try {
                member = await guild.members.fetch(userId);
            } catch (error) {
                if (error.code === 10007) {
                    // Unknown Member - user has left the guild
                    logger.warn(ctx, '[setUserRole] Member not found (likely left guild)');
                    return;
                }
                throw error;
            }

            let eligible = false;
            if (userData && userData.ownedAmount >= role.min_amount &&
                (role.max_amount === null || userData.ownedAmount <= role.max_amount)) {
                if (role.trait_type && role.trait_value) {
                    // only tokens with the configured trait count
                    const values = (userData.attributes && userData.attributes[role.trait_type]) || [];
                    const traitOccurrences = values.filter((value) => value === role.trait_value).length;
                    eligible = traitOccurrences >= role.min_amount &&
                        (role.max_amount === null || traitOccurrences <= role.max_amount);
                } else {
                    eligible = true;
                }
            }

            if (eligible) {
                if (!member.roles.cache.has(discordRole.id)) {
                    logger.info(ctx, '[setUserRole] Role added');
                    await mutationQueue.add(() => member.roles.add(discordRole));
                }
            } else {
                if (member.roles.cache.has(discordRole.id)) {
                    logger.info(ctx, '[setUserRole] Role removed');
                    await mutationQueue.add(() => member.roles.remove(discordRole));
                }
            }
        } catch (error) {
            logger.error({ ...ctx, err: error }, '[setUserRole] Error setting role');
            throw error;
        }
    }

    // Re-evaluate every rule of a guild for one user (called after the user
    // connects or disconnects a wallet).
    async function setRolesForUser(userId, guildId) {
        const ctx = { userId, guildId };
        try {
            const roles = await repos.roles.getByGuild(guildId);
            if (!roles || !Array.isArray(roles)) {
                logger.warn(ctx, '[setRolesForUser] No roles found');
                return;
            }

            const userRows = await repos.users.getUserGuild(userId, guildId);
            const wallets = userRows.map((row) => row.wallet);

            for (const role of roles) {
                try {
                    if (!role || !role.contract) {
                        logger.warn({ ...ctx, roleId: role?.roleId }, '[setRolesForUser] Invalid role data');
                        continue;
                    }

                    let owner;
                    if (wallets.length > 0) {
                        const owners = await openTheta.fetchOwners(role.contract, role.include_market);
                        if (owners) {
                            owner = mergeOwnersForWallets(owners, wallets);
                        }
                    }

                    await setUserRole(role, userId, owner).catch((e) => {
                        logger.error({ ...ctx, roleId: role.roleId, err: e }, '[setRolesForUser] Error setting role');
                    });
                } catch (roleError) {
                    // Continue processing other roles even if one fails
                    logger.error({ ...ctx, roleId: role?.roleId, err: roleError }, '[setRolesForUser] Error processing role');
                }
            }
        } catch (e) {
            logger.error({ ...ctx, err: e }, '[setRolesForUser] Unexpected error');
        }
    }

    // Group the user rows of a guild (one row per connected wallet) into one
    // entry per user with all their wallets.
    function groupUsersByWallets(users) {
        const formattedUsers = [];
        users.forEach((user) => {
            if (!user || !user.userId || !user.wallet) return;

            const existingUser = formattedUsers.find((u) => u.userId === user.userId);
            if (existingUser) {
                existingUser.wallets.push(user.wallet);
            } else {
                formattedUsers.push({
                    id: user.id,
                    userId: user.userId,
                    guildId: user.guildId,
                    wallets: [user.wallet],
                });
            }
        });
        return formattedUsers;
    }

    // Re-evaluate one rule for every connected user of a guild (called after
    // an admin creates, updates, or deletes the rule).
    async function setRoleForGuildUsers(guildId, roleId) {
        const ctx = { guildId, roleId };
        try {
            const users = await repos.users.getInGuild(guildId);
            if (!users || !Array.isArray(users)) {
                logger.warn(ctx, '[setRoleForGuildUsers] No users found');
                return;
            }
            const formattedUsers = groupUsersByWallets(users);

            const role = await repos.roles.get(roleId);
            if (!role || !role[0]) {
                logger.warn(ctx, '[setRoleForGuildUsers] Role not found');
                return;
            }

            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                logger.warn(ctx, '[setRoleForGuildUsers] Guild not found');
                return;
            }

            try {
                await guild.members.fetch();
            } catch (fetchError) {
                logger.error({ ...ctx, err: fetchError }, '[setRoleForGuildUsers] Error fetching members');
            }

            const discordRole = guild.roles.cache.get(roleId);
            if (!discordRole) {
                logger.warn(ctx, '[setRoleForGuildUsers] Discord role not found');
                return;
            }

            let owners = null;
            if (role[0].contract) {
                owners = await openTheta.fetchOwners(role[0].contract, role[0].include_market);
            }

            for (const user of formattedUsers) {
                try {
                    const owner = owners ? mergeOwnersForWallets(owners, user.wallets) : undefined;
                    await setUserRole(role[0], user.userId, owner);
                } catch (userError) {
                    // Continue processing other users even if one fails
                    logger.error({ ...ctx, userId: user?.userId, err: userError }, '[setRoleForGuildUsers] Error processing user');
                }
            }
        } catch (e) {
            logger.error({ ...ctx, err: e }, '[setRoleForGuildUsers] Unexpected error');
        }
    }

    // Re-evaluate a batch of rules, each with its own user list (used by the
    // periodic full sync).
    async function setRolesForUsers(rolesToCheck) {
        try {
            const keys = Object.keys(rolesToCheck);
            for (const key of keys) {
                const role = rolesToCheck[key];
                if (!role || !role.contract) {
                    logger.warn({ roleId: key }, '[setRolesForUsers] Invalid role data');
                    continue;
                }
                const ctx = { roleId: key, guildId: role.guildId };

                const owners = await openTheta.fetchOwners(role.contract, role.include_market);
                if (!owners) {
                    // Ownership unknown — skip rather than strip roles based
                    // on a failed API call.
                    continue;
                }

                if (!role.users || !Array.isArray(role.users)) {
                    logger.warn(ctx, '[setRolesForUsers] No users array');
                    continue;
                }

                for (const user of role.users) {
                    try {
                        if (!user || !user.userId || !user.wallets) {
                            logger.warn(ctx, '[setRolesForUsers] Invalid user data');
                            continue;
                        }

                        const owner = mergeOwnersForWallets(owners, user.wallets);
                        await setUserRole(role, user.userId, owner);
                    } catch (userError) {
                        // Continue processing other users even if one fails
                        logger.error({ ...ctx, userId: user?.userId, err: userError }, '[setRolesForUsers] Error processing user');
                    }
                }
            }
        } catch (e) {
            logger.error({ err: e }, '[setRolesForUsers] Unexpected error');
        }
    }

    return {
        mergeOwnersForWallets,
        groupUsersByWallets,
        setUserRole,
        setRolesForUser,
        setRoleForGuildUsers,
        setRolesForUsers,
    };
}

module.exports = { createRoleSync };
