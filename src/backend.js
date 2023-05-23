const axios = require('axios')
require("dotenv").config();
const database = require("../models/dbHelpers");
const { ethers } = require("ethers")

const fs = require("fs")
const {setRolesForUsers} = require("../src/discord-bot");
// let id = 0
// const market = []
// let changedCollections = {}
let rolesToCheck = {}

module.exports = {
    name: 'transaction tracking',
    description: 'Transaction events',
    interval: 300000,
    // interval: 30000,

    async backendTracking() {

        if (Object.keys(rolesToCheck).length > 0) return;
        console.log("Check All current Guilds, Roles and Users")
        let guilds = await database.getGuilds()
        for (let guild of guilds) {
            let roles = await database.getGuildRoles(guild.guildId);
            let users = await database.getUsersInGuild(guild.guildId);
            let formattedUsers = []
            users.forEach(user => {
                let existingUser = formattedUsers.find(u => u.userId === user.userId);

                if (existingUser) {
                    existingUser.wallets.push(user.wallet);
                } else {
                    formattedUsers.push({
                        id: user.id,
                        userId: user.userId,
                        guildId: user.guildId,
                        wallets: [user.wallet]
                    });
                }
            });
            for (let role of roles) {
                rolesToCheck[role.roleId] = role
                rolesToCheck[role.roleId].users = formattedUsers
            }
        }
        // checkAllExpiredRequests().then(() => {
        //     rolesToCheck = {}
        //     console.log('success')
        // })
        setRolesForUsers(rolesToCheck).then(() => {
            rolesToCheck = {}
        })
    }
    // async backendTracking () {
    //     if (market.length) {
    //         // console.log('Still posting market events')
    //         return
    //     }
    //
    //     try {
    //         if(id===0) {
    //             id = JSON.parse(fs.readFileSync("./id.json")).eventId
    //             console.log(id)
    //         }
    //
    //         let { data } = await axios.get(
    //             `https://api.opentheta.io/v1/events`,
    //             {headers: { 'User-Agent':'OT ThetaGuard Bot' }}
    //         )
    //         let events = data.events
    //         let length = events.length - 1
    //
    //         if (events[0].id === id) {
    //             return
    //         } else if (events[length].id > id){
    //             while (events[length].id > id) {
    //                 let next = data.next
    //                 let res = await axios.get(
    //                     `https://api.opentheta.io/v1/events?cursor=${next}`,
    //                     {headers: { 'User-Agent':'OT ThetaGuard Bot' }}
    //                 )
    //                 data = res.data
    //                 events = events.concat(data.events)
    //                 length = events.length - 1
    //             }
    //         }
    //
    //         for (let i = 0; i <= length; i++) {
    //             if(!changedCollections[events[i].contractAddress]) {
    //                 changedCollections[events[i].contractAddress] = []
    //             }
    //             if(events[i].fromAddress && !changedCollections[events[i].contractAddress].includes(events[i].fromAddress)) {
    //                 changedCollections[events[i].contractAddress].push(events[i].fromAddress)
    //             }
    //             if(events[i].toAddress && !changedCollections[events[i].contractAddress].includes(events[i].toAddress)) {
    //                 changedCollections[events[i].contractAddress].push(events[i].toAddress)
    //             }
    //         }
    //
    //         const keys = Object.keys(changedCollections);
    //
    //         for(let key of keys) {
    //             for(let wallet of changedCollections[key]) {
    //                 let w = ethers.getAddress(wallet)
    //                 let k = ethers.getAddress(key)
    //                 let res = await database.getWalletGuilds(w, k)
    //                 for(let role of res) {
    //                     let user = {
    //                         userId: role.userId,
    //                         wallet: role.wallet
    //                     }
    //                     if(!rolesToCheck[role.roleId]) {
    //                         delete role.userId
    //                         delete role.wallet
    //                         role.users = []
    //                         rolesToCheck[role.roleId] = role
    //                     }
    //                     rolesToCheck[role.roleId].users.push(user)
    //                 }
    //             }
    //         }
    //
    //         await setRolesForUsers(rolesToCheck)
    //
    //         changedCollections = {}
    //         rolesToCheck = {}
    //         console.log('Roles updated')
    //
    //         id = events[0].id
    //         let lastId = {eventId:id}
    //         fs.writeFileSync("./id.json",JSON.stringify(lastId))
    //     } catch (err) {
    //         if (err) console.log(`Error fetching Market Events: ${err}`)
    //     }
    // }
}