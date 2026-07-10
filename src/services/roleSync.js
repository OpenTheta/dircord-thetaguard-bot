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

function createRoleSync({ client, repos, openTheta }) {

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
        try {
            const guild = client.guilds.cache.get(role.guildId);
            if (!guild) {
                console.warn(`[setUserRole] Guild not found: ${role.guildId} for user ${userId}, role ${role.roleId}`);
                return;
            }

            const discordRole = guild.roles.cache.get(role.roleId);
            if (!discordRole) {
                console.warn(`[setUserRole] Role not found: ${role.roleId} in guild ${role.guildId} for user ${userId}`);
                return;
            }

            let member;
            try {
                member = await guild.members.fetch(userId);
            } catch (error) {
                if (error.code === 10007) {
                    // Unknown Member - user has left the guild
                    console.warn(`[setUserRole] Member not found (likely left guild): userId=${userId}, guildId=${role.guildId}, roleId=${role.roleId}`);
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
                    console.log(`[setUserRole] Role added: userId=${userId}, guildId=${role.guildId}, roleId=${role.roleId}`);
                    await member.roles.add(discordRole);
                }
            } else {
                if (member.roles.cache.has(discordRole.id)) {
                    console.log(`[setUserRole] Role removed: userId=${userId}, guildId=${role.guildId}, roleId=${role.roleId}`);
                    await member.roles.remove(discordRole);
                }
            }
        } catch (error) {
            console.error(`[setUserRole] Error setting role: userId=${userId}, guildId=${role?.guildId}, roleId=${role?.roleId}`, error);
            throw error;
        }
    }

    // Re-evaluate every rule of a guild for one user (called after the user
    // connects or disconnects a wallet).
    async function setRolesForUser(userId, guildId) {
        try {
            const roles = await repos.roles.getByGuild(guildId);
            if (!roles || !Array.isArray(roles)) {
                console.warn(`[setRolesForUser] No roles found for guildId=${guildId}, userId=${userId}`);
                return;
            }

            const userRows = await repos.users.getUserGuild(userId, guildId);
            const wallets = userRows.map((row) => row.wallet);

            for (const role of roles) {
                try {
                    if (!role || !role.contract) {
                        console.warn(`[setRolesForUser] Invalid role data: roleId=${role?.roleId}, guildId=${guildId}, userId=${userId}`);
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
                        console.error(`[setRolesForUser] Error setting role: roleId=${role.roleId}, guildId=${guildId}, userId=${userId}`, e);
                    });
                } catch (roleError) {
                    // Continue processing other roles even if one fails
                    console.error(`[setRolesForUser] Error processing role: roleId=${role?.roleId}, guildId=${guildId}, userId=${userId}`, roleError);
                }
            }
        } catch (e) {
            console.error(`[setRolesForUser] Unexpected error: guildId=${guildId}, userId=${userId}`, e);
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
        try {
            const users = await repos.users.getInGuild(guildId);
            if (!users || !Array.isArray(users)) {
                console.warn(`[setRoleForGuildUsers] No users found for guildId=${guildId}, roleId=${roleId}`);
                return;
            }
            const formattedUsers = groupUsersByWallets(users);

            const role = await repos.roles.get(roleId);
            if (!role || !role[0]) {
                console.warn(`[setRoleForGuildUsers] Role not found: roleId=${roleId}, guildId=${guildId}`);
                return;
            }

            const guild = client.guilds.cache.get(guildId);
            if (!guild) {
                console.warn(`[setRoleForGuildUsers] Guild not found: guildId=${guildId}, roleId=${roleId}`);
                return;
            }

            try {
                await guild.members.fetch();
            } catch (fetchError) {
                console.error(`[setRoleForGuildUsers] Error fetching members: guildId=${guildId}, roleId=${roleId}`, fetchError);
            }

            const discordRole = guild.roles.cache.get(roleId);
            if (!discordRole) {
                console.warn(`[setRoleForGuildUsers] Discord role not found: roleId=${roleId}, guildId=${guildId}`);
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
                    console.error(`[setRoleForGuildUsers] Error processing user: userId=${user?.userId}, roleId=${roleId}, guildId=${guildId}`, userError);
                }
            }
        } catch (e) {
            console.error(`[setRoleForGuildUsers] Unexpected error: guildId=${guildId}, roleId=${roleId}`, e);
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
                    console.warn(`[setRolesForUsers] Invalid role data for roleId=${key}`);
                    continue;
                }

                const owners = await openTheta.fetchOwners(role.contract, role.include_market);
                if (!owners) {
                    // Ownership unknown — skip rather than strip roles based
                    // on a failed API call.
                    continue;
                }

                if (!role.users || !Array.isArray(role.users)) {
                    console.warn(`[setRolesForUsers] No users array for roleId=${key}, guildId=${role.guildId}`);
                    continue;
                }

                for (const user of role.users) {
                    try {
                        if (!user || !user.userId || !user.wallets) {
                            console.warn(`[setRolesForUsers] Invalid user data for roleId=${key}, guildId=${role.guildId}`);
                            continue;
                        }

                        const owner = mergeOwnersForWallets(owners, user.wallets);
                        await setUserRole(role, user.userId, owner);
                    } catch (userError) {
                        // Continue processing other users even if one fails
                        console.error(`[setRolesForUsers] Error processing user: userId=${user?.userId}, roleId=${key}, guildId=${role.guildId}`, userError);
                    }
                }
            }
        } catch (e) {
            console.error(`[setRolesForUsers] Unexpected error`, e);
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
