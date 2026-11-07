const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder, 
    REST, 
    Routes, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    MessageFlags 
} = require('discord.js');
const express = require('express');
require('dotenv').config();

// ==========================================
// 1. CONFIGURATION & WEB SERVER SETUP
// ==========================================
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => res.send('Coastal Cart Bot is online.'));
app.listen(PORT, '0.0.0.0', () => console.log(`Web server listening on port ${PORT}`));

const STAFF_ROLE_ID = '1533372358755221566';
const NO_VOUCH_ROLE_ID = '1557329338943283240';
const VOUCH_CHANNEL_ID = '1507271897962778706';
const PASTEL_BLUE = 0xAEC6CF;

// Active tracking stores
const activeVouches = new Map();
const activeStickies = new Map(); // Map<channelId, { message, lastMessageId }>

// Helper to generate a random unique 6-character alphanumeric code
function generateUniqueVouchCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    do {
        code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    } while (activeVouches.has(code));
    return code;
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// ==========================================
// 2. SLASH COMMAND DEFINITIONS & REGISTRATION
// ==========================================
const commands = [
    new SlashCommandBuilder()
        .setName('sticky')
        .setDescription('Manage channel sticky messages')
        .addSubcommand(sub =>
            sub.setName('enable')
               .setDescription('Enable a sticky message at the bottom of the channel')
               .addStringOption(opt => 
                   opt.setName('message')
                      .setDescription('The message to stick to the bottom of the channel.')
                      .setRequired(true)
               )
        )
        .addSubcommand(sub =>
            sub.setName('disable')
               .setDescription('Disable the sticky message in this channel')
        ),

    new SlashCommandBuilder()
        .setName('vouch')
        .setDescription('Create a vouch timer and requirement for a buyer')
        .addUserOption(opt => opt.setName('buyer').setDescription('Select the buyer').setRequired(true)),

    new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Send a payment requirement embed with GCash details and QR code')
        .addNumberOption(option =>
            option.setName('price')
                .setDescription('The total amount to pay')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('calcu')
        .setDescription('Calculate numbers with support for k, m, square root, and Roblox tax (ct/nct)')
        .addStringOption(option =>
            option.setName('expression')
                .setDescription('Enter math expression (e.g., 1.5k + 500, sqrt(16), 100ct, or 100nct)')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('roblox-calcu')
        .setDescription('Calculate Roblox purchase totals based on method, rate per 100 rbx, and amount')
        .addStringOption(option =>
            option.setName('method')
                .setDescription('Select the purchase method')
                .setRequired(true)
                .addChoices(
                    { name: 'Via Plus', value: 'via plus' },
                    { name: 'Gamepass', value: 'gamepass' },
                    { name: 'Payout', value: 'payout' },
                    { name: 'Gifting', value: 'gifting' }
                )
        )
        .addNumberOption(option =>
            option.setName('rate')
                .setDescription('Rate in PHP per 100 Robux (e.g., 60)')
                .setRequired(true)
        )
        .addNumberOption(option =>
            option.setName('amount')
                .setDescription('Total amount of Robux needed by the buyer (e.g., 2000)')
                .setRequired(true)
        )
].map(cmd => cmd.toJSON());

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    client.user.setActivity('vouch within 12 hours !', { type: 3 });
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Slash commands registered successfully!');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
});

