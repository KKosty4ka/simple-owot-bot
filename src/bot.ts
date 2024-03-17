import { sleep } from "./private_utils";
import { EventEmitter } from "events";
import { Tile, Char } from "./tile";
import * as utils from "./utils";
import { WebSocket } from "ws";

export interface Bot extends EventEmitter
{
    /**
     * Fired when the bot connects to the server.
     */
    on(event: "connected", listener: () => void): this;

    /**
     * Fired when the bot disconnects from the server.
     */
    on(event: "disconnected", listener: () => void): this;

    /**
     * Fired when chat history becomes avaliable.
     */
    on(event: "chathistory", listener: () => void): this;

    /**
     * Fired when a cmd message is received.
     */
    on(event: "cmd", listener: (event: CmdEvent) => void): this;

    /**
     * Fired when a chat message is received.
     */
    on(event: "chat", listener: (event: ChatEvent) => void): this;

    /**
     * Fired when the write buffer becomes empty.
     */
    on(event: "writeBufferEmpty", listener: () => void): this;

    /**
     * Fired when a tile update is received.
     */
    on(event: "tileUpdate", listener: (event: TileUpdateEvent) => void): this;

    /**
     * Fired when the user count changes.
     */
    on(event: "userCountUpdate", listener: (oldCount: number, newCount: number) => void): this;

    /**
     * Fired when an announcement is shown.
     */
    on(event: "announcement", listener: (text: string) => void): this;

    /**
     * Fired when a chat message is deleted.
     * @remarks
     * "subject to change" - fp
     */
    on(event: "chatdelete", listener: (id: number, date: Date) => void): this;


    /**
     * Fired when any packet is received.
     * @internal
     */
    on(event: "message", listener: (data: any) => void): this;

    /**
     * Fired when a cmd packet is received.
     * @internal
     */
    on(event: "message_cmd", listener: (data: any) => void): this;

    /**
     * Fired when a chat packet is received.
     * @internal
     */
    on(event: "message_chat", listener: (data: any) => void): this;

    /**
     * Fired when a write packet is received.
     * @internal
     */
    on(event: "message_write", listener: (data: any) => void): this;

    /**
     * Fired when a tileUpdate packet is received.
     * @internal
     */
    on(event: "message_tileUpdate", listener: (data: any) => void): this;

    /**
     * Fired when a fetch packet is received.
     * @internal
     */
    on(event: "message_fetch", listener: (data: any) => void): this;

    /**
     * Fired when a chathistory packet is received.
     * @internal
     */
    on(event: "message_chathistory", listener: (data: any) => void): this;

    /**
     * Fired when a ping packet is received.
     * @internal
     */
    on(event: "message_ping", listener: (data: any) => void): this;

    /**
     * Fired when a channel packet is received.
     * @internal
     */
    on(event: "message_channel", listener: (data: any) => void): this;

    /**
     * Fired when a user_count packet is received.
     * @internal
     */
    on(event: "message_user_count", listener: (data: any) => void): this;

    /**
     * Fired when a announcement packet is received.
     * @internal
     */
    on(event: "message_announcement", listener: (data: any) => void): this;

    /**
     * Fired when a chatdelete packet is received.
     * @internal
     */
    on(event: "message_chatdelete", listener: (data: any) => void): this;
}

/**
 * A bot for ourworldoftext.com or any custom server running OWOT.
 */
export class Bot extends EventEmitter
{
    private ws: WebSocket;
    private _userCount: number | undefined;
    private _channelId: string;
    private _chatId: number;

    private nextPingId: number = 0;
    private nextEditId: number = 0;
    private nextFetchId: number = 0;

    private flushInterval: NodeJS.Timeout;
    private writeBuffer: any[][] = [];
    private waitingEdits: any = {};

    public pageChatHistory: ChatEvent[];
    public globalChatHistory: ChatEvent[];
    private tiles: any = {};

