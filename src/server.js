const express = require("express");
const database = require("./../models/dbHelpers");
const { checkAllExpiredRequests, removeExpiredRequests, setRoleForGuildUsers, setRolesForUser } = require("./discord-bot");
const { USER_REQUESTS, ADMIN_REQUESTS } = require("./Config");
const bodyParser = require("body-parser");
const { ethers } = require("ethers");
const https = require("https");
const fs = require('fs');

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

// Certificate
const privateKey = fs.readFileSync('/etc/letsencrypt/live/opentheta.de/privkey.pem', 'utf8');
const certificate = fs.readFileSync('/etc/letsencrypt/live/opentheta.de/cert.pem', 'utf8');
const ca = fs.readFileSync('/etc/letsencrypt/live/opentheta.de/chain.pem', 'utf8');

const credentials = {
    key: privateKey,
    cert: certificate,
    ca: ca
};

const serverHttps = https.createServer(credentials, server);

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
        console.log(USER_REQUESTS[data.requestId])
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
                console.log("Call setRolesForUser")
                setRolesForUser(data.userId, USER_REQUESTS[data.requestId].guildId).catch(e=>{console.log("Error",e)})
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
                    // console.log(server[0].wallet)
                    database.deleteUserGuild(data.userId, data.guildId, data.thetadrop)
                        .then((x) =>{
                            setRolesForUser(data.userId, data.guildId)
                            res.json({success: "disconnected wallet"})
                        }).catch((e)=>{
                        console.log("Error",e)
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
        checkAllExpiredRequests().catch((e) => console.log("ERROR: Check All Requests:",e));
        if(ADMIN_REQUESTS[requestId]) {
            let data = ADMIN_REQUESTS[requestId]
            data.setRoles = await database.getGuildRoles(ADMIN_REQUESTS[requestId].guildId)
            let guild = await global.client.guilds.cache.get(ADMIN_REQUESTS[requestId].guildId)
            let allRoles = await guild.roles.fetch()

            // Get the bot's member object in the guild
            const botMember = await guild.members.fetch(global.client.user.id);
            // Get the bot's highest role position
            const botRolePosition = botMember.roles.highest.position;
            data.allRoles = allRoles.filter(function(role) {
                return role.position < botRolePosition && role.name !== "@everyone" && !role.tags;
                // return (!(role.name === "@everyone" || role.tags));
            })
            res.json(data)
        } else {
            res.status(404);
            res.json({error:"requestId does not exists"})
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
            if((await database.getGuildRole(newRole.guildId, newRole.roleId)).length) {
                let r = await database.updateGuildRole(newRole)
            } else {
                let r = await database.addGuildRole(newRole)
            }
            setRoleForGuildUsers(newRole.guildId, newRole.roleId).catch(e => {console.log("Error",e)})
            let result = ADMIN_REQUESTS[data.requestId]
            result.setRoles = await database.getGuildRoles(ADMIN_REQUESTS[data.requestId].guildId)
            let guild = await global.client.guilds.cache.get(ADMIN_REQUESTS[data.requestId].guildId)
            let allRoles = await guild.roles.fetch()
            result.allRoles = allRoles.filter(function(role) {
                return (!(role.name === "@everyone" || role.tags));
            })
            // console.log(result)
            res.json(result)
        } else {
            res.status(404);
            res.json({error:"requestId does not exists"})
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
                let r = await database.deleteGuildRole(data.guildId, data.roleId)
                setRoleForGuildUsers(data.guildId, data.roleId).catch((e) => {console.log("Error",e)})
                console.log("Delete: ", r)
            }
            let result = ADMIN_REQUESTS[data.requestId]
            result.setRoles = await database.getGuildRoles(ADMIN_REQUESTS[data.requestId].guildId)
            let guild = await global.client.guilds.cache.get(ADMIN_REQUESTS[data.requestId].guildId)
            let allRoles = await guild.roles.fetch()
            result.allRoles = allRoles.filter(function(role) {
                return (!(role.name === "@everyone" || role.tags));
            })
            res.json(result)
        } else {
            res.status(404);
            res.json({error:"requestId does not exists"})
        }
    } catch (error) {
        handleErrors(res, error);
    }
});



