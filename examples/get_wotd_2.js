/*
A bot that detects when the WOTD changes.
*/

const { Bot } = require("../lib");

var bot = new Bot("wss://test.ourworldoftext.com/ws/?hide=1");
var wotd;

function ontileupdate(e)
{
    if (!e.tiles.hasOwnProperty("-1,0")) return;

    var newwotd = bot.getChar(-7, 7).link;
    if (typeof newwotd !== "string") return; // if the link was removed, don't do anything
    if (newwotd === wotd) return;

    wotd = newwotd;
    console.log(wotd); // output the new wotd
}

(async () =>
{
    await bot.waitForReady();
    bot.fetchTiles(-1, 0, -1, 0);
    bot.setBoundary(-1, 0, -1, 0, -1, 0); // tile update boundary

    bot.on("tileUpdate", ontileupdate);

    // Bot.fetchTiles currently doesn't return a Promise, so waiting is the only option.
    // This will be fixed soon™.
    setTimeout(() =>
    {
        wotd = bot.getChar(-7, 7).link;
        console.log(wotd);
    }, 1000);
})();