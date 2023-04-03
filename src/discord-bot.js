const axios = require('axios')
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, ChannelType, time} = require("discord.js")
require("dotenv").config();
const wait = require('node:timers/promises').setTimeout;
const {FOOTER_TEXT, DESCRIPTION, LOGO_URL, VERIFY_BASE_URL, USER_REQUESTS, ADMIN_REQUESTS} = require('./Config')
const database = require("../models/dbHelpers");
const {ethers} = require("ethers");

module.exports = {
    newGuild,
    letsGoButton,
    setupRolesButton,
    setRoleForGuildUsers,
    setRolesForUser,
    setRoleForUser,
    setRolesForUsers,
    setGuildRolesForUsersByContract
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
    let content = `Use this custom link to connect (valid for 5 minutes) \nGuild: ${interaction.message.guildId} Member: ${interaction.user.id}`

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
            let url = `https://api.opentheta.io/v1/contracts/${role.contract}/attributes?includeForSale=${Boolean(role.include_market)}`
            let res = await axios.get(url, {
                headers: {'User-Agent': 'OT ThetaGuard Bot'}
            }).catch((e) => {
                console.log(e)
            })

            let owners = res.data.owners
            let owner = owners.find((owner) => {
                return owner.address.toLowerCase() === user[0].wallet.toLowerCase()
            })

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
    let guild = await global.client.guilds.cache.get(role.guildId)
    let discordRole = await guild.roles.cache.get(role.roleId)
    if(userData && userData.ownedAmount >= role.min_amount && (role.max_amount === null || userData.ownedAmount <= role.max_amount)) {
        if(role.trait_type && role.trait_value) {
            if(userData.attributes && userData.attributes[role.trait_type] && userData.attributes[role.trait_type].includes(role.trait_value)){
                console.log("role added (1)")
                let member = await guild.members.fetch(userId);
                await member.roles.add(discordRole)
            } else {
                console.log("role removed (1)")
                let member = await guild.members.fetch(userId);
                await member.roles.remove(discordRole)
            }
        } else {
            console.log("role added (2)")
            let member = await guild.members.fetch(userId);
            await member.roles.add(discordRole)
        }
    } else {
        console.log("role removed (2)")
        let member = await guild.members.fetch(userId);
        await member.roles.remove(discordRole)
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

async function setRoleForGuildUsers(guildId, roleId) {
    let users = await database.getUsersInGuild(guildId)
    let role = await database.getGuildRole(roleId)
    let guild = await global.client.guilds.cache.get(guildId)
    await guild.members.fetch()
    let membersWithRole = guild.roles.cache.get(roleId).members.map(m=>m.user);
    let discordRole = await guild.roles.cache.get(roleId)
    let url = `https://api.opentheta.io/v1/contracts/${role[0].contract}/attributes?includeForSale=${Boolean(role[0].include_market)}`
    let res = await axios.get(url, {
        headers: { 'User-Agent':'OT ThetaGuard Bot' }
    }).catch((e) => {console.log("Error",e)})
    let owners = res.data.owners
    users.forEach((user) => {
        let owner = owners.find((owner) => {
            return owner.address === user.wallet.toLowerCase()
        })
        if(owner) {
            setUserRole(role[0], user.userId, owner)
        } else {
            if(membersWithRole.find((member) => {return user.userId === member.id})) {
                guild.members.fetch(user.userId).then((member) => {
                    member.roles.remove(discordRole)
                })
            }
        }
    })
}

async function setRolesForUsers(rolesToCheck) {
    const keys = Object.keys(rolesToCheck);
    for(let key of keys) {
        let role = rolesToCheck[key]
        let url = `https://api.opentheta.io/v1/contracts/${role.contract}/attributes?includeForSale=${Boolean(role.include_market)}`
        let res = await axios.get(url, {
            headers: { 'User-Agent':'OT ThetaGuard Bot' }
        }).catch((e) => {console.log("Error",e)})
        let owners = res.data.owners
        for(let user of rolesToCheck[key].users) {
            let owner = owners.find((owner) => {
                return owner.address === user.wallet.toLowerCase()
            })
            await setUserRole(role, user.userId, owner)
        }
    }
}