    /**
     * Creates a new bot.
     * @param url - The url to connect to. Please use ?hide=1 to prevent inflating the user count.
     * @param token - An Uvias token to use. (Optional)
     * @param flushInterval -s The initial flush interval. May be changed later with {@link setFlushInterval}. Default value is 0.
     * @example
     * Connect to the front page of OWOT as an anon.
     * ```js
     * var bot = new Bot("wss://ourworldoftext.com/ws/?hide=1");
     * ```
     * @example
     * Connect to /myworld with an account.
     * ```js
     * var bot = new Bot("wss://ourworldoftext.com/myworld/ws/?hide=1", "blahblahblah|4564786786");
     * ```
     * @example
     * Connect to /myworld with an account and set a flush interval of 1 second.
     * ```js
     * var bot = new Bot("wss://ourworldoftext.com/myworld/ws/?hide=1", "blahblahblah|4564786786", 1000);
     * ```
     */
    public constructor(url: string, token?: string, flushInterval: number = 0)
    {
        super();

        this.ws = new WebSocket(url, {
            headers: {
                "Cookie": token ? `token=${token}` : ""
            }
        });

        this.ws.on("message", (data: string) => this.emit("message", JSON.parse(data)));
        this.ws.on("close", () => this.emit("disconnected"));
        this.ws.on("open", () =>
        {
            this.transmit({
                kind: "chathistory"
            });

            this.transmit({
                kind: "cmd_opt"
            });

            this.setFlushInterval(flushInterval);
        });

        // TODO: still a mess :\
        this.on("message", (data: any) => this.emit("message_" + data.kind, data));

        this.on("message_cmd", (data: any) =>
        {
            this.emit("cmd", {
                data: data.data,
                senderChannel: data.sender,

                registered: data.username ? true : false,
                username: data.username ?? null,
                uviasId: data.id ?? null,
            });
        });

        this.on("message_chat", (data: any) =>
        {
            this.emit("chat", {
                id: data.id,
                nickname: data.nickname,

                realUsername: data.realUsername,
                registered: data.registered,
                op: data.op,
                admin: data.admin,
                staff: data.staff,

                location: data.location,
                message: data.message,
                color: data.color,
                date: data.date,

                rankName: data.rankName,
                rankColor: data.rankColor
            });
        });

        this.on("message_write", (data: any) =>
        {
            for (var j = 0; j < data.accepted.length; j++) delete this.waitingEdits[data.accepted[j]];

            for (var i in data.rejected)
            {
                var rej: number = data.rejected[i];

                if (rej === 1 || rej === 4) delete this.waitingEdits[i];
                else this.writeBuffer.push(this.waitingEdits[i]);
            }

            if (Object.keys(this.waitingEdits).length === 0 && this.writeBuffer.length === 0) this.emit("writeBufferEmpty");
        });

        this.on("message_tileUpdate", (data: any) =>
        {
            var evtTiles: any = {};

            for (var coords in data.tiles)
            {
                var nums = coords.split(",");
                var tileX = Number.parseInt(nums[1]);
                var tileY = Number.parseInt(nums[0]);

                var tile = new Tile(tileX, tileY, data.tiles[coords]);
                this.tiles[`${tileX},${tileY}`] = tile;
                evtTiles[`${tileX},${tileY}`] = tile;
            }

            this.emit("tileUpdate", {
                channel: data.channel,
                tiles: evtTiles
            });
        });

        this.on("message_fetch", (data: any) =>
        {
            for (var coords in data.tiles)
            {
                var nums = coords.split(",");
                var tileX = Number.parseInt(nums[1]);
                var tileY = Number.parseInt(nums[0]);

                this.tiles[`${tileX},${tileY}`] = new Tile(tileX, tileY, data.tiles[coords]);
            }
        });

        this.on("message_chathistory", (data: any) =>
        {
            this.globalChatHistory = data.global_chat_prev;
            this.pageChatHistory = data.page_chat_prev;

            this.emit("chathistory");
        });

        this.on("message_channel", (data: any) =>
        {
            this._channelId = data.sender;
            this._chatId = data.id;
            this._userCount = data.initial_user_count;

            this.emit("connected");
        });

        this.on("message_user_count", (data: any) =>
        {
            var old = this._userCount;
            this._userCount = data.count;

            this.emit("userCountUpdate", old, data.count);
        });

        this.on("message_announcement", (data: any) =>
        {
            this.emit("announcement", data.text);
        });

        this.on("message_chatdelete", (data: any) =>
        {
            // "subject to change" - fp
            this.emit("chatdelete", data.id, data.time);
        });
    }


