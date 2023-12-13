/*
A simple bot that outputs the current WOTD and exits.
*/

const { Bot } = require("../lib");

var bot = new Bot("wss://ourworldoftext.com/ws/?hide=1");

bot.on("connected", async () =>
{
    await bot.fetchTiles(-1, 0, 0, 0);

    for (var x = -14; x < 16; x++)
    {
        var link = bot.getChar(x, 7).link;
        if (typeof link !== "string") continue;

        console.log(link);
        break;
    }
    
    process.exit(0);
});