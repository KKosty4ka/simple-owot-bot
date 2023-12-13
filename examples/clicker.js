/*
A simple clicker "game" for everyone to play.
Click on a "com:click" link to increase the counter.

Use `setInterval(network.cmd,0,"click")` to cheat.
*/

const { Bot } = require("../lib");

var bot = new Bot("wss://ourworldoftext.com/ws/?hide=1");
var clicks = 0;

function oncmd(e)
{
    if (e.data !== "click") return;

    clicks++;
    // maybe make a rate limit?
}

bot.on("connected", () =>
{
    bot.on("cmd", oncmd);

    setInterval(() =>
    {
        bot.writeText(-7, -1, `Clicks: ${clicks} `, 0x008000);
        bot.urlLink(-8, -1, "com:click");
    }, 100);
});