    /**
     * The current user count, or undefined if the world has no chat.
     * @example
     * ```js
     * bot.chat(`There are currently ${bot.userCount} users online.`);
     * ```
     */
    public get userCount(): number | undefined
    {
        return this._userCount;
    }

    /**
     * The bot's channel id. Used in tile updates and cmd messages.
     * @example
     * ```js
     * bot.chat(`My channel ID is ${bot.channelId}.`);
     * ```
     */
    public get channelId(): string
    {
        return this._channelId;
    }

    /**
     * The bot's chat id, or -1 if the world has no chat.
     * @remarks
     * If the world has no chat, the bot can still send messages in global, but it is impossible to get the chat id.
     * @example
     * ```js
     * bot.chat(`As you can see, my chat ID is ${bot.chatId}.`);
     * ```
     */
    public get chatId(): number
    {
        return this._chatId;
    }


    /**
     * Flush all pending writes from the write buffer.
     */
    public flushWrites(): void
    {
        if (!this.writeBuffer.length) return;

        this.transmit({
            kind: "write",
            edits: this.writeBuffer.splice(0, 512)
        });
    }

    /**
     * Set the flush interval.
     * @param interval - The interval, in ms.
     * @example
     * Set a flush interval of 5 seconds.
     * ```js
     * bot.setFlushInterval(5000);
     * ```
     */
    public setFlushInterval(interval: number): void
    {
        clearInterval(this.flushInterval);
        this.flushInterval = setInterval(this.flushWrites.bind(this), interval);
    }

    /**
     * Clears all pending writes and fires the "writeBufferEmpty" event
     */
    public clearWriteBuffer(): void
    {
        this.waitingEdits = {};
        this.writeBuffer = [];

        this.emit("writeBufferEmpty");
    }


    /**
     * Deprecated, do not use.
     * @deprecated Instead use the "connected" event.
     */
    public waitForReady(): Promise<void>
    {
        return new Promise((resolve, reject) =>
        {
            if (this.ws.readyState === WebSocket.OPEN) resolve();
            else if (this.ws.readyState === WebSocket.CONNECTING)
            {
                var onopen = () =>
                {
                    this.ws.off("open", onopen);
                    resolve();
                }

                this.ws.on("open", onopen);
            }
            else reject("This bot has been disconnected already.");
        });
    }

    /**
     * Sends JSON data to the server.
     * @param json - A JSON object to send.
     * @internal
     */
    private transmit(json: any): void
    {
        this.ws.send(JSON.stringify(json));
    }


    /**
     * Check the connection speed.
     * @returns Connection delay, in milliseconds.
     * @example
     * ```js
     * var ping = await bot.ping();
     * bot.chat(`My ping is ${ping} ms.`);
     * ```
     */
    public ping(): Promise<number>
    {
        return new Promise((resolve, reject) =>
        {
            var id = ++this.nextPingId;
            var startDate = Date.now();

            var onmsg = (data: any) =>
            {
                if (data.id != id) return;

                this.off("message_ping", onmsg);
                resolve(Date.now() - startDate);
            }

            this.on("message_ping", onmsg);
            this.transmit({
                kind: "ping",
                id
            });
        });
    }

