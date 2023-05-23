const axios = require('axios')
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, time} = require("discord.js")
require("dotenv").config();
const wait = require('node:timers/promises').setTimeout;
const {FOOTER_TEXT, DESCRIPTION, LOGO_URL, VERIFY_BASE_URL, USER_REQUESTS, ADMIN_REQUESTS} = require('./Config')
const database = require("../models/dbHelpers");
const {ethers} = require("ethers");
require("dotenv").config();
const { Client, Collection, GatewayIntentBits, DMChannel } = require("discord.js");

module.exports = {
    newGuild,
    letsGoButton,
    setupRolesButton,
    setRoleForGuildUsers,
    setRolesForUser,
    setRoleForUser,
    setRolesForUsers,
    checkAllExpiredRequests,
    removeExpiredRequests

}

// Create new channels in a new Guild (thetaguard-verify)
async function newGuild(client, guildId) {
    let guild = await client.guilds.fetch(guildId)
    // create admin channel
    let channel1 =  await guild.channels.create({ //Create a channel
        name: 'thetaguard-config',
        type: ChannelType.GuildText, //Make sure the channel is a text channel
        permissionOverwrites: [
            {
                id: guild.id,
                deny: [PermissionsBitField.Flags.ViewChannel,PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory],
            },
        ],
    })

    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel("Setup Roles!")
                .setCustomId('setupRoles')
                .setStyle('Primary')
        ).addComponents(
            new ButtonBuilder()
                .setLabel('Docs')
                .setStyle('Link')
                .setURL("https://opentheta.io")
        );

    await channel1.send({
        embeds: [
            new EmbedBuilder()
                .setThumbnail(LOGO_URL)
                .setTitle("Setup Your Guild Roles")
                .setColor('#0F52BA')
                .setDescription("** Keep this channel private, because everyone that has access can setup new roles!\n" +
                    "1. Create the Roles that you want to connect to tokens\n" +
                    "2. Follow the link below to setup the rules for each role\n\n" +
                    "You can set:\n" +
                    "- NFT contract\n" +
                    "- Amount of tokens (min & max)\n" +
                    "- Trait that the NFT needs to have")
        ],
        components: [row1]
    })

    //create Public verify channel
    let channel2 =  await guild.channels.create({ //Create a channel
        name: 'thetaguard-verify',
        type: ChannelType.GuildText, //Make sure the channel is a text channel
        permissionOverwrites: [
            {
                id: guild.id,
                deny: [PermissionsBitField.Flags.SendMessages],
            }
        ],
    })
    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel("Let's Go!")
                .setCustomId('letsgo')
                .setStyle('Primary')
        ).addComponents(
            new ButtonBuilder()
                .setLabel('Docs')
                .setStyle('Link')
                .setURL("https://opentheta.io")
        );

    await channel2.send({
        embeds: [
            new EmbedBuilder()
                .setThumbnail(LOGO_URL)
                .setTitle("Verify your Assets")
                .setColor('#0F52BA')
                .setDescription("This is a read-only connection. Do not share your private keys. We will never ask for your seed phrase or DM you.")
        ],
        components: [row2]
    })
    let guildData = {
        guildId: guildId,
        verifyChannelId: channel2.id,
        configChannelId: channel1.id
    }

    await database.addGuild(guildData).catch(e => {console.log(e)})
}

