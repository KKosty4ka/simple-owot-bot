/*
A simple bot that outputs the global chat history and exits.
*/

const { Bot } = require("../lib");

var bot = new Bot("wss://ourworldoftext.com/w/ws/?hide=1");

// The "chathistory" event is fired when the chat history is loaded.
bot.on("chathistory", (global, page) =>
{
    console.log(global);
    
    process.exit(0);
});