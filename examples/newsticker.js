/*
A newsticker bot with the text editable by any user through chat.

Most code taken from yagton's newsticker script:
https://github.com/tlras/owotscripts/blob/master/scripts/newsticker.js
*/

const { Bot } = require("../lib");

var bot = new Bot("wss://ourworldoftext.com/ws/?hide=1");

var news_location = [-16, -9]; // use [cursorCoords[0] * 16 + cursorCoords[2], cursorCoords[1] * 8 + cursorCoords[3]] to get this
var news_width = 32;

var news_text = "europe and lice go back to textwall";
var news_color = 0x008000;

function onchat(e)
{
    if (!e.message.startsWith("!ticker ")) return;

    news_text = e.message.substring(8);
    bot.chat("ok", e.location, "newsticker", "#000000");
}

bot.on("connected", () =>
{
    bot.on("chat", onchat);

    var text_pos = -news_width;
    setInterval(() =>
    {
        const text = news_text.padEnd(news_width, " ");
        var subsect = text.slice(Math.max(0, text_pos), text_pos + news_width);

        text_pos += 1;
        if (text_pos > news_text.length)
            text_pos = -news_width;

        subsect = text_pos < 0
            ? subsect.padStart(news_width, " ")
            : subsect.padEnd(news_width, " ");

        bot.writeText(...news_location, subsect, news_color);
    }, 100);
});