async function setupRolesButton(interaction) {
    await interaction.deferReply({ephemeral: true});
    let community = interaction.member.guild.name;
    let userName = interaction.user.username + "#" + interaction.user.discriminator;
    let interactionId = interaction.id
    let guildIcon = interaction.guild.iconURL();
    if(guildIcon === null) guildIcon = 'https://img.freepik.com/free-psd/discord-logo-3d-social-media-icon-isolated_47987-11941.jpg?w=1380&t=st=1678739624~exp=1678740224~hmac=fed9154bbfdde3e8b96ffa1a800c7264377f5d55da20778b6a0b88cc7c19e9e5'
    let userIcon = interaction.member.displayAvatarURL();
    if(userIcon === null) guildIcon = 'https://ia803204.us.archive.org/4/items/discordprofilepictures/discordgreen.png'

    let content = `Use this custom link to connect (valid for 5 minutes) \nGuild: ${interaction.message.guildId} Member: ${interaction.user.id}`

    let timestamp = new Date().getTime()
    let requestId = generateString(12)

    ADMIN_REQUESTS[requestId] = {
        name: userName,
        timestamp: timestamp,
        interactionId: interactionId,
        community: community,
        guildId: interaction.member.guild.id,
        userId: interaction.user.id,
        guildIcon: guildIcon,
        userIcon: userIcon
    }
    // console.log(USER_REQUESTS[userName])

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel('Setup Roles!')
                .setStyle('Link')
                .setURL(VERIFY_BASE_URL+"admin/?requestId="+requestId)
        );
    await interaction.editReply({
        content: content,
        embeds: [
            new EmbedBuilder()
                .setThumbnail(LOGO_URL)
                .setTitle("Please read instructions carefully before getting started:")
                .setColor('#FF132B')
                .setDescription("1. Create the Roles that you want to connect to tokens\n" +
                    "2. Follow the link below to setup the rules for each role\n\n" +
                    "You can set:\n" +
                    "- NFT contract\n" +
                    "- Amount of tokens (min & max)\n" +
                    "- Trait that the NFT needs to have")
        ],
        components: [row],
        ephemeral: true
    });
}

async function letsGoButton(interaction) {
    await interaction.deferReply({ephemeral: true});
    let community = interaction.member.guild.name;
    let guildIcon = interaction.guild.iconURL();
    if(guildIcon === null) guildIcon = 'https://img.freepik.com/free-psd/discord-logo-3d-social-media-icon-isolated_47987-11941.jpg?w=1380&t=st=1678739624~exp=1678740224~hmac=fed9154bbfdde3e8b96ffa1a800c7264377f5d55da20778b6a0b88cc7c19e9e5'
    let userIcon = interaction.member.displayAvatarURL();
    if(userIcon === null) guildIcon = 'https://ia803204.us.archive.org/4/items/discordprofilepictures/discordgreen.png'
    let userName = interaction.user.username + "#" + interaction.user.discriminator;
    let interactionId = interaction.id
    await wait(500);
    let content = `Use this custom link to connect (valid for 20 minutes) \nGuild: ${interaction.message.guildId} Member: ${interaction.user.id}`

    let timestamp = new Date().getTime()
    let message = getMessage(community, userName, interactionId, timestamp)
    let requestId = generateString(12)

    USER_REQUESTS[requestId] = {
        name: userName,
        timestamp: timestamp,
        interactionId: interactionId,
        community: community,
        guildId: interaction.member.guild.id,
        userId: interaction.user.id,
        message: message,
        guildIcon: guildIcon,
        userIcon: userIcon
    }
    // console.log(USER_REQUESTS[userName])

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel('Verify')
                .setStyle('Link')
                .setURL(VERIFY_BASE_URL+"verify/?requestId="+requestId)
        );
    await interaction.editReply({
        content: content,
        embeds: [
            new EmbedBuilder()
                .setThumbnail(LOGO_URL)
                .setTitle("Please read instructions carefully before connecting")
                .setColor('#FF132B')
                .setDescription(DESCRIPTION + "```" + message + "```" + FOOTER_TEXT)
        ],
        components: [row],
        ephemeral: true
    });
}

function getMessage(community, userName, interactionId, timestamp) {
    return "- ThetaGuard (thetaguard.opentheta.io) asks you to sign this message for the purpose of verifying your account ownership. This is READ-ONLY access and will NOT trigger any blockchain transactions or incur any fees.\n" +
        "\n" +
        "- Community: "+community+"\n" +
        "- User: "+userName+"\n" +
        "- Discord Interaction: "+interactionId+"\n" +
        "- Timestamp: "+timestamp
}