    /**
     * Send a chat message.
     * @param message - The text of the message.
     * @param location - Where to send the message. {@link ChatLocation.Page} by default.
     * @param nickname - A nickname. Empty by default.
     * @param color - The name color, for some weird reason as a string. Black by default.
     * @example
     * ```js
     * bot.chat("Hi everyone!", ChatLocation.Global, "", "#112233");
     * ```
     */
    public chat(message: string, location: ChatLocation = ChatLocation.Page, nickname: string = "", color: string = "#000000"): void
    {
        this.transmit({
			kind: "chat",
			nickname: nickname,
			message: message,
			location: location,
			color: color
		});
    }


    /**
     * Moves the bot's guest cursor and shows it if it's hidden.
     * @param x - The X coordinate.
     * @param y - The X coordinate.
     * @example
     * ```js
     * bot.moveCursor(123, 456);
     * ```
     */
    public moveCursor(x: number, y: number): void
    {
        var [tileX, tileY, charX, charY] = utils.coordsCharToTile(x, y);

        this.transmit({
            kind: "cursor",
            position: {
                tileX,
                tileY,
                charX,
                charY
            }
        });
    }

    /**
     * Hides the bot's guest cursor.
     * @example
     * ```js
     * bot.hideCursor();
     * ```
     */
    public hideCursor(): void
    {
        this.transmit({
            kind: "cursor",
            hidden: true
        });
    }


    /**
     * Writes a character on the canvas.
     * @param x - The X coordinate.
     * @param y - The Y coordinate.
     * @param char - The character. Only one at a time, for multiple see {@link writeText}
     * @param color - The color as an 0xRRGGBB integer. Black by default.
     * @param bgcolor - The background color as an 0xRRGGBB integer, or -1 for none (default).
     * @example
     * Write a green "E" at 0, 0
     * ```js
     * bot.writeChar(0, 0, "E", 0x008000);
     * ```
     * @example
     * Write a blue "c" on red background at 1, 2
     * ```js
     * bot.writeChar(1, 2, "c", 0x0000ff, 0xff0000);
     * ```
     */
    public writeChar(x: number, y: number, char: string, color: number = 0x000000, bgcolor: number = -1): void
    {
        var edit = [Math.floor(y / 8), Math.floor(x / 16), y - Math.floor(y / 8) * 8, x - Math.floor(x / 16) * 16, Date.now(), char, ++this.nextEditId, color, bgcolor];

        this.writeBuffer.push(edit);
        this.waitingEdits[edit[6].toString()] = edit;
    }

    /**
     * Write a string on the canvas.
     * @param x - The X coordinate.
     * @param y - The Y coordinate.
     * @param text - The string.
     * @param color - The color as an 0xRRGGBB integer. Black by default.
     * @param bgcolor - The background color as an 0xRRGGBB integer, or -1 for none (default).
     * @example
     * Write a green "hi!" at 0, 0
     * ```js
     * bot.writeText(0, 0, "hi!", 0x008000);
     * ```
     * @example
     * Write a blue "fuck" on red background at 1, 2
     * ```js
     * bot.writeText(1, 2, "fuck", 0x0000ff, 0xff0000);
     * ```
     */
    public writeText(x: number, y: number, text: string, color: number = 0x000000, bgcolor: number = -1): void
    {
        const ix = x;
        var stext = utils.advancedSplit(text);

        for (var i = 0; i < stext.length; i++)
        {
            var char = stext[i];

            if (char === "\n")
            {
                x = ix;
                y++;
            }
            else
            {
                this.writeChar(x, y, char, color, bgcolor);
				x++;
            }
        }
    }

    /**
     * Creates a URL link on the canvas.
     * @param x - The X coordinate.
     * @param y - The Y coordinate.
     * @param url - The URL.
     * @example
     * Create a link to /main at 0, 0
     * ```js
     * bot.urlLink(0, 0, "/main");
     * ```
     * @example
     * Create a link to youtube at 1, 2
     * ```js
     * bot.urlLink(1, 2, "https://youtube.com/");
     * ```
     */
    public urlLink(x: number, y: number, url: string): void
    {
        var [tileX, tileY, charX, charY] = utils.coordsCharToTile(x, y);

        this.transmit({
            kind: "link",
            data: {
                tileY,
                tileX,
                charY,
                charX,
                url
            },
            type: "url"
        });
    }

