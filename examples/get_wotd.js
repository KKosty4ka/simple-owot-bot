/*
A simple bot that outputs the current WOTD and exits.
*/

const { Bot } = require("../lib");

var bot = new Bot("wss://ourworldoftext.com/ws/?hide=1");

bot.on("connected", () =>
{
    bot.fetchTiles(-1, 0, -1, 0);

    // Bot.fetchTiles currently doesn't return a Promise, so waiting is the only option.
    // This will be fixed soon™.
    setTimeout(() =>
    {
        console.log(bot.getChar(-7, 7).link);
        process.exit(0);
    }, 1000);
});