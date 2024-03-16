/*
Logs in with a username and a password, outputs the token.
*/

const { utils } = require("../lib");

(async () =>
{
    console.log(await utils.uviasLogin("username", "password", "token.txt"));
})();