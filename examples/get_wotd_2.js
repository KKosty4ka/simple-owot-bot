/*
A bot that detects when the WOTD changes.
*/

const { Bot } = require("../lib");

var bot = new Bot("wss://ourworldoftext.com/ws/?hide=1");
var wotd;

function getwotd()
{
    for (var x = -14; x < 16; x++)
    {
        var link = bot.getChar(x, 7).link;
        if (typeof link !== "string") continue;

        return link;
    }
}

function ontileupdate(e)
{
    if (!e.tiles.hasOwnProperty("-1,0")) return;

    var newwotd = getwotd();
    if (wotd === newwotd) return;

    console.log(newwotd);
    wotd = newwotd;
}

bot.on("connected", async () =>
{
    bot.setBoundary(-1, 0, 0, 0); // tile update boundary
    await bot.fetchTiles(-1, 0, 0, 0);

    bot.on("tileUpdate", ontileupdate);

    wotd = getwotd();
    console.log(wotd);
});