    /**
     * Creates a coord link on the canvas.
     * @param x - The X coordinate.
     * @param y - The Y coordinate.
     * @param linkX - X of the target location.
     * @param linkY - Y of the target location.
     * @remarks
     * linkX and linkY are in coordinates, not chars.
     * One coordinate = 4 tiles.
     * @example
     * Link to 123, 456 at 0, 0.
     * ```js
     * bot.coordLink(0, 0, 123, 456);
     * ```
     */
    public coordLink(x: number, y: number, linkX: number, linkY: number): void
    {
        var [tileX, tileY, charX, charY] = utils.coordsCharToTile(x, y);

        this.transmit({
            kind: "link",
            data: {
                tileY,
                tileX,
                charY,
                charX,
                link_tileX: linkX,
                link_tileY: linkY
            },
            type: "coord"
        });
    }


    /**
     * Fetches the tiles in a given rectangle.
     * @param minX - Left X coordinate.
     * @param minY - Top Y coordinate.
     * @param maxX - Right X coordinate.
     * @param maxY - Bottom Y coordinate.
     * @remarks
     * The coordinates are in tiles, not chars.
     * The returned promise resolves once the tiles have been received.
     * You can fetch up to 2500 tiles at a time.
     * @example
     * Fetch tiles from -5, -5 to 5, 5.
     * ```js
     * bot.fetchTiles(-5, -5, 5, 5);
     * // The tiles may now be used, for example with Bot.getChar(x, y).
     * ```
     */
    public fetchTiles(minX: number, minY: number, maxX: number, maxY: number): Promise<void>
    {
        return new Promise((resolve, reject) =>
        {
            if ((maxX - minX) * (maxY - minY) > 2500) return reject("too many tiles fetched at once, 2500 is max");

            var id = this.nextFetchId++;

            var onmsg = (data: any) =>
            {
                if (data.request != id) return;

                this.off("message_fetch", onmsg);
                resolve();
            }

            this.on("message_fetch", onmsg);
            this.transmit({
                kind: "fetch",
                request: id,
                fetchRectangles: [
                    {
                        minX,
                        minY,
                        maxX,
                        maxY
                    }
                ]
            });
        });
    }

    /**
     * Sets the tile update boundary.
     * Tile updated outside this boundary will not be received.
     * @param minX - Left X coordinate.
     * @param minY - Top Y coordinate.
     * @param maxX - Right X coordinate.
     * @param maxY - Bottom Y coordinate.
     * @remarks
     * The coordinates are in tiles, not chars.
     * There is a maximum size, but i forgor :skull:
     * @todo remember
     * @example
     * Set the boundary from -5, -5 to 5, 5.
     * ```js
     * bot.setBoundary(-5, -5, 5, 5);
     * ```
     */
    public setBoundary(minX: number, minY: number, maxX: number, maxY: number): void
    {
        this.transmit({
            kind: "boundary",
            minX,
            minY,
            maxX,
            maxY,
            centerX: Math.floor((maxX - minX) / 2 + minX),
            centerY: Math.floor((maxY - minY) / 2 + minY)
        });
    }

    /**
     * Gets a character at the specified location.
     * @param x - The X coordinate.
     * @param y - The Y coordinate.
     * @returns The character or null if the location is not loaded (try Bot.fetchTiles).
     * @example
     * ```js
     * await bot.fetchTiles(0, 0, 0, 0); // Make sure the character is loaded.
     * var char = bot.getChar(0, 0);
     * 
     * if (!char)
     * {
     *     console.log("character at 0, 0 is not loaded (somehow?)");
     *     return;
     * }
     * 
     * console.log(`The character at 0, 0 is "${char.char}" with the color ${char.color}, background color ${char.bgColor} and protection ${char.protection}`);
     * 
     * if (typeof(char.link) === "string")
     * {
     *     console.log(`The link at 0, 0 leads to the URL ${char.link}`);
     * }
     * else if (Array.isArray(char.link))
     * {
     *     console.log(`The link at 0, 0 leads to the coordinates ${char.link[0]}, ${char.link[1]}`);
     * }
     * ```
     */
    public getChar(x: number, y: number): Char | null
    {
        var [tileX, tileY, charX, charY] = utils.coordsCharToTile(x, y);

        var tile = this.tiles[`${tileX},${tileY}`];
        if (!tile) return null;

        return tile.getChar(charX, charY);
    }