// ==========================================
// 3. EVENT LISTENERS (VOUCHES & STICKY REPOSTING)
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    // --- Sticky Message Repost Handler ---
    if (activeStickies.has(message.channel.id)) {
        const stickyData = activeStickies.get(message.channel.id);
        
        if (stickyData.lastMessageId) {
            try {
                const oldMsg = await message.channel.messages.fetch(stickyData.lastMessageId).catch(() => null);
                if (oldMsg) await oldMsg.delete();
            } catch (e) {}
        }

        try {
            const stickyEmbed = new EmbedBuilder()
                .setColor(PASTEL_BLUE)
                .setDescription(`_ _\n${stickyData.message}\n_ _`);

            const newStickyMsg = await message.channel.send({ embeds: [stickyEmbed] });
            stickyData.lastMessageId = newStickyMsg.id;
        } catch (e) {
            console.error('Failed to repost sticky message:', e);
        }
    }

    // --- Vouch Channel Format Listener ---
    if (message.channel.id === VOUCH_CHANNEL_ID) {
        const content = message.content;
        const vouchRegex = /^i\s+lav\s+coastal\s+cart:\s+for\s+.+?\+\s*.+?\s+and\s+(\S+)\s+.+?!$/is;
        const match = content.match(vouchRegex);

        if (match) {
            const usedCode = match[1];
            if (activeVouches.has(usedCode)) {
                const vouchData = activeVouches.get(usedCode);
                if (!vouchData.fulfilled) {
                    vouchData.fulfilled = true;
                    try {
                        await message.react('<a:a009_bluebow1491899840941129808:1555584862511956129>');
                        await message.react('<:001:1568197288608665701>');
                    } catch (e) {
                        console.error('Failed to react to vouch message:', e);
                    }
                }
            }
        }
    }
});

// ==========================================
// 4. CENTRAL INTERACTION ROUTER
// ==========================================
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const member = interaction.member;

        if (interaction.commandName === 'sticky' || interaction.commandName === 'vouch') {
            if (!member || !member.roles.cache.has(STAFF_ROLE_ID)) {
                return interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
            }
        }

        switch (interaction.commandName) {
            case 'sticky':
                return await handleStickyCommand(interaction);
            case 'vouch':
                return await handleVouchCommand(interaction);
            case 'pay':
                return await handlePayCommand(interaction);
            case 'calcu':
                return await handleCalcuCommand(interaction);
            case 'roblox-calcu':
                return await handleRobloxCalcuCommand(interaction);
            default:
                break;
        }
    } else if (interaction.isButton()) {
        if (interaction.customId === 'copy_acc_number') {
            return await interaction.reply({ 
                content: 'Your account number is: `0969 323 8079`', 
                flags: MessageFlags.Ephemeral 
            });
        }
    }
});

// ==========================================
// 5. COMMAND HANDLERS
// ==========================================

// --- /sticky Command Handler ---
async function handleStickyCommand(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const channelId = interaction.channelId;

    if (subcommand === 'enable') {
        const customMessage = interaction.options.getString('message');

        const stickyEmbed = new EmbedBuilder()
            .setColor(PASTEL_BLUE)
            .setDescription(`_ _\n${customMessage}\n_ _`);

        const sentMsg = await interaction.channel.send({ embeds: [stickyEmbed] });

        activeStickies.set(channelId, {
            message: customMessage,
            lastMessageId: sentMsg.id
        });

        return interaction.reply({ content: '✅ Sticky message enabled successfully!', flags: MessageFlags.Ephemeral });
    } 
    else if (subcommand === 'disable') {
        if (!activeStickies.has(channelId)) {
            return interaction.reply({ content: '❌ There is no active sticky message in this channel.', flags: MessageFlags.Ephemeral });
        }

        const stickyData = activeStickies.get(channelId);
        if (stickyData.lastMessageId) {
            try {
                const oldMsg = await interaction.channel.messages.fetch(stickyData.lastMessageId).catch(() => null);
                if (oldMsg) await oldMsg.delete();
            } catch (e) {}
        }

        activeStickies.delete(channelId);
        return interaction.reply({ content: '✅ Sticky message disabled for this channel.', flags: MessageFlags.Ephemeral });
    }
}

