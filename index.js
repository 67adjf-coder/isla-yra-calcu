const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder, 
    REST, 
    Routes, 
    EmbedBuilder 
} = require('discord.js');
const express = require('express');
require('dotenv').config();

// ==========================================
// 1. CONFIGURATION & WEB SERVER SETUP
// ==========================================
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => res.send('Payment and Calculator Bot is online.'));
app.listen(PORT, '0.0.0.0', () => console.log(`Web server listening on port ${PORT}`));

const PASTEL_BLUE = 0xAEC6CF;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ==========================================
// 2. SLASH COMMAND DEFINITIONS & REGISTRATION
// ==========================================
const commands = [
    new SlashCommandBuilder()
        .setName('pay')
        .setDescription('Send a payment requirement embed')
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
// 3. CENTRAL INTERACTION ROUTER
// ==========================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    switch (interaction.commandName) {
        case 'pay':
            return await handlePayCommand(interaction);
        case 'calcu':
            return await handleCalcuCommand(interaction);
        case 'roblox-calcu':
            return await handleRobloxCalcuCommand(interaction);
        default:
            break;
    }
});

// ==========================================
// 4. COMMAND HANDLERS
// ==========================================

// --- /pay Command Handler ---
async function handlePayCommand(interaction) {
    const price = interaction.options.getNumber('price');
    const formattedPrice = price.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

    const embed = new EmbedBuilder()
        .setColor(PASTEL_BLUE)
        .setDescription(
            `_ _\n` +
            `     ੭      ֹ      \` solitudꫀ \`         🏹𓏼\n` +
            `-# _ _         thᥱ   pαymᥱnt   is   rᥱquirᥱd   !\n\n` +
            `﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌\n` +
            `>   **totαl αmount to pαy:**   \` ₱     ${formattedPrice} \`\n\n` +
            `>        \`   0969   323   8079 \`  \n` +
            `> -# _ _        nᥱᥱd α qr? αsk __αwαy__ !\n\n` +
            `﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌﹌\n` +
            `-# _ _     send us the screenshot  of  the  receipt\n` +
            `-# _ _     sαved screenshots will not be credited\n` +
            `-# _ _     αnd α  trαnsαction history is required  !\n` +
            `_ _`
        );

    await interaction.channel.send({ embeds: [embed] });
    return interaction.reply({ content: '✅ Payment embed sent successfully!', ephemeral: true });
}

// --- /calcu Command Handler ---
async function handleCalcuCommand(interaction) {
    const exprInput = interaction.options.getString('expression');

    try {
        let processedExpr = exprInput.trim().toLowerCase();

        // 1. Roblox Tax shorthands (ct & nct)
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

        // 2. Square root function support
        processedExpr = processedExpr.replace(/sqrt\s*\(([^)]+)\)/g, 'Math.sqrt($1)');

        // 3. Shorthand multipliers 'k' and 'm'
        processedExpr = processedExpr.replace(/(\d+(?:\.\d+)?)\s*([km])/gi, (match, num, suffix) => {
            const multiplier = suffix.toLowerCase() === 'k' ? 1000 : 1000000;
            return parseFloat(num) * multiplier;
        });

        if (!/^[\d\+\-\*\/\.\(\)\sMath\.sqrt]+$/.test(processedExpr)) {
            return interaction.reply({ 
                content: '❌ Invalid expression! Use numbers, operators (+, -, *, /), k/m shorthand, sqrt(), or tax shorthand (ct/nct).', 
                ephemeral: true 
            });
        }

        const result = Function('"use strict";return (' + processedExpr + ')')();

        if (isNaN(result) || !isFinite(result)) {
            return interaction.reply({ content: '❌ Invalid mathematical calculation result.', ephemeral: true });
        }

        const embed = new EmbedBuilder()
            .setColor(PASTEL_BLUE)
            .setDescription(`\` input \` : ${exprInput}\n\` result \` : **${result.toLocaleString()}**`);

        return interaction.reply({ embeds: [embed] });
    } catch (err) {
        return interaction.reply({ content: '❌ Failed to calculate expression. Please check your format (e.g., `1.5k + 500`, `sqrt(144)`, `100ct`).', ephemeral: true });
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
