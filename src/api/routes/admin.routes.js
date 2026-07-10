const express = require('express');
const { handleErrors } = require('../middleware');
const { logger } = require('../../logger');

// Admin (role-setup) endpoints. Paths, response shapes, status codes, and
// error strings are a fixed contract with the frontend — pinned by
// tests/contract/admin-endpoints.test.js.
function createAdminRoutes({ client, repos, requestStore, roleSync }) {
    const router = express.Router();
    const { adminRequests } = requestStore;

    // Roles the bot can actually assign: below the bot's own highest role,
    // not @everyone, not managed by an integration.
    async function assignableRoles(guildId) {
        const guild = client.guilds.cache.get(guildId);
        const allRoles = await guild.roles.fetch();
        const botMember = await guild.members.fetch(client.user.id);
        const botRolePosition = botMember.roles.highest.position;
        return allRoles.filter(
            (role) => role.position < botRolePosition && role.name !== '@everyone' && !role.tags
        );
    }

    // Build the session + current configuration payload the frontend renders.
    // Works on a copy so the response never leaks back into the stored
    // session object.
    async function sessionWithRoles(requestId) {
        const data = { ...adminRequests[requestId] };
        data.setRoles = await repos.roles.getByGuild(data.guildId);
        data.allRoles = await assignableRoles(data.guildId);
        return data;
    }

    router.get('/myserver/:requestId', async (req, res) => {
        const { requestId } = req.params;

        try {
            requestStore.removeExpired(requestId);
            requestStore.removeAllExpired();
            if (adminRequests[requestId]) {
                res.json(await sessionWithRoles(requestId));
            } else {
                res.status(404);
                res.json({ error: 'requestId does not exists' });
            }
        } catch (error) {
            handleErrors(res, error);
        }
    });

    router.post('/newrole', async (req, res) => {
        const data = req.body;

        try {
            requestStore.removeExpired(data.requestId);
            if (adminRequests[data.requestId]) {
                const newRole = {
                    roleId: data.roleId,
                    roleName: data.roleName,
                    contract: data.contract,
                    min_amount: data.min_amount,
                    max_amount: data.max_amount,
                    trait_type: data.trait_type,
                    trait_value: data.trait_value,
                    include_market: data.include_market,
                    guildId: adminRequests[data.requestId].guildId,
                };
                if ((await repos.roles.get(newRole.roleId)).length) {
                    await repos.roles.update(newRole);
                } else {
                    await repos.roles.add(newRole);
                }
                roleSync.setRoleForGuildUsers(newRole.guildId, newRole.roleId).catch((e) => {
                    logger.error({ err: e, guildId: newRole.guildId, roleId: newRole.roleId }, 'Role sync after /newrole failed');
                });
                res.json(await sessionWithRoles(data.requestId));
            } else {
                res.status(404);
                res.json({ error: 'requestId does not exists' });
            }
        } catch (error) {
            handleErrors(res, error);
        }
    });

    router.post('/deleterole', async (req, res) => {
        const data = req.body;

        try {
            requestStore.removeExpired(data.requestId);
            if (adminRequests[data.requestId]) {
                if ((await repos.roles.get(data.roleId)).length) {
                    await repos.roles.delete(data.guildId, data.roleId);
                    roleSync.setRoleForGuildUsers(data.guildId, data.roleId).catch((e) => {
                        logger.error({ err: e, guildId: data.guildId, roleId: data.roleId }, 'Role sync after /deleterole failed');
                    });
                }
                res.json(await sessionWithRoles(data.requestId));
            } else {
                res.status(404);
                res.json({ error: 'requestId does not exists' });
            }
        } catch (error) {
            handleErrors(res, error);
        }
    });

    return router;
}

module.exports = { createAdminRoutes };