    /**
     * Quickly clear an area.
     * @param x - The left X coordinate of the area.
     * @param y - The top Y coordinate of the area.
     * @param width - The width of the area.
     * @param height - The height of the area.
     * @remarks
     * Requires "Erase areas rapidly" permission.
     * @example
     * ```js
     * await bot.clearArea(-100, -100, 100, 100);
     * ```
     * @beta
     */
    public async clearArea(x: number, y: number, width: number, height: number): Promise<void>
    {
        // mostly stolen from owot source code
        var [tileX1, tileY1, charX1, charY1] = utils.coordsCharToTile(x, y);
        var [tileX2, tileY2, charX2, charY2] = utils.coordsCharToTile(x + width, y + height);

        var tx1 = tileX1;
        var ty1 = tileY1;
        var tx2 = tileX2;
        var ty2 = tileY2;

        if (charX1) tx1++;
        if (charY1) ty1++;
        if (charX2 < 16 - 1) tx2--;
        if (charY2 < 8 - 1) ty2--;

        for (var dy = tileY1; dy <= tileY2; dy++)
        {
            for (var dx = tileX1; dx <= tileX2; dx++)
            {
                var leftEdge = dx == tileX1 && charX1 > 0;
                var topEdge = dy == tileY1 && charY1 > 0;
                var rightEdge = dx == tileX2 && charX2 < (16 - 1);
                var bottomEdge = dy == tileY2 && charY2 < (8 - 1);
                var cx1 = 0;
                var cy1 = 0;
                var cx2 = 16 - 1;
                var cy2 = 8 - 1;

                if (leftEdge || topEdge || rightEdge || bottomEdge)
                {
                    if (leftEdge) cx1 = charX1;
                    if (topEdge) cy1 = charY1;
                    if (rightEdge) cx2 = charX2;
                    if (bottomEdge) cy2 = charY2;

                    this.transmit({
                        kind: "clear_tile",

                        tileX: dx,
                        tileY: dy,

                        charX: cx1,
                        charY: cy1,

                        charWidth: cx2 - cx1 + 1,
                        charHeight: cy2 - cy1 + 1
                    });
                }
                else
                {
                    this.transmit({
                        kind: "clear_tile",

                        tileX: dx,
                        tileY: dy
                    });
                }

                await sleep(1000 / 80);
            }
        }
    }

