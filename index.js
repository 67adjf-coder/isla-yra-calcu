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
// CONFIGURATION & SETUP
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
// SLASH COMMAND DEFINITIONS & REGISTRATION
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
        .setDescription('Calculate Roblox gamepass taxes accurately')
        .addNumberOption(option =>
            option.setName('amount')
                .setDescription('The Robux amount (target to receive or listing price)')
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
// INTERACTION HANDLER
// ==========================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // --- /pay Command ---
    if (commandName === 'pay') {
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

    // --- /calcu Command ---
    if (commandName === 'calcu') {
        const exprInput = interaction.options.getString('expression');

        try {
            let processedExpr = exprInput.trim().toLowerCase();

            // 1. Roblox Tax shorthands (ct & nct)
            if (/^\d+(?:\.\d+)?\s*ct$/.test(processedExpr)) {
                const target = parseFloat(processedExpr);
                const listPrice = Math.ceil(target / 0.7); // Standard RBXTax math logic
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

    // --- /roblox-calcu Command ---
    if (commandName === 'roblox-calcu') {
        const amount = interaction.options.getNumber('amount');

        // Accurate marketplace tax formulas (matching standard tools like RBXTax)
        const coveredTaxPrice = Math.ceil(amount / 0.7); // Price to list so you receive 'amount' exactly
        const nonCoveredTax = Math.floor(amount * 0.7);     // What you receive if you list at 'amount'

        const embed = new EmbedBuilder()
            .setColor(PASTEL_BLUE)
            .setDescription(
                `_ _\n` +
                `**price to pay** : \` ${amount.toLocaleString()} \`\n` +
                `**covered tax price** : \` ${coveredTaxPrice.toLocaleString()} \`\n` +
                `**non-covered tax** : \` ${nonCoveredTax.toLocaleString()} \`\n` +
                `_ _`
            );

        return interaction.reply({ embeds: [embed] });
    }
});

client.login(process.env.DISCORD_TOKEN);