module.exports = {
    server,
    serverHttps
}

// server.get('/:requestId', async (req, res) => {
//     let {requestId} = req.params
//     // check it on server already registered
//     if(USER_REQUESTS[requestId]) {
//         let data = USER_REQUESTS[requestId]
//         data["requestId"] = requestId
//         // get all wallets of user
//         data["wallets"] = await database.getUserWallets(USER_REQUESTS[requestId].userId)
//         let servers = await database.getUserGuilds(USER_REQUESTS[requestId].userId)
//         // data["server"] = {}
//         data["setWalletMM"] = ''
//         data["setWalletTD"] = ''
//         // console.log(servers)
//         for(let server of servers){
//             if(server.guildId === USER_REQUESTS[requestId].guildId) {
//                 // data["server"] = server
//                 if(server.thetadrop) {
//                     data["setWalletTD"] = server.wallet
//                     data["wallets"] = data["wallets"].filter(function( obj ) {
//                         return obj.wallet !== data["setWalletTD"];
//                     });
//                 } else {
//                     data["setWalletMM"] = server.wallet
//                     data["wallets"] = data["wallets"].filter(function( obj ) {
//                         return obj.wallet !== data["setWalletMM"];
//                     });
//                 }
//             }
//         }
//         res.json(data)
//     } else {
//         res.status(404);
//         res.json({error: "requestId does not exists"})
//     }
// })

// server.post('/signed', async (req, res) => {
//     let data = req.body;
//     // console.log(data)
//     try {
//         const signerAddr = ethers.verifyMessage(USER_REQUESTS[data.requestId].message, data.signature);
//         if (signerAddr === data.address) {
//             await database.addWallet({
//                 wallet: data.address,
//                 userId: USER_REQUESTS[data.requestId].userId,
//                 thetadrop: data.thetadrop
//             })
//             let userWallets = await database.getUserWallets(USER_REQUESTS[data.requestId].userId)
//             res.send(userWallets)
//         } else {
//             res.send("wrong signature")
//         }
//     } catch (e) {
//         console.log("Error", e);
//         res.send('error')
//     }
// })

// server.post('/verifyserver', async (req, res) => {
//     let data = req.body;
//     // console.log(data)
//     // check it is on server already registered
//     if(USER_REQUESTS[data.requestId]) {
//         // check if user owns the wallet
//         let wallets = await database.getUserWallets(data.userId)
//         if(wallets.some(w => w.wallet === data.wallet) && USER_REQUESTS[data.requestId].userId === data.userId) {
//             let servers = await database.getUserGuilds(data.userId)
//             for(let server of servers){
//                 if(server.guildId === USER_REQUESTS[data.requestId].guildId) {
//                     // let user = {
//                     //     userId: data.userId,
//                     //     guildId: USER_REQUESTS[data.requestId].guildId,
//                     //     wallet: data.wallet,
//                     //     thetadrop: data.thetadrop
//                     // }
//                     // await database.updateUserGuild(user)
//                     console.log(server)
//                     setRolesForUser(data.userId, server.guildId).catch(e=>{console.log("Error",e)})
//                     // res.json(user)
//                     // return // -> exits
//                 }
//             }
//             let user = {
//                 userId: data.userId,
//                 guildId: USER_REQUESTS[data.requestId].guildId,
//                 wallet: data.wallet,
//                 thetadrop: data.thetadrop
//             }
//             await database.updateUserGuild(user)
//             setRolesForUser(data.userId, user.guildId).catch(e=>{console.log("Error",e)})
//             res.json(user)
//         } else {
//             res.status(404);
//             res.json({error: "Invalid wallet"})
//         }
//     } else {
//         res.status(404);
//         res.json({error: "requestId does not exists"})
//     }
// })