    /**
     * Protect an area.
     * @param x - The left X coordinate of the area.
     * @param y - The top Y coordinate of the area.
     * @param width - The width of the area.
     * @param height - The height of the area.
     * @param protection - The desired protection.
     * @example
     * ```js
     * await bot.protect(-100, -100, 100, 100, Protection.MemberOnly);
     * ```
     * @beta
     */
    public async protect(x: number, y: number, width: number, height: number, protection: Protection): Promise<void>
    {
        // mostly stolen from owot source code
        var [tileX1, tileY1, charX1, charY1] = utils.coordsCharToTile(x, y);
        var [tileX2, tileY2, charX2, charY2] = utils.coordsCharToTile(x + width, y + height);

        var tx1 = tileX1;
        var ty1 = tileY1;
        var tx2 = tileX2;
        var ty2 = tileY2;

        if (charX1) tx1++;
        if (charY1) ty1++;
        if (charX2 < 16 - 1) tx2--;
        if (charY2 < 8 - 1) ty2--;

        for (var dy = tileY1; dy <= tileY2; dy++)
        {
            for (var dx = tileX1; dx <= tileX2; dx++)
            {
                var leftEdge = dx == tileX1 && charX1 > 0;
                var topEdge = dy == tileY1 && charY1 > 0;
                var rightEdge = dx == tileX2 && charX2 < (16 - 1);
                var bottomEdge = dy == tileY2 && charY2 < (8 - 1);
                var cx1 = 0;
                var cy1 = 0;
                var cx2 = 16 - 1;
                var cy2 = 8 - 1;

                if (leftEdge || topEdge || rightEdge || bottomEdge)
                {
                    if (leftEdge) cx1 = charX1;
                    if (topEdge) cy1 = charY1;
                    if (rightEdge) cx2 = charX2;
                    if (bottomEdge) cy2 = charY2;

                    this.transmit({
                        kind: "protect",
                        action: protection === Protection.Default ? "unprotect" : "protect",
                        data: {
                            tileX: dx,
                            tileY: dy,

                            charX: cx1,
                            charY: cy1,

                            charWidth: cx2 - cx1 + 1,
                            charHeight: cy2 - cy1 + 1,

                            precise: true,
                            type: protection === Protection.Default ? undefined : protection
                        }
                    });
                }
                else
                {
                    this.transmit({
                        kind: "protect",
                        action: protection === Protection.Default ? "unprotect" : "protect",
                        data: {
                            tileX: dx,
                            tileY: dy,
                            type: protection === Protection.Default ? undefined : protection
                        }
                    });
                }

                await sleep(1000 / 80);
            }
        }
    }
}

/**
 * An incoming cmd message.
 */
interface CmdEvent
{
    /**
     * The data.
     */
    data: string;

    /**
     * The sender's channel id.
     */
    senderChannel: string;

    /**
     * Whether the sender has an account or not.
     */
    registered: boolean;

    /**
     * Sender's username (only if {@link registered} is true)
     */
    username?: string;

    /**
     * Sender's Uvias id (only if {@link registered} is true)
     */
    uviasId?: string;
}

/**
 * A chat location.
 */
export enum ChatLocation
{
    /**
     * "This page" chat.
     */
    Page = "page",

    /**
     * "Global" chat.
     */
    Global = "global"
}

/**
 * A protection value.
 */
export enum Protection
{
    /**
     * Inherit the actual protection value from the world settings.
     */
    Default = "default",

    /**
     * Editable by everybody.
     */
    Public = "public",

    /**
     * Editably only by the world's members.
     */
    MemberOnly = "member-only",

    /**
     * Editable only by the world's owner.
     */
    OwnerOnly = "owner-only"
}

/**
 * An incoming chat message.
 */
interface ChatEvent
{
    /**
     * Sender's chat id.
     */
    id: number;

    /**
     * Sender's nickname.
     */
    nickname: string;

    /**
     * Sender's username (only if {@link registered} is true)
     */
    realUsername?: string;

    /**
     * Whether the sender is registered or not.
     */
    registered: boolean;

    /**
     * Whether the sender is an OP or not.
     */
    op: boolean;

    /**
     * Whether the sender is an admin or not.
     */
    admin: boolean;

    /**
     * Whether the sender is staff or not.
     */
    staff: boolean;

    /**
     * The location of the message
     */
    location: ChatLocation;

    /**
     * The message text.
     */
    message: string;

    /**
     * Sender's chat color.
     */
    color: string;

    /**
     * The date and time on which the message was sent.
     */
    date: Date;

    /**
     * Sender's rank name, if any.
     */
    rankName?: string;

    /**
     * Sender's rank color, if any.
     */
    rankColor?: string;
}

/**
 * A tile update.
 */
interface TileUpdateEvent
{
    /**
     * The channel id of the person who edited the tile(s).
     * @remarks
     * Not to be trusted.
     */
    channel: string,

    /**
     * The updated tiles.
     * @todo Document better.
     */
    tiles: any
}