// --- /vouch Command Handler ---
async function handleVouchCommand(interaction) {
    const buyer = interaction.options.getUser('buyer');
    const vouchCode = generateUniqueVouchCode();

    const now = Date.now();
    const expiryTime = now + (12 * 60 * 60 * 1000);
    const countdownString = `<t:${Math.floor(expiryTime / 1000)}:R>`;

    activeVouches.set(vouchCode, {
        buyerId: buyer.id,
        channelId: interaction.channelId,
        expiresAt: expiryTime,
        fulfilled: false
    });

    const vouchEmbedDescription = 
`_ _
 vouch your ιtems wιthιn 12 hours:
 follow the vouch formɑt gιven <:022:1567870763246161940> 
_ _
<:locket:1560692689513746487> your vouch code is:
\` ${vouchCode} \`
-# ${buyer}, you hɑve ${countdownString} to vouch !
_ _`;

    const embed = new EmbedBuilder()
        .setColor(PASTEL_BLUE)
        .setDescription(vouchEmbedDescription);

    const sentMessage = await interaction.channel.send({ 
        content: `${buyer}`, 
        embeds: [embed] 
    });

    await interaction.reply({ 
        content: `✅ Vouch timer sent for ${buyer} (Generated Code: \`${vouchCode}\`).`, 
        flags: MessageFlags.Ephemeral 
    });

    setTimeout(async () => {
        const currentVouchState = activeVouches.get(vouchCode);
        if (currentVouchState && !currentVouchState.fulfilled) {
            try {
                await sentMessage.react('<:proc:1556231449055862824>');
                await sentMessage.react('<a:spiral:1555857356082909315>');
            } catch (err) {
                console.error('Failed to add expiration reactions:', err);
            }

            const targetChannel = await client.channels.fetch(currentVouchState.channelId).catch(() => null);
            if (targetChannel) {
                const penaltyMessage = 
`_ _
     ur wɑrrɑntιe's voιded <:022:1567870763246161940> 
     you cɑnnot  creɑte ɑ  tix
     for 24 hours;  temp  bɑn.
_ _`;
                await targetChannel.send({ 
                    content: `<@${currentVouchState.buyerId}>`, 
                    embeds: [new EmbedBuilder().setColor(PASTEL_BLUE).setDescription(penaltyMessage)] 
                });
            }

            try {
                const guild = interaction.guild;
                const targetMember = await guild.members.fetch(currentVouchState.buyerId).catch(() => null);
                if (targetMember) {
                    await targetMember.roles.add(NO_VOUCH_ROLE_ID);

                    setTimeout(async () => {
                        await targetMember.roles.remove(NO_VOUCH_ROLE_ID).catch(() => {});
                    }, 24 * 60 * 60 * 1000);
                }
            } catch (err) {
                console.error('Failed to assign warranty void role:', err);
            }

            activeVouches.delete(vouchCode);
        }
    }, 12 * 60 * 60 * 1000);
}

// --- /pay Command Handler ---
async function handlePayCommand(interaction) {
    const price = interaction.options.getNumber('price');
    const formattedPrice = price.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    const imageUrl = 'https://cdn.discordapp.com/attachments/1560207522521022494/1568499475004260503/yra_gcash.png?ex=6af00a78&is=6aeeb8f8&hm=b469c05251d56e50c5ea02977884fc9a9258e42dce7aa43be3b67fd6c80df3c2';

    const embedDescription = 
`_ _
       <:yellowdns:1568478334906667019><:yellowdns:1568478334906667019><:yellowdns:1568478334906667019><:yellowdns:1568478334906667019><:yellowdns:1568478334906667019><:yellowdns:1568478334906667019><:yellowdns:1568478334906667019>
          **ƒor gcɑsh pɑyment :**
-# _ _         qr code included. scan !

> -# _ _   <:025:1567870892082470992>   \` 0969 323 8079  \`
> -# _ _   <:025:1567870892082470992>   \` A.F. \` ɑcc initiɑls

> -# _ _   **totαl αmount to pαy:**   \` ₱     ${formattedPrice} \`

-# _ _   <:zz_blueheart3:1555584821529546752>   send **screenshot** of the receipt
-# _ _   <:zz_blueheart3:1555584821529546752>   extra ɑmount sent ɑre tippies !
_ _`;

    const copyButton = new ButtonBuilder()
        .setCustomId('copy_acc_number')
        .setLabel('copy acc number')
        .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(copyButton);

    const embed = new EmbedBuilder()
        .setColor(PASTEL_BLUE)
        .setDescription(embedDescription)
        .setImage(imageUrl);

    await interaction.channel.send({
        embeds: [embed],
        components: [row]
    });

    return interaction.reply({ content: '✅ Payment embed sent successfully to the channel!', flags: MessageFlags.Ephemeral });
}