function generateString(length) {
    const characters ='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const charactersLength = characters.length;
    for ( let i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

// async function setRoleForUsers(guildId, newRole) {
//     let users = await database.getUsersInGuild(guildId)
//     let checkRoles = await database.getGuildRole({
//         roleId: newRole,
//         guildId: guildId
//     })
//     let guild = await global.client.guilds.cache.get(guildId)
//     await guild.members.fetch()
//     for(let checkRole of checkRoles) {
//         let membersWithRole = guild.roles.cache.get(checkRole.roleId).members.map(m=>m.user);
//         let discordRole = await guild.roles.cache.get(newRole)
//         // console.log(discordRole)
//         for(let user of users) {
//             let url = `https://api.opentheta.io/v1/items?ownerAddress=${user.wallet}&contractAddress=${checkRole.contract}&limit=1000`
//             let res = await axios.get(url, {
//                 headers: { 'User-Agent':'OT ThetaGuard Bot' }
//             })
//             // console.log(res.data.items.length, checkRole.min_amount, checkRole.max_amount)
//             if(checkRole.min_amount <= res.data.items.length && (checkRole.max_amount >= res.data.items.length || !checkRole.max_amount)) {
//                 let member = await guild.members.fetch(user.userId);
//                 // console.log(member)
//                 await member.roles.add(discordRole)
//             }
//         }
//         for (let member of membersWithRole) {
//             let discordMember = guild.members.cache.get(member.id);
//             let user = await database.getUserGuild(member.id, guildId);
//             console.log(user)
//             if(user[0]) {
//                 let url = `https://api.opentheta.io/v1/items?ownerAddress=${user[0].wallet}&contractAddress=${checkRole.contract}&limit=1000`
//                 let res = await axios.get(url, {
//                     headers: { 'User-Agent':'OT ThetaGuard Bot' }
//                 })
//                 console.log(url)
//                 console.log(res.data)
//                 if(!(checkRole.min_amount <= res.data.items.length && (checkRole.max_amount >= res.data.items.length || !checkRole.max_amount))) {
//                     await discordMember.roles.remove(discordRole)
//                     console.log("role removed (1)")
//                 }
//             } else {
//                 await discordMember.roles.remove(discordRole)
//                 console.log("role removed (2)")
//             }
//         }
//     }
// }

async function setRolesForUser(userId, guildId) {
    console.log(guildId)
    let roles = await database.getGuildRoles(guildId)
    let user = await database.getUserInGuild(guildId, userId)
    // console.log(user)
    if(user[0]) {
        for(let role of roles) {
            // console.log(role)
            let url = `https://api.opentheta.io/v1/contracts/${role.contract}/attributes?includeForSale=${Boolean(role.include_market)}`
            let res = await axios.get(url, {
                headers: {'User-Agent': 'OT ThetaGuard Bot'}
            }).catch((e) => {
                console.log(e)
            })
            // console.log(url)
            let owners = res.data.owners

            // todo: test if new code works
            // console.log("user length:",user.length)
            let owner;
            for(let i=0; i<user.length; i++) {
                let o = owners.find((o) => {
                    return o.address.toLowerCase() === user[i].wallet.toLowerCase()
                })
                console.log(o)
                if(owner && o) {
                    owner.ownedAmount += o.ownedAmount
                    Object.keys(o.attributes).forEach(key => {
                        if (owner.attributes[key]) {
                            // If the key exists in attributes1, merge the two arrays
                            owner.attributes[key] = [...owner.attributes[key], ...o.attributes[key]];
                        } else {
                            // If the key does not exist in attributes1, add it
                            owner.attributes[key] = o.attributes[key];
                        }
                    });

                } else if(o) {
                    owner = o;
                }
                // console.log("owner",owner)
            }
            // let owner = owners.find((o) => {
            //     // return owner.address.toLowerCase() === user[0].wallet.toLowerCase()
            //     return user.some((u) => {
            //         return o.address.toLowerCase() === u.wallet.toLowerCase();
            //     });
            // })

            // console.log('setRolesForUser', owner)

            setUserRole(role, userId, owner).catch((e) => {
                console.log(e)
            })
        }
    } else {
        for(let role of roles) {
            setUserRole(role, userId, undefined).catch((e) => {
                console.log(e)
            })
        }
    }
}

async function setRoleForUser(userId, guildId, roleId) {
    let role = await database.getGuildRole(roleId)
    let user = await database.getUserInGuild(guildId, userId)
    if(user[0]) {
        let url = `https://api.opentheta.io/v1/contracts/${role.contract}/attributes?includeForSale=${Boolean(role.include_market)}`
        let res = await axios.get(url, {
            headers: { 'User-Agent':'OT ThetaGuard Bot' }
        }).catch((e) => {console.log(e)})
        let owners = res.data.owners
        for(let owner of owners) {
            if(owner.address === wallet.toLowerCase()) {
                setUserRole(role, userId, owner).catch((e) => {console.log(e)})
            }
        }
    } else {
        setUserRole(role, userId, undefined).catch((e) => {console.log(e)})
    }
}

async function setUserRole(role, userId, userData) {
    console.log(role, userId, userData)
    let guild = await global.client.guilds.cache.get(role.guildId)
    let discordRole = await guild.roles.cache.get(role.roleId)
    let member = await guild.members.fetch(userId);
    if (userData && userData.ownedAmount >= role.min_amount && (role.max_amount === null || userData.ownedAmount <= role.max_amount)) {
        // check if specific trait is set
        if (role.trait_type && role.trait_value) {
            if (userData.attributes && userData.attributes[role.trait_type]) {
                const traitOccurrences = userData.attributes[role.trait_type].filter(value => value === role.trait_value).length;

                if (traitOccurrences >= role.min_amount && (role.max_amount === null || traitOccurrences <= role.max_amount)) {
                    if (!member.roles.cache.has(discordRole.id)) {
                        console.log("role added (traits)")
                        await member.roles.add(discordRole)
                    }
                } else {
                    if (member.roles.cache.has(discordRole.id)) {
                        console.log("role removed (traits, but not enough)")
                        await member.roles.remove(discordRole)
                    }
                }
            } else {
                if (member.roles.cache.has(discordRole.id)) {
                    console.log("role removed (traits, but user data does not have right one)")
                    await member.roles.remove(discordRole)
                }
            }
        } else {
            // no traits are set, give role if user does not already have it
            if (!member.roles.cache.has(discordRole.id)) {
                console.log("role added (no traits)")
                await member.roles.add(discordRole)
            }
        }
    } else {
        // Take role away if user has a role but is not eligible
        if (member.roles.cache.has(discordRole.id)) {
            console.log("role removed (no traits)")
            await member.roles.remove(discordRole)
        }
    }
}



async function setGuildRolesForUsersByContract(contract, guildId) {
    // let guild = await global.client.guilds.cache.get(guildId)

    let url_includeMarket = `https://api.opentheta.io/v1/contracts/${contract}/attributes?includeForSale=true`
    let url_excludeMarket = `https://api.opentheta.io/v1/contracts/${contract}/attributes?includeForSale=false`
    let res_includeMarket = await axios.get(url_includeMarket, {
        headers: { 'User-Agent':'OT ThetaGuard Bot' }
    }).catch((e) => {console.log(e)})
    let res_excludeMarket = await axios.get(url_excludeMarket, {
        headers: { 'User-Agent':'OT ThetaGuard Bot' }
    }).catch((e) => {console.log(e)})

    let roles = await database.getGuildRolesByContract(guildId, contract)
    roles.forEach((role) => {
        let owners
        if(role.include_market) {
            owners = res_includeMarket.data.owners
        } else {
            owners = res_excludeMarket.data.owners
        }
        owners.forEach(async (owner) => {
            let wallet = await database.getWalletUser(owner.wallet)
            if(wallet.userId) {
                let user = await database.getUserGuild(wallet.userId, guildId)
                if(user[0]) {
                    setUserRole(role, wallet.userId, owner).catch((e) => {console.log(e)})
                }
            }
        })

    })
}

// async function setRoleForGuildUsers(guildId, roleId) {
//     let users = await database.getUsersInGuild(guildId)
//     let role = await database.getGuildRole(roleId)
//     let guild = await global.client.guilds.cache.get(guildId)
//     await guild.members.fetch()
//     let membersWithRole = guild.roles.cache.get(roleId).members.map(m=>m.user);
//     let discordRole = await guild.roles.cache.get(roleId)
//     if(role[0]) {
//         let url = `https://api.opentheta.io/v1/contracts/${role[0].contract}/attributes?includeForSale=${Boolean(role[0].include_market)}`
//         let res = await axios.get(url, {
//             headers: { 'User-Agent':'OT ThetaGuard Bot' }
//         }).catch((e) => {console.log("Error",e)})
//         let owners = res.data.owners
//         users.forEach((user) => {
//             let owner = owners.find((owner) => {
//                 return owner.address === user.wallet.toLowerCase()
//             })
//             if(owner) {
//                 setUserRole(role[0], user.userId, owner)
//             } else {
//                 if(membersWithRole.find((member) => {return user.userId === member.id})) {
//                     guild.members.fetch(user.userId).then((member) => {
//                         member.roles.remove(discordRole)
//                     })
//                 }
//             }
//         })
//     } else {
//         users.forEach((user) => {
//             if(membersWithRole.find((member) => {return user.userId === member.id})) {
//                 guild.members.fetch(user.userId).then((member) => {
//                     member.roles.remove(discordRole)
//                 })
//             }
//         })
//     }
// }

async function setRoleForGuildUsers(guildId, roleId) {
    let users = await database.getUsersInGuild(guildId)
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
    let role = await database.getGuildRole(roleId)
    let guild = await global.client.guilds.cache.get(guildId)
    await guild.members.fetch()
    let membersWithRole = guild.roles.cache.get(roleId).members.map(m=>m.user);
    let discordRole = await guild.roles.cache.get(roleId)
    if(role[0]) {
        let url = `https://api.opentheta.io/v1/contracts/${role[0].contract}/attributes?includeForSale=${Boolean(role[0].include_market)}`
        let res = await axios.get(url, {
            headers: { 'User-Agent':'OT ThetaGuard Bot' }
        }).catch((e) => {console.log("Error",e)})
        let owners = res.data.owners

        // todo: Test if new code works
        for(let user of formattedUsers) {
            let owner;
            for(let wallet of user.wallets) {
                let o = owners.find((o) => {
                    return o.address.toLowerCase() === wallet.toLowerCase()
                })
                if(owner && o) {
                    owner.ownedAmount += o.ownedAmount
                    Object.keys(o.attributes).forEach(key => {
                        if (owner.attributes[key]) {
                            // If the key exists in attributes1, merge the two arrays
                            owner.attributes[key] = [...owner.attributes[key], ...o.attributes[key]];
                        } else {
                            // If the key does not exist in attributes1, add it
                            owner.attributes[key] = o.attributes[key];
                        }
                    });

                } else if (o){
                    owner = o;
                }
            }
            // let owner = owners.find((owner) => {
            //     return user.wallets.some(wallet => owner.address === wallet.toLowerCase());
            // });
            await setUserRole(role[0], user.userId, owner)
        }
    } else {
        users.forEach((user) => {
            if(membersWithRole.find((member) => {return user.userId === member.id})) {
                guild.members.fetch(user.userId).then((member) => {
                    member.roles.remove(discordRole)
                })
            }
        })
    }
}

async function setRolesForUsers(rolesToCheck) {
    // console.log(rolesToCheck)
    const keys = Object.keys(rolesToCheck);
    for(let key of keys) {
        // console.log(rolesToCheck[key].users)
        let role = rolesToCheck[key]
        let url = `https://api.opentheta.io/v1/contracts/${role.contract}/attributes?includeForSale=${Boolean(role.include_market)}`
        let res = await axios.get(url, {
            headers: { 'User-Agent':'OT ThetaGuard Bot' }
        }).catch((e) => {console.log("Error",e)})
        let owners = res.data.owners
        for(let user of rolesToCheck[key].users) {
            // let owner = owners.find((owner) => {
            //     return owner.address === user.wallet.toLowerCase()
            // })
            let owner = owners.find((owner) => {
                return user.wallets.some(wallet => owner.address === wallet.toLowerCase());
            });
            // console.log(role, user.userId, owner)
            await setUserRole(role, user.userId, owner)
        }
    }
}

function removeExpiredRequests(requestId) {
    const currentTime = new Date().getTime();
    const expirationTimeInMilliseconds =20 * 60 * 1000;
    if(USER_REQUESTS[requestId]) {
        if (currentTime - USER_REQUESTS[requestId].timestamp > expirationTimeInMilliseconds) {
            delete USER_REQUESTS[requestId];
        }
    }
    if(ADMIN_REQUESTS[requestId]) {
        if (currentTime - ADMIN_REQUESTS[requestId].timestamp > expirationTimeInMilliseconds) {
            delete ADMIN_REQUESTS[requestId];
        }
    }

}

async function checkAllExpiredRequests() {
    const currentTime = new Date().getTime();
    const expirationTimeInMilliseconds = 20 * 60 * 1000;

    Object.keys(USER_REQUESTS).forEach(requestId => {
        if (currentTime - USER_REQUESTS[requestId].timestamp > expirationTimeInMilliseconds) {
            delete USER_REQUESTS[requestId];
        }
    });

    Object.keys(ADMIN_REQUESTS).forEach(requestId => {
        if (currentTime - ADMIN_REQUESTS[requestId].timestamp > expirationTimeInMilliseconds) {
            delete ADMIN_REQUESTS[requestId];
        }
    });
}