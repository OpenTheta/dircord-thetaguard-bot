const express = require("express")
const database = require("./../models/dbHelpers")
const {setRoleForGuildUsers, setRolesForUser} = require("./discord-bot")
const {USER_REQUESTS, ADMIN_REQUESTS} = require('./Config')
const bodyParser = require('body-parser')
const { ethers } = require("ethers")

const server = express()
server.use(express.json())
server.use(bodyParser.json())
server.use(bodyParser.urlencoded({ extended: false }))
server.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*"); // update to match the domain you will make the request from
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

server.get('/:requestId', async (req, res) => {
    let {requestId} = req.params
    // check it on server already registered
    if(USER_REQUESTS[requestId]) {
        let data = USER_REQUESTS[requestId]
        data["requestId"] = requestId
        // get all wallets of user
        data["wallets"] = await database.getUserWallets(USER_REQUESTS[requestId].userId)
        let servers = await database.getUserGuilds(USER_REQUESTS[requestId].userId)
        data["server"] = {}
        data["setWallet"] = ''
        // console.log(servers)
        for(let server of servers){
            if(server.guildId === USER_REQUESTS[requestId].guildId) {
                data["server"] = server
                data["setWallet"] = server.wallet
                data["wallets"] = data["wallets"].filter(function( obj ) {
                    return obj.wallet !== data["setWallet"];
                });
            }
        }
        res.json(data)
    } else {
        res.status(404);
        res.json({error: "requestId does not exists"})
    }
})

server.post('/signed', async (req, res) => {
    let data = req.body;
    // console.log(data)
    try {
        const signerAddr = ethers.verifyMessage(USER_REQUESTS[data.requestId].message, data.signature);
        if (signerAddr === data.address) {
            await database.addWallet({
                wallet: data.address,
                userId: USER_REQUESTS[data.requestId].userId
            })
            let userWallets = await database.getUserWallets(USER_REQUESTS[data.requestId].userId)
            res.send(userWallets)
        } else {
            res.send("wrong signature")
        }
    } catch (e) {
        console.log("Error", e);
        res.send('error')
    }
})

server.post('/verifyserver', async (req, res) => {
    let data = req.body;
    // console.log(data)
    // check it is on server already registered
    if(USER_REQUESTS[data.requestId]) {
        // check if user owns the wallet
        let wallets = await database.getUserWallets(data.userId)
        if(wallets.some(w => w.wallet === data.wallet) && USER_REQUESTS[data.requestId].userId === data.userId) {
            let servers = await database.getUserGuilds(data.userId)
            for(let server of servers){
                if(server.guildId === USER_REQUESTS[data.requestId].guildId) {
                    let user = {
                        userId: data.userId,
                        guildId: USER_REQUESTS[data.requestId].guildId,
                        wallet: data.wallet
                    }
                    await database.updateUserGuild(user)
                    console.log(server)
                    setRolesForUser(data.userId, server.guildId).catch(e=>{console.log("Error",e)})
                    res.json(user)
                    return // -> exits
                }
            }
            let user = {
                userId: data.userId,
                guildId: USER_REQUESTS[data.requestId].guildId,
                wallet: data.wallet
            }
            await database.addUser(user)
            setRolesForUser(data.userId, user.guildId).catch(e=>{console.log("Error",e)})
            res.json(user)
        } else {
            res.status(404);
            res.json({error: "Invalid wallet"})
        }
    } else {
        res.status(404);
        res.json({error: "requestId does not exists"})
    }
})

server.post('/disconnect', async (req, res) => {
    let data = req.body;
    // check it is on server already registered
    if(USER_REQUESTS[data.requestId]) {
        if(USER_REQUESTS[data.requestId].userId === data.userId) {
            let server = await database.getUserGuild(data.userId, data.guildId)
            if(server[0] && server[0].wallet === data.wallet) {
                // console.log(server[0].wallet)
                database.deleteUserGuild(data.userId, data.guildId)
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
})



// Setup Roles

server.get('/myserver/:requestId', async (req, res) => {
    let {requestId} = req.params
    // check it on server already registered
    if(ADMIN_REQUESTS[requestId]) {
        let data = ADMIN_REQUESTS[requestId]
        data["setRoles"] = await database.getGuildRoles(ADMIN_REQUESTS[requestId].guildId)
        let guild = await global.client.guilds.cache.get(ADMIN_REQUESTS[requestId].guildId)
        let allRoles = await guild.roles.fetch()
        data["allRoles"] = allRoles.filter(function(role) {
            return (!(role.name === "@everyone" || role.tags));
        })
        res.json(data)
    } else {
        res.status(404);
        res.json({error:"requestId does not exists"})
    }
})

server.post('/newrole', async (req, res) => {
    console.log("Set New role")
    let data = req.body;
    // console.log(data)
    // check it on server already registered
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
        console.log(newRole)
        if((await database.getGuildRole(newRole.guildId, newRole.roleId)).length) {
            let r = await database.updateGuildRole(newRole)
            console.log("update: ", r)
        } else {
            let r = await database.addGuildRole(newRole)
            console.log("add: ", r)
        }
        setRoleForGuildUsers(newRole.guildId, newRole.roleId).catch(e => {console.log("Error",e)})
        let result = ADMIN_REQUESTS[data.requestId]
        result["setRoles"] = await database.getGuildRoles(ADMIN_REQUESTS[data.requestId].guildId)
        let guild = await global.client.guilds.cache.get(ADMIN_REQUESTS[data.requestId].guildId)
        let allRoles = await guild.roles.fetch()
        result["allRoles"] = allRoles.filter(function(role) {
            return (!(role.name === "@everyone" || role.tags));
        })
        // console.log(result)
        res.json(result)
    } else {
        res.status(404);
        res.json({error:"requestId does not exists"})
    }
})

server.post('/deleterole', async (req, res) => {
    console.log("Delete role")
    let data = req.body;
    // console.log(data)
    // check it on server already registered
    if(ADMIN_REQUESTS[data.requestId]) {
        if((await database.getGuildRole(data.roleId)).length) {
            let r = await database.deleteGuildRole(data.guildId, data.roleId)
            setRoleForGuildUsers(data.guildId, data.roleId).catch((e) => {console.log("Error",e)})
            console.log("Delete: ", r)
        }
        let result = ADMIN_REQUESTS[data.requestId]
        result["setRoles"] = await database.getGuildRoles(ADMIN_REQUESTS[data.requestId].guildId)
        let guild = await global.client.guilds.cache.get(ADMIN_REQUESTS[data.requestId].guildId)
        let allRoles = await guild.roles.fetch()
        result["allRoles"] = allRoles.filter(function(role) {
            return (!(role.name === "@everyone" || role.tags));
        })
        res.json(result)
    } else {
        res.status(404);
        res.json({error:"requestId does not exists"})
    }
})

module.exports = server