// server.post('/disconnect', async (req, res) => {
//     let data = req.body;
//     // check it is on server already registered
//     if(USER_REQUESTS[data.requestId]) {
//         if(USER_REQUESTS[data.requestId].userId === data.userId) {
//             let server = await database.getUserGuild(data.userId, data.guildId)
//             if((server[0] && server[0].wallet === data.wallet) || (server[1] && server[1].wallet === data.wallet)) {
//                 // console.log(server[0].wallet)
//                 database.deleteUserGuild(data.userId, data.guildId, data.thetadrop)
//                     .then((x) =>{
//                         setRolesForUser(data.userId, data.guildId)
//                         res.json({success: "disconnected wallet"})
//                     }).catch((e)=>{
//                     console.log("Error",e)
//                     res.status(404);
//                     res.json({error: "Disconnecting error"})
//                 })
//             } else {
//                 res.status(404);
//                 res.json({error: "Invalid wallet"})
//             }
//         } else {
//             res.status(404);
//             res.json({error: "Invalid userId"})
//         }
//     } else {
//         res.status(404);
//         res.json({error: "requestId does not exists"})
//     }
// })

// Setup Roles

// server.get('/myserver/:requestId', async (req, res) => {
//     let {requestId} = req.params
//     // check it on server already registered
//     if(ADMIN_REQUESTS[requestId]) {
//         let data = ADMIN_REQUESTS[requestId]
//         data["setRoles"] = await database.getGuildRoles(ADMIN_REQUESTS[requestId].guildId)
//         let guild = await global.client.guilds.cache.get(ADMIN_REQUESTS[requestId].guildId)
//         let allRoles = await guild.roles.fetch()
//         data["allRoles"] = allRoles.filter(function(role) {
//             return (!(role.name === "@everyone" || role.tags));
//         })
//         res.json(data)
//     } else {
//         res.status(404);
//         res.json({error:"requestId does not exists"})
//     }
// })

// server.post('/newrole', async (req, res) => {
//     console.log("Set New role")
//     let data = req.body;
//     // console.log(data)
//     // check it on server already registered
//     if(ADMIN_REQUESTS[data.requestId]) {
//         let newRole = {
//             roleId: data.roleId,
//             roleName: data.roleName,
//             contract: data.contract,
//             min_amount: data.min_amount,
//             max_amount: data.max_amount,
//             trait_type: data.trait_type,
//             trait_value: data.trait_value,
//             include_market: data.include_market,
//             guildId: ADMIN_REQUESTS[data.requestId].guildId
//         }
//         console.log(newRole)
//         if((await database.getGuildRole(newRole.guildId, newRole.roleId)).length) {
//             let r = await database.updateGuildRole(newRole)
//             console.log("update: ", r)
//         } else {
//             let r = await database.addGuildRole(newRole)
//             console.log("add: ", r)
//         }
//         setRoleForGuildUsers(newRole.guildId, newRole.roleId).catch(e => {console.log("Error",e)})
//         let result = ADMIN_REQUESTS[data.requestId]
//         result["setRoles"] = await database.getGuildRoles(ADMIN_REQUESTS[data.requestId].guildId)
//         let guild = await global.client.guilds.cache.get(ADMIN_REQUESTS[data.requestId].guildId)
//         let allRoles = await guild.roles.fetch()
//         result["allRoles"] = allRoles.filter(function(role) {
//             return (!(role.name === "@everyone" || role.tags));
//         })
//         // console.log(result)
//         res.json(result)
//     } else {
//         res.status(404);
//         res.json({error:"requestId does not exists"})
//     }
// })

// server.post('/deleterole', async (req, res) => {
//     console.log("Delete role")
//     let data = req.body;
//     // console.log(data)
//     // check it on server already registered
//     if(ADMIN_REQUESTS[data.requestId]) {
//         if((await database.getGuildRole(data.roleId)).length) {
//             let r = await database.deleteGuildRole(data.guildId, data.roleId)
//             setRoleForGuildUsers(data.guildId, data.roleId).catch((e) => {console.log("Error",e)})
//             console.log("Delete: ", r)
//         }
//         let result = ADMIN_REQUESTS[data.requestId]
//         result["setRoles"] = await database.getGuildRoles(ADMIN_REQUESTS[data.requestId].guildId)
//         let guild = await global.client.guilds.cache.get(ADMIN_REQUESTS[data.requestId].guildId)
//         let allRoles = await guild.roles.fetch()
//         result["allRoles"] = allRoles.filter(function(role) {
//             return (!(role.name === "@everyone" || role.tags));
//         })
//         res.json(result)
//     } else {
//         res.status(404);
//         res.json({error:"requestId does not exists"})
//     }
// })