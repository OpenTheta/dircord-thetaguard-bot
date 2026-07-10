const express = require("express");
const database = require("./../models/dbHelpers");
const { checkAllExpiredRequests, removeExpiredRequests, setRoleForGuildUsers, setRolesForUser } = require("./discord-bot");
const { USER_REQUESTS, ADMIN_REQUESTS } = require("./Config");
const bodyParser = require("body-parser");
const { ethers } = require("ethers");

// server setup
const server = express();
server.use(express.json());
server.use(bodyParser.json());
server.use(bodyParser.urlencoded({ extended: false }));
server.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
    );
    next();
});

const handleErrors = (res, error, message) => {
    console.log("Error:", error);
    res.status(500).json({ error: message || "Internal server error" });
};

server.get("/:requestId", async (req, res) => {
    try {
        let { requestId } = req.params;
        removeExpiredRequests(requestId);
        if (USER_REQUESTS[requestId]) {
            let data = { ...USER_REQUESTS[requestId], requestId };
            data.wallets = await database.getUserWallets(data.userId);

            let servers = await database.getUserGuilds(data.userId);
            data.setWalletMM = "";
            data.setWalletTD = "";

            for (let server of servers) {
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
            res.status(404).json({ error: "requestId does not exist" });
        }
    } catch (error) {
        handleErrors(res, error);
    }
});

server.post("/signed", async (req, res) => {
    try {
        let data = req.body;
        const signerAddr = ethers.verifyMessage(
            USER_REQUESTS[data.requestId].message,
            data.signature
        );
        if (signerAddr === data.address) {
            await database.addWallet({
                wallet: data.address,
                userId: USER_REQUESTS[data.requestId].userId,
                thetadrop: data.thetadrop,
            });

            let userWallets = await database.getUserWallets(
                USER_REQUESTS[data.requestId].userId
            );
            res.send(userWallets);
        } else {
            res.status(400).send("Wrong signature");
        }
    } catch (error) {
        handleErrors(res, error, "Error verifying signature");
    }
});

server.post('/verifyserver', async (req, res) => {
    let data = req.body;

    try {
        removeExpiredRequests(data.requestId);
        if(USER_REQUESTS[data.requestId]) {
            // check if user owns the wallet
            let wallets = await database.getUserWallets(data.userId)
            if(wallets.some(w => w.wallet === data.wallet) && USER_REQUESTS[data.requestId].userId === data.userId) {
                let user = {
                    userId: data.userId,
                    guildId: USER_REQUESTS[data.requestId].guildId,
                    wallet: data.wallet,
                    thetadrop: data.thetadrop
                }
                await database.updateUserGuild(user)
                setRolesForUser(data.userId, USER_REQUESTS[data.requestId].guildId).catch(e => {console.log("Error", e)})
                res.json(user)
            } else {
                res.status(404);
                res.json({error: "invalid wallet"})
            }
        } else {
            res.status(404);
            res.json({error: "requestId does not exists"})
        }
    } catch (error) {
        handleErrors(res, error);
    }
});

server.post('/disconnect', async (req, res) => {
    let data = req.body;
    try {
        removeExpiredRequests(data.requestId);
        if(USER_REQUESTS[data.requestId]) {
            if(USER_REQUESTS[data.requestId].userId === data.userId) {
                let server = await database.getUserGuild(data.userId, data.guildId)
                if((server[0] && server[0].wallet === data.wallet) || (server[1] && server[1].wallet === data.wallet)) {
                    database.deleteUserGuild(data.userId, data.guildId, data.thetadrop)
                        .then(() => {
                            setRolesForUser(data.userId, data.guildId)
                            res.json({success: "disconnected wallet"})
                        }).catch((e) => {
                        console.log("Error", e)
                        res.status(404);
                        res.json({error: "Disconnecting error"})
                    })
                } else {
                    res.status(404);
                    res.json({error: "Invalid wallet"})
                }
            } else {
                res.status(404);
                res.json({error: "Invalid userId"})
            }
        } else {
            res.status(404);
            res.json({error: "requestId does not exists"})
        }
    } catch (error) {
        handleErrors(res, error);
    }
});

// Setup Roles

server.get('/myserver/:requestId', async (req, res) => {
    let {requestId} = req.params;

    try {
        removeExpiredRequests(requestId);
        checkAllExpiredRequests().catch((e) => console.log("ERROR: Check All Requests:", e));
        if(ADMIN_REQUESTS[requestId]) {
            // copy the session so the response payload never leaks back into
            // the stored request object
            let data = { ...ADMIN_REQUESTS[requestId] }
            data.setRoles = await database.getGuildRoles(data.guildId)
            let guild = await global.client.guilds.cache.get(data.guildId)
            let allRoles = await guild.roles.fetch()

            // Get the bot's member object in the guild
            const botMember = await guild.members.fetch(global.client.user.id);
            // Get the bot's highest role position
            const botRolePosition = botMember.roles.highest.position;
            data.allRoles = allRoles.filter(function(role) {
                return role.position < botRolePosition && role.name !== "@everyone" && !role.tags;
            })
            res.json(data)
        } else {
            res.status(404);
            res.json({error: "requestId does not exists"})
        }
    } catch (error) {
        handleErrors(res, error);
    }
});

server.post('/newrole', async (req, res) => {
    let data = req.body;

    try {
        removeExpiredRequests(data.requestId);
        if(ADMIN_REQUESTS[data.requestId]) {
            let newRole = {
                roleId: data.roleId,
                roleName: data.roleName,
                contract: data.contract,
                min_amount: data.min_amount,
                max_amount: data.max_amount,
                trait_type: data.trait_type,
                trait_value: data.trait_value,
                include_market: data.include_market,
                guildId: ADMIN_REQUESTS[data.requestId].guildId
            }
            if((await database.getGuildRole(newRole.roleId)).length) {
                await database.updateGuildRole(newRole)
            } else {
                await database.addGuildRole(newRole)
            }
            setRoleForGuildUsers(newRole.guildId, newRole.roleId).catch(e => {console.log("Error", e)})
            let result = { ...ADMIN_REQUESTS[data.requestId] }
            result.setRoles = await database.getGuildRoles(result.guildId)
            let guild = await global.client.guilds.cache.get(result.guildId)
            let allRoles = await guild.roles.fetch()
            result.allRoles = allRoles.filter(function(role) {
                return (!(role.name === "@everyone" || role.tags));
            })
            res.json(result)
        } else {
            res.status(404);
            res.json({error: "requestId does not exists"})
        }
    } catch (error) {
        handleErrors(res, error);
    }
});

server.post('/deleterole', async (req, res) => {
    let data = req.body;

    try {
        removeExpiredRequests(data.requestId);
        if(ADMIN_REQUESTS[data.requestId]) {
            if((await database.getGuildRole(data.roleId)).length) {
                await database.deleteGuildRole(data.guildId, data.roleId)
                setRoleForGuildUsers(data.guildId, data.roleId).catch((e) => {console.log("Error", e)})
            }
            let result = { ...ADMIN_REQUESTS[data.requestId] }
            result.setRoles = await database.getGuildRoles(result.guildId)
            let guild = await global.client.guilds.cache.get(result.guildId)
            let allRoles = await guild.roles.fetch()
            result.allRoles = allRoles.filter(function(role) {
                return (!(role.name === "@everyone" || role.tags));
            })
            res.json(result)
        } else {
            res.status(404);
            res.json({error: "requestId does not exists"})
        }
    } catch (error) {
        handleErrors(res, error);
    }
});

module.exports = {
    server
}