// --- /calcu Command Handler ---
async function handleCalcuCommand(interaction) {
    const exprInput = interaction.options.getString('expression');

    try {
        let processedExpr = exprInput.trim().toLowerCase();

        if (/^\d+(?:\.\d+)?\s*ct$/.test(processedExpr)) {
            const target = parseFloat(processedExpr);
            const listPrice = Math.ceil(target / 0.7);
            const embed = new EmbedBuilder()
                .setColor(PASTEL_BLUE)
                .setDescription(`\` input \` : ${exprInput}\n\` result (Covered Tax) \` : List at **${listPrice.toLocaleString()}** Robux to receive **${target.toLocaleString()}**`);
            return interaction.reply({ embeds: [embed] });
        }

        if (/^\d+(?:\.\d+)?\s*nct$/.test(processedExpr)) {
            const listAmount = parseFloat(processedExpr);
            const received = Math.floor(listAmount * 0.7);
            const embed = new EmbedBuilder()
                .setColor(PASTEL_BLUE)
                .setDescription(`\` input \` : ${exprInput}\n\` result (Not Covered Tax) \` : Listing at **${listAmount.toLocaleString()}** yields **${received.toLocaleString()}** Robux`);
            return interaction.reply({ embeds: [embed] });
        }

        processedExpr = processedExpr.replace(/sqrt\s*\(([^)]+)\)/g, 'Math.sqrt($1)');
        processedExpr = processedExpr.replace(/(\d+(?:\.\d+)?)\s*([km])/gi, (match, num, suffix) => {
            const multiplier = suffix.toLowerCase() === 'k' ? 1000 : 1000000;
            return parseFloat(num) * multiplier;
        });

        if (!/^[\d\+\-\*\/\.\(\)\sMath\.sqrt]+$/.test(processedExpr)) {
            return interaction.reply({ 
                content: '❌ Invalid expression! Use numbers, operators (+, -, *, /), k/m shorthand, sqrt(), or tax shorthand (ct/nct).', 
                flags: MessageFlags.Ephemeral 
            });
        }

        const result = Function('"use strict";return (' + processedExpr + ')')();

        if (isNaN(result) || !isFinite(result)) {
            return interaction.reply({ content: '❌ Invalid mathematical calculation result.', flags: MessageFlags.Ephemeral });
        }

        const embed = new EmbedBuilder()
            .setColor(PASTEL_BLUE)
            .setDescription(`\` input \` : ${exprInput}\n\` result \` : **${result.toLocaleString()}**`);

        return interaction.reply({ embeds: [embed] });
    } catch (err) {
        return interaction.reply({ content: '❌ Failed to calculate expression. Please check your format (e.g., `1.5k + 500`, `sqrt(144)`, `100ct`).', flags: MessageFlags.Ephemeral });
    }
}

// --- /roblox-calcu Command Handler ---
async function handleRobloxCalcuCommand(interaction) {
    const method = interaction.options.getString('method');
    const rate = interaction.options.getNumber('rate');
    const amount = interaction.options.getNumber('amount');

    const totalPrice = (amount / 100) * rate;
    const formattedPrice = totalPrice.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    let embedDescription = '';

    if (method === 'gamepass') {
        const ct = Math.ceil(amount / 0.7);
        const nct = Math.floor(amount * 0.7);

        embedDescription = 
            `_ _\n` +
            `**rbx amount:** \` ${amount.toLocaleString()} \`\n` +
            `**ct:** \` ${ct.toLocaleString()} \`\n` +
            `**nct:** \` ${nct.toLocaleString()} \`\n` +
            `**price:** \` ₱     ${formattedPrice} \`\n` +
            `_ _`;
    } else {
        embedDescription = 
            `_ _\n` +
            `**rbx amount:** \` ${amount.toLocaleString()} \`\n` +
            `**price:** \` ₱     ${formattedPrice} \`\n` +
            `_ _`;
    }

    const embed = new EmbedBuilder()
        .setColor(PASTEL_BLUE)
        .setDescription(embedDescription);

    return interaction.reply({ embeds: [embed] });
}

client.login(process.env.DISCORD_TOKEN);
