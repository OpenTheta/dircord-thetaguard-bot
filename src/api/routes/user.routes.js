const express = require('express');
const { recoverSigner } = require('../../services/verification');
const { handleErrors } = require('../middleware');

// User-facing verification endpoints. The paths, response shapes, status
// codes, and error strings are a fixed contract with the frontend — pinned by
// tests/contract/user-endpoints.test.js. Note that GET /:requestId is a
// root-level catch-all: this router must be mounted last.
function createUserRoutes({ repos, requestStore, roleSync }) {
    const router = express.Router();
    const { userRequests } = requestStore;

    router.post('/signed', async (req, res) => {
        try {
            const data = req.body;
            const signerAddr = recoverSigner(userRequests[data.requestId].message, data.signature);
            if (signerAddr === data.address) {
                await repos.wallets.add({
                    wallet: data.address,
                    userId: userRequests[data.requestId].userId,
                    thetadrop: data.thetadrop,
                });

                const userWallets = await repos.wallets.getByUser(
                    userRequests[data.requestId].userId
                );
                res.send(userWallets);
            } else {
                res.status(400).send('Wrong signature');
            }
        } catch (error) {
            handleErrors(res, error, 'Error verifying signature');
        }
    });

    router.post('/verifyserver', async (req, res) => {
        const data = req.body;

        try {
            requestStore.removeExpired(data.requestId);
            if (userRequests[data.requestId]) {
                // check if user owns the wallet
                const wallets = await repos.wallets.getByUser(data.userId);
                if (wallets.some((w) => w.wallet === data.wallet) &&
                    userRequests[data.requestId].userId === data.userId) {
                    const user = {
                        userId: data.userId,
                        guildId: userRequests[data.requestId].guildId,
                        wallet: data.wallet,
                        thetadrop: data.thetadrop,
                    };
                    await repos.users.upsert(user);
                    roleSync.setRolesForUser(data.userId, user.guildId).catch((e) => {
                        console.log('Error', e);
                    });
                    res.json(user);
                } else {
                    res.status(404);
                    res.json({ error: 'invalid wallet' });
                }
            } else {
                res.status(404);
                res.json({ error: 'requestId does not exists' });
            }
        } catch (error) {
            handleErrors(res, error);
        }
    });

    router.post('/disconnect', async (req, res) => {
        const data = req.body;
        try {
            requestStore.removeExpired(data.requestId);
            if (userRequests[data.requestId]) {
                if (userRequests[data.requestId].userId === data.userId) {
                    const connections = await repos.users.getUserGuild(data.userId, data.guildId);
                    if ((connections[0] && connections[0].wallet === data.wallet) ||
                        (connections[1] && connections[1].wallet === data.wallet)) {
                        repos.users.delete(data.userId, data.guildId, data.thetadrop)
                            .then(() => {
                                roleSync.setRolesForUser(data.userId, data.guildId);
                                res.json({ success: 'disconnected wallet' });
                            })
                            .catch((e) => {
                                console.log('Error', e);
                                res.status(404);
                                res.json({ error: 'Disconnecting error' });
                            });
                    } else {
                        res.status(404);
                        res.json({ error: 'Invalid wallet' });
                    }
                } else {
                    res.status(404);
                    res.json({ error: 'Invalid userId' });
                }
            } else {
                res.status(404);
                res.json({ error: 'requestId does not exists' });
            }
        } catch (error) {
            handleErrors(res, error);
        }
    });

    router.get('/:requestId', async (req, res) => {
        try {
            const { requestId } = req.params;
            requestStore.removeExpired(requestId);
            if (userRequests[requestId]) {
                const data = { ...userRequests[requestId], requestId };
                data.wallets = await repos.wallets.getByUser(data.userId);

                const servers = await repos.users.getGuilds(data.userId);
                data.setWalletMM = '';
                data.setWalletTD = '';

                for (const server of servers) {
                    if (server.guildId === data.guildId) {
                        if (server.thetadrop) {
                            data.setWalletTD = server.wallet;
                        } else {
                            data.setWalletMM = server.wallet;
                        }
                        data.wallets = data.wallets.filter(
                            (obj) => obj.wallet !== server.wallet
                        );
                    }
                }
                res.json(data);
            } else {
                res.status(404).json({ error: 'requestId does not exist' });
            }
        } catch (error) {
            handleErrors(res, error);
        }
    });

    return router;
}

module.exports = { createUserRoutes };
