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
    removeExpiredRequests,
    resendMessage
}

// Create new channels in a new Guild (thetaguard-verify)
async function newGuild(client, guildId) {
    try {
        console.log("Create new guild", guildId)
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
    } catch (e) {
        console.log("Error adding new Guild", e)
    }
}

// reload the message of the private channel
async function resendMessage(message) {
    let guild = await database.getGuild(message.guildId)
    if(message.channel.id !== guild[0].configChannelId) return;
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

    await message.channel.send({
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
    let regex = /[^a-zA-Z0-9\s#]/g;
    return "- ThetaGuard (thetaguard.opentheta.io) asks you to sign this message for the purpose of verifying your account ownership. This is READ-ONLY access and will NOT trigger any blockchain transactions or incur any fees.\n" +
        "\n" +
        "- Community: "+community.replace(regex, '')+"\n" +
        "- User: "+userName.replace(regex, '')+"\n" +
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
    try {
        let roles = await database.getGuildRoles(guildId)
        if (!roles || !Array.isArray(roles)) {
            console.warn(`[setRolesForUser] No roles found for guildId=${guildId}, userId=${userId}`)
            return
        }
        
        let user = await database.getUserInGuild(guildId, userId)
        if(user[0]) {
            for(let role of roles) {
                try {
                    if (!role || !role.contract) {
                        console.warn(`[setRolesForUser] Invalid role data: roleId=${role?.roleId}, guildId=${guildId}, userId=${userId}`)
                        continue
                    }
                    
                    let url = `https://api.opentheta.io/v1/contracts/${role.contract}/attributes?includeForSale=${Boolean(role.include_market)}`
                    let res = await axios.get(url, {
                        headers: {'User-Agent': 'OT ThetaGuard Bot'}
                    }).catch((e) => {
                        console.error(`[setRolesForUser] API error: roleId=${role.roleId}, guildId=${guildId}, userId=${userId}, url=${url}`, e)
                        return null
                    })
                    
                    if (!res || !res.data || !res.data.owners) {
                        console.warn(`[setRolesForUser] Invalid API response: roleId=${role.roleId}, guildId=${guildId}, userId=${userId}`)
                        await setUserRole(role, userId, undefined).catch((e) => {
                            console.error(`[setRolesForUser] Error setting role to undefined: roleId=${role.roleId}, guildId=${guildId}, userId=${userId}`, e)
                        })
                        continue
                    }
                    
                    let owners = res.data.owners
                    if (!Array.isArray(owners)) {
                        console.warn(`[setRolesForUser] Owners is not an array: roleId=${role.roleId}, guildId=${guildId}, userId=${userId}`)
                        await setUserRole(role, userId, undefined).catch((e) => {
                            console.error(`[setRolesForUser] Error setting role to undefined: roleId=${role.roleId}, guildId=${guildId}, userId=${userId}`, e)
                        })
                        continue
                    }

                    let owner;
                    for(let i=0; i<user.length; i++) {
                        if (!user[i] || !user[i].wallet) {
                            continue
                        }
                        
                        let o = owners.find((o) => {
                            return o.address.toLowerCase() === user[i].wallet.toLowerCase()
                        })
                        
                        if(owner && o) {
                            owner.ownedAmount += o.ownedAmount
                            Object.keys(o.attributes || {}).forEach(key => {
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
                    }

                    await setUserRole(role, userId, owner).catch((e) => {
                        console.error(`[setRolesForUser] Error setting role: roleId=${role.roleId}, guildId=${guildId}, userId=${userId}`, e)
                    })
                } catch (roleError) {
                    // Continue processing other roles even if one fails
                    console.error(`[setRolesForUser] Error processing role: roleId=${role?.roleId}, guildId=${guildId}, userId=${userId}`, roleError)
                }
            }
        } else {
            for(let role of roles) {
                await setUserRole(role, userId, undefined).catch((e) => {
                    console.error(`[setRolesForUser] Error setting role to undefined (user not found): roleId=${role?.roleId}, guildId=${guildId}, userId=${userId}`, e)
                })
            }
        }
    } catch (e) {
        console.error(`[setRolesForUser] Unexpected error: guildId=${guildId}, userId=${userId}`, e)
    }
}

async function setRoleForUser(userId, guildId, roleId) {
    try {
        let role = await database.getGuildRole(roleId)
        if (!role || !role[0]) {
            console.warn(`[setRoleForUser] Role not found: roleId=${roleId}, userId=${userId}, guildId=${guildId}`)
            return
        }
        
        let user = await database.getUserInGuild(guildId, userId)
        if(user[0]) {
            let url = `https://api.opentheta.io/v1/contracts/${role[0].contract}/attributes?includeForSale=${Boolean(role[0].include_market)}`
            let res = await axios.get(url, {
                headers: { 'User-Agent':'OT ThetaGuard Bot' }
            }).catch((e) => {
                console.error(`[setRoleForUser] API error for userId=${userId}, guildId=${guildId}, roleId=${roleId}, url=${url}`, e)
                return null
            })
            
            if (!res || !res.data || !res.data.owners) {
                console.warn(`[setRoleForUser] Invalid API response for userId=${userId}, guildId=${guildId}, roleId=${roleId}`)
                await setUserRole(role[0], userId, undefined).catch((e) => {
                    console.error(`[setRoleForUser] Error setting role to undefined: userId=${userId}, guildId=${guildId}, roleId=${roleId}`, e)
                })
                return
            }
            
            let owners = res.data.owners
            let foundOwner = null
            for(let owner of owners) {
                if(owner.address.toLowerCase() === user[0].wallet.toLowerCase()) {
                    foundOwner = owner
                    break
                }
            }
            
            if (foundOwner) {
                await setUserRole(role[0], userId, foundOwner).catch((e) => {
                    console.error(`[setRoleForUser] Error setting role: userId=${userId}, guildId=${guildId}, roleId=${roleId}`, e)
                })
            } else {
                await setUserRole(role[0], userId, undefined).catch((e) => {
                    console.error(`[setRoleForUser] Error setting role to undefined (owner not found): userId=${userId}, guildId=${guildId}, roleId=${roleId}`, e)
                })
            }
        } else {
            await setUserRole(role[0], userId, undefined).catch((e) => {
                console.error(`[setRoleForUser] Error setting role to undefined (user not found): userId=${userId}, guildId=${guildId}, roleId=${roleId}`, e)
            })
        }
    } catch (e) {
        console.error(`[setRoleForUser] Unexpected error: userId=${userId}, guildId=${guildId}, roleId=${roleId}`, e)
    }
}

async function setUserRole(role, userId, userData) {
    try {
        console.log(`[setUserRole] Processing role ${role.roleId} for user ${userId} in guild ${role.guildId}`, { userData: userData ? { ownedAmount: userData.ownedAmount } : null })
        
        // Validate guild exists
        let guild = await global.client.guilds.cache.get(role.guildId)
        if (!guild) {
            console.warn(`[setUserRole] Guild not found: ${role.guildId} for user ${userId}, role ${role.roleId}`)
            return
        }

        // Validate role exists
        let discordRole = await guild.roles.cache.get(role.roleId)
        if (!discordRole) {
            console.warn(`[setUserRole] Role not found: ${role.roleId} in guild ${role.guildId} for user ${userId}`)
            return
        }

        // Fetch member with error handling for users who left the guild
        let member
        try {
            member = await guild.members.fetch(userId)
        } catch (error) {
            if (error.code === 10007) {
                // Unknown Member - user has left the guild
                console.warn(`[setUserRole] Member not found (likely left guild): userId=${userId}, guildId=${role.guildId}, roleId=${role.roleId}`)
                return
            }
            // Re-throw other errors
            throw error
        }

        if (userData && userData.ownedAmount >= role.min_amount && (role.max_amount === null || userData.ownedAmount <= role.max_amount)) {
            // check if specific trait is set
            if (role.trait_type && role.trait_value) {
                if (userData.attributes && userData.attributes[role.trait_type]) {
                    const traitOccurrences = userData.attributes[role.trait_type].filter(value => value === role.trait_value).length;

                    if (traitOccurrences >= role.min_amount && (role.max_amount === null || traitOccurrences <= role.max_amount)) {
                        if (!member.roles.cache.has(discordRole.id)) {
                            console.log(`[setUserRole] Role added (traits): userId=${userId}, guildId=${role.guildId}, roleId=${role.roleId}`)
                            await member.roles.add(discordRole)
                        }
                    } else {
                        if (member.roles.cache.has(discordRole.id)) {
                            console.log(`[setUserRole] Role removed (traits, but not enough): userId=${userId}, guildId=${role.guildId}, roleId=${role.roleId}`)
                            await member.roles.remove(discordRole)
                        }
                    }
                } else {
                    if (member.roles.cache.has(discordRole.id)) {
                        console.log(`[setUserRole] Role removed (traits, but user data does not have right one): userId=${userId}, guildId=${role.guildId}, roleId=${role.roleId}`)
                        await member.roles.remove(discordRole)
                    }
                }
            } else {
                // no traits are set, give role if user does not already have it
                if (!member.roles.cache.has(discordRole.id)) {
                    console.log(`[setUserRole] Role added (no traits): userId=${userId}, guildId=${role.guildId}, roleId=${role.roleId}`)
                    await member.roles.add(discordRole)
                }
            }
        } else {
            // Take role away if user has a role but is not eligible
            if (member.roles.cache.has(discordRole.id)) {
                console.log(`[setUserRole] Role removed (not eligible): userId=${userId}, guildId=${role.guildId}, roleId=${role.roleId}`)
                await member.roles.remove(discordRole)
            }
        }
    } catch (error) {
        console.error(`[setUserRole] Error setting role: userId=${userId}, guildId=${role?.guildId}, roleId=${role?.roleId}`, error)
        throw error
    }
}



async function setGuildRolesForUsersByContract(contract, guildId) {
    try {
        if (!contract || !guildId) {
            console.warn(`[setGuildRolesForUsersByContract] Missing parameters: contract=${contract}, guildId=${guildId}`)
            return
        }

        let url_includeMarket = `https://api.opentheta.io/v1/contracts/${contract}/attributes?includeForSale=true`
        let url_excludeMarket = `https://api.opentheta.io/v1/contracts/${contract}/attributes?includeForSale=false`
        
        let res_includeMarket = await axios.get(url_includeMarket, {
            headers: { 'User-Agent':'OT ThetaGuard Bot' }
        }).catch((e) => {
            console.error(`[setGuildRolesForUsersByContract] API error (includeMarket): contract=${contract}, guildId=${guildId}, url=${url_includeMarket}`, e)
            return null
        })
        
        let res_excludeMarket = await axios.get(url_excludeMarket, {
            headers: { 'User-Agent':'OT ThetaGuard Bot' }
        }).catch((e) => {
            console.error(`[setGuildRolesForUsersByContract] API error (excludeMarket): contract=${contract}, guildId=${guildId}, url=${url_excludeMarket}`, e)
            return null
        })

        if (!res_includeMarket || !res_includeMarket.data || !res_includeMarket.data.owners) {
            console.warn(`[setGuildRolesForUsersByContract] Invalid API response (includeMarket): contract=${contract}, guildId=${guildId}`)
        }
        
        if (!res_excludeMarket || !res_excludeMarket.data || !res_excludeMarket.data.owners) {
            console.warn(`[setGuildRolesForUsersByContract] Invalid API response (excludeMarket): contract=${contract}, guildId=${guildId}`)
        }

        let roles = await database.getGuildRolesByContract(guildId, contract)
        if (!roles || !Array.isArray(roles)) {
            console.warn(`[setGuildRolesForUsersByContract] No roles found: contract=${contract}, guildId=${guildId}`)
            return
        }
        
        for (let role of roles) {
            try {
                if (!role || !role.roleId) {
                    console.warn(`[setGuildRolesForUsersByContract] Invalid role data: contract=${contract}, guildId=${guildId}`)
                    continue
                }
                
                let owners
                if(role.include_market) {
                    if (!res_includeMarket || !res_includeMarket.data || !res_includeMarket.data.owners) {
                        console.warn(`[setGuildRolesForUsersByContract] Skipping role (no includeMarket data): roleId=${role.roleId}, contract=${contract}, guildId=${guildId}`)
                        continue
                    }
                    owners = res_includeMarket.data.owners
                } else {
                    if (!res_excludeMarket || !res_excludeMarket.data || !res_excludeMarket.data.owners) {
                        console.warn(`[setGuildRolesForUsersByContract] Skipping role (no excludeMarket data): roleId=${role.roleId}, contract=${contract}, guildId=${guildId}`)
                        continue
                    }
                    owners = res_excludeMarket.data.owners
                }
                
                if (!Array.isArray(owners)) {
                    console.warn(`[setGuildRolesForUsersByContract] Owners is not an array: roleId=${role.roleId}, contract=${contract}, guildId=${guildId}`)
                    continue
                }
                
                for (let owner of owners) {
                    try {
                        if (!owner || !owner.wallet) {
                            continue
                        }
                        
                        let wallet = await database.getWalletUser(owner.wallet)
                        if (!wallet || !Array.isArray(wallet) || !wallet[0] || !wallet[0].userId) {
                            continue
                        }
                        
                        let user = await database.getUserGuild(wallet[0].userId, guildId)
                        if(user && user[0]) {
                            await setUserRole(role, wallet[0].userId, owner).catch((e) => {
                                console.error(`[setGuildRolesForUsersByContract] Error setting role: userId=${wallet[0].userId}, roleId=${role.roleId}, contract=${contract}, guildId=${guildId}`, e)
                            })
                        }
                    } catch (ownerError) {
                        // Continue processing other owners even if one fails
                        console.error(`[setGuildRolesForUsersByContract] Error processing owner: roleId=${role.roleId}, contract=${contract}, guildId=${guildId}`, ownerError)
                    }
                }
            } catch (roleError) {
                // Continue processing other roles even if one fails
                console.error(`[setGuildRolesForUsersByContract] Error processing role: roleId=${role?.roleId}, contract=${contract}, guildId=${guildId}`, roleError)
            }
        }
    } catch (e) {
        console.error(`[setGuildRolesForUsersByContract] Unexpected error: contract=${contract}, guildId=${guildId}`, e)
    }
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
    try {
        let users = await database.getUsersInGuild(guildId)
        if (!users || !Array.isArray(users)) {
            console.warn(`[setRoleForGuildUsers] No users found for guildId=${guildId}, roleId=${roleId}`)
            return
        }
        
        let formattedUsers = []
        users.forEach(user => {
            if (!user || !user.userId || !user.wallet) {
                return
            }
            
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
        if (!role || !role[0]) {
            console.warn(`[setRoleForGuildUsers] Role not found: roleId=${roleId}, guildId=${guildId}`)
            return
        }
        
        let guild = await global.client.guilds.cache.get(guildId)
        if (!guild) {
            console.warn(`[setRoleForGuildUsers] Guild not found: guildId=${guildId}, roleId=${roleId}`)
            return
        }
        
        try {
            await guild.members.fetch()
        } catch (fetchError) {
            console.error(`[setRoleForGuildUsers] Error fetching members: guildId=${guildId}, roleId=${roleId}`, fetchError)
        }
        
        let discordRole = await guild.roles.cache.get(roleId)
        if (!discordRole) {
            console.warn(`[setRoleForGuildUsers] Discord role not found: roleId=${roleId}, guildId=${guildId}`)
            return
        }
        
        let membersWithRole = []
        try {
            membersWithRole = discordRole.members.map(m=>m.user);
        } catch (roleError) {
            console.warn(`[setRoleForGuildUsers] Error getting members with role: roleId=${roleId}, guildId=${guildId}`, roleError)
        }
        
        if(role[0].contract) {
            let url = `https://api.opentheta.io/v1/contracts/${role[0].contract}/attributes?includeForSale=${Boolean(role[0].include_market)}`
            let res = await axios.get(url, {
                headers: { 'User-Agent':'OT ThetaGuard Bot' }
            }).catch((e) => {
                console.error(`[setRoleForGuildUsers] API error: roleId=${roleId}, guildId=${guildId}, url=${url}`, e)
                return null
            })
            
            if (!res || !res.data || !res.data.owners) {
                console.warn(`[setRoleForGuildUsers] Invalid API response: roleId=${roleId}, guildId=${guildId}`)
                // Still try to remove roles from users who shouldn't have them
                for(let user of formattedUsers) {
                    try {
                        if(membersWithRole.find((member) => {return user.userId === member.id})) {
                            await setUserRole(role[0], user.userId, undefined)
                        }
                    } catch (userError) {
                        console.error(`[setRoleForGuildUsers] Error removing role from user: userId=${user?.userId}, roleId=${roleId}, guildId=${guildId}`, userError)
                    }
                }
                return
            }
            
            let owners = res.data.owners
            if (!Array.isArray(owners)) {
                console.warn(`[setRoleForGuildUsers] Owners is not an array: roleId=${roleId}, guildId=${guildId}`)
                return
            }

            for(let user of formattedUsers) {
                try {
                    let owner;
                    for(let wallet of user.wallets) {
                        if (!wallet) continue
                        
                        let o = owners.find((o) => {
                            return o.address.toLowerCase() === wallet.toLowerCase()
                        })
                        if(owner && o) {
                            owner.ownedAmount += o.ownedAmount
                            Object.keys(o.attributes || {}).forEach(key => {
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
                    await setUserRole(role[0], user.userId, owner)
                } catch (userError) {
                    // Continue processing other users even if one fails
                    console.error(`[setRoleForGuildUsers] Error processing user: userId=${user?.userId}, roleId=${roleId}, guildId=${guildId}`, userError)
                }
            }
        } else {
            // Role has no contract, remove from all users who have it
            for(let user of formattedUsers) {
                try {
                    if(membersWithRole.find((member) => {return user.userId === member.id})) {
                        await setUserRole(role[0], user.userId, undefined)
                    }
                } catch (userError) {
                    console.error(`[setRoleForGuildUsers] Error removing role from user: userId=${user?.userId}, roleId=${roleId}, guildId=${guildId}`, userError)
                }
            }
        }
    } catch (e) {
        console.error(`[setRoleForGuildUsers] Unexpected error: guildId=${guildId}, roleId=${roleId}`, e)
    }
}

async function setRolesForUsers(rolesToCheck) {
    try {
        const keys = Object.keys(rolesToCheck);
        for(let key of keys) {
            let role = rolesToCheck[key]
            if (!role || !role.contract) {
                console.warn(`[setRolesForUsers] Invalid role data for roleId=${key}`)
                continue
            }
            
            let url = `https://api.opentheta.io/v1/contracts/${role.contract}/attributes?includeForSale=${Boolean(role.include_market)}`
            let res = await axios.get(url, {
                headers: { 'User-Agent':'OT ThetaGuard Bot' }
            }).catch((e) => {
                console.error(`[setRolesForUsers] API error for roleId=${key}, guildId=${role.guildId}, url=${url}`, e)
                return null
            })
            
            if (!res || !res.data || !res.data.owners) {
                console.warn(`[setRolesForUsers] Invalid API response for roleId=${key}, guildId=${role.guildId}`)
                // Continue processing other roles even if this one fails
                continue
            }
            
            let owners = res.data.owners
            if (!Array.isArray(owners)) {
                console.warn(`[setRolesForUsers] Owners is not an array for roleId=${key}, guildId=${role.guildId}`)
                continue
            }
            
            if (!role.users || !Array.isArray(role.users)) {
                console.warn(`[setRolesForUsers] No users array for roleId=${key}, guildId=${role.guildId}`)
                continue
            }
            
            for(let user of role.users) {
                try {
                    if (!user || !user.userId || !user.wallets) {
                        console.warn(`[setRolesForUsers] Invalid user data for roleId=${key}, guildId=${role.guildId}`)
                        continue
                    }
                    
                    let owner = owners.find((owner) => {
                        return user.wallets.some(wallet => owner.address.toLowerCase() === wallet.toLowerCase());
                    });
                    
                    await setUserRole(role, user.userId, owner)
                } catch (userError) {
                    // Continue processing other users even if one fails
                    console.error(`[setRolesForUsers] Error processing user: userId=${user?.userId}, roleId=${key}, guildId=${role.guildId}`, userError)
                }
            }
        }
    } catch (e) {
        console.error(`[setRolesForUsers] Unexpected error`, e)
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