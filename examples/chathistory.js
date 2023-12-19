/*
A simple bot that outputs the front page chat history and exits.
*/

const { Bot } = require("../lib");

var bot = new Bot("wss://ourworldoftext.com/ws/?hide=1");

// The "chathistory" event is fired when the chat history becomes avaliable.
bot.on("chathistory", async () =>
{
    console.log(bot.pageChatHistory);
    
    process.exit(0);
});