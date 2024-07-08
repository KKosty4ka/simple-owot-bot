import { MessageChat, MessageChatHistory, MessageCmd, MessageFetch, MessagePing, MessageTileUpdate, MessageWrite, MessageChannel, MessageUserCount, MessageAnnouncement, MessageChatDelete, MessageCursor, MessageStats } from "./messages";
import { ChatEvent, CmdEvent, TileUpdateEvent, ChatLocation } from "./events";
import { sleep, advancedSplit } from "./private_utils";
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
     * Fired when chat history is loaded.
     */
    on(event: "chathistory", listener: (global?: ChatEvent[], page?: ChatEvent[]) => void): this;

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
     * Fired when a guest cursor moves or hides.
     * @remarks
     * The bot's own cursor movements are ignored.
     */
    on(event: "guestCursor", listener: (channelId: string, hidden: boolean, x?: number, y?: number) => void): this;

    /**
     * Fired when writes are accepted/rejected;
     */
    on(event: "writeResult", listener: (id: number, state: WriteResultState) => void): this;


    /**
     * Fired when any packet is received.
     * @internal
     */
    on(event: "message", listener: (data: any) => void): this;

    /**
     * Fired when a cmd packet is received.
     * @internal
     */
    on(event: "message_cmd", listener: (data: MessageCmd) => void): this;

    /**
     * Fired when a chat packet is received.
     * @internal
     */
    on(event: "message_chat", listener: (data: MessageChat) => void): this;

    /**
     * Fired when a write packet is received.
     * @internal
     */
    on(event: "message_write", listener: (data: MessageWrite) => void): this;

    /**
     * Fired when a tileUpdate packet is received.
     * @internal
     */
    on(event: "message_tileUpdate", listener: (data: MessageTileUpdate) => void): this;

    /**
     * Fired when a fetch packet is received.
     * @internal
     */
    on(event: "message_fetch", listener: (data: MessageFetch) => void): this;

    /**
     * Fired when a chathistory packet is received.
     * @internal
     */
    on(event: "message_chathistory", listener: (data: MessageChatHistory) => void): this;

    /**
     * Fired when a ping packet is received.
     * @internal
     */
    on(event: "message_ping", listener: (data: MessagePing) => void): this;

    /**
     * Fired when a channel packet is received.
     * @internal
     */
    on(event: "message_channel", listener: (data: MessageChannel) => void): this;

    /**
     * Fired when a user_count packet is received.
     * @internal
     */
    on(event: "message_user_count", listener: (data: MessageUserCount) => void): this;

    /**
     * Fired when a announcement packet is received.
     * @internal
     */
    on(event: "message_announcement", listener: (data: MessageAnnouncement) => void): this;

    /**
     * Fired when a chatdelete packet is received.
     * @internal
     */
    on(event: "message_chatdelete", listener: (data: MessageChatDelete) => void): this;

    /**
     * Fired when a cursor packet is received.
     * @internal
     */
    on(event: "message_cursor", listener: (data: MessageCursor) => void): this;

    /**
     * Fired when a stats packet is received.
     * @internal
     */
    on(event: "message_stats", listener: (data: MessageStats) => void): this;
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
    private nextStatsId: number = 0;

    private flushInterval: NodeJS.Timeout;
    private writeBuffer: Write[] = [];
    private waitingEdits: Map<number, Write> = new Map();

    private tiles: Map<string, Tile> = new Map();

    /**
     * Currently visible guest cursors. (coords by channel id)
     * @remarks
     * Does not include the bot's own cursor.
     */
    public guestCursors: Map<string, [number, number]> = new Map();

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

        this.on("message_cmd", (data: MessageCmd) =>
        {
            this.emit("cmd", {
                data: data.data,
                senderChannel: data.sender,

                registered: data.username ? true : false,
                username: data.username,
                uviasId: data.id,

                ip: data.ip,
                coords: data.coords ? utils.coordsTileToChar(...data.coords) : undefined
            });
        });

        this.on("message_chat", (data: MessageChat) =>
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

                customMeta: data.customMeta,

                rankName: data.rankName,
                rankColor: data.rankColor
            });
        });

        this.on("message_write", (data: MessageWrite) =>
        {
            for (var j = 0; j < data.accepted.length; j++)
            {
                var id = data.accepted[j];

                this.waitingEdits.delete(id);
                this.emit("writeResult", id, WriteResultState.Accepted);
            }

            for (var is in data.rejected)
            {
                var rej: number = data.rejected[is];
                var i = Number(is);

                if (rej === 1 || rej === 4)
                {
                    this.waitingEdits.delete(i);
                    this.emit("writeResult", i, WriteResultState.Rejected);
                }
                else
                {
                    this.emit("writeResult", i, WriteResultState.Ratelimited);

                    var edit = this.waitingEdits.get(i);
                    if (!edit) continue; // wtf

                    this.writeBuffer.push(edit);
                }
            }

            if (this.waitingEdits.size === 0 && this.writeBuffer.length === 0) this.emit("writeBufferEmpty");
        });

        this.on("message_tileUpdate", (data: MessageTileUpdate) =>
        {
            var evtTiles = new Map();

            for (var coords in data.tiles)
            {
                var nums = coords.split(",");
                var tileX = Number.parseInt(nums[1]);
                var tileY = Number.parseInt(nums[0]);

                var tile = new Tile(tileX, tileY, data.tiles[coords]);
                this.tiles.set(`${tileX},${tileY}`, tile);
                evtTiles.set(`${tileX},${tileY}`, tile);
            }

            this.emit("tileUpdate", {
                channel: data.channel,
                tiles: evtTiles
            });
        });

        this.on("message_fetch", (data: MessageFetch) =>
        {
            for (var coords in data.tiles)
            {
                var nums = coords.split(",");
                var tileX = Number.parseInt(nums[1]);
                var tileY = Number.parseInt(nums[0]);

                this.tiles.set(`${tileX},${tileY}`, new Tile(tileX, tileY, data.tiles[coords]));
            }
        });

        this.on("message_chathistory", (data: MessageChatHistory) =>
        {
            this.emit("chathistory", data.global_chat_prev, data.page_chat_prev);
        });

        this.on("message_channel", (data: MessageChannel) =>
        {
            this._channelId = data.sender;
            this._chatId = data.id;
            this._userCount = data.initial_user_count;

            this.emit("connected");
        });

        this.on("message_user_count", (data: MessageUserCount) =>
        {
            var old = this._userCount;
            this._userCount = data.count;

            this.emit("userCountUpdate", old, data.count);
        });

        this.on("message_announcement", (data: MessageAnnouncement) =>
        {
            this.emit("announcement", data.text);
        });

        this.on("message_chatdelete", (data: MessageChatDelete) =>
        {
            // "subject to change" - fp
            this.emit("chatdelete", data.id, data.time);
        });

        this.on("message_cursor", (data: MessageCursor) =>
        {
            if (data.channel === this.channelId) return;

            if (data.hidden)
            {
                this.emit("guestCursor", data.channel, true);
                this.guestCursors.delete(data.channel);
            }
            else
            {
                if (!data.position) throw new Error();

                var [x, y] = utils.coordsTileToChar(data.position.tileX, data.position.tileY, data.position.charX, data.position.charY);

                this.emit("guestCursor", data.channel, false, x, y);
                this.guestCursors.set(data.channel, [x, y]);
            }
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
        this.waitingEdits.clear();
        this.writeBuffer = [];

        this.emit("writeBufferEmpty");
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

            var onmsg = (data: MessagePing) =>
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
     * Get the world stats.
     * @returns The world stats.
     */
    public stats(): Promise<Stats>
    {
        return new Promise((resolve, reject) =>
        {
            var id = ++this.nextStatsId;

            var onmsg = (data: MessageStats) =>
            {
                if (data.id !== id) return;
                
                this.off("message_stats", onmsg);
                resolve({
                    creationDate: data.creationDate,
                    views: data.views
                });
            }

            this.on("message_stats", onmsg);
            this.transmit({
                kind: "stats",
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
     * @param customMeta - A custom metadata object. (optional)
     * @example
     * ```js
     * bot.chat("Hi everyone!", ChatLocation.Global, "", "#112233", {myMeta: "this is for other bots or scripts"});
     * ```
     */
    public chat(message: string, location: ChatLocation = "page", nickname: string = "", color: string = "#000000", customMeta?: { [key: string]: string }): void
    {
        this.transmit({
			kind: "chat",
			nickname,
			message,
			location,
			color,
            customMeta
		});
    }

    /**
     * Send a cmd message.
     * @param data - The text of the message.
     * @param include_username - Whether to include the bot's username and Uvias ID (default false).
     * @param coords - The link coords, if any.
     * @example
     * ```js
     * bot.cmd("hi cmders!");
     * ```
     * @example
     * ```js
     * bot.cmd("hi cmders! (you can see my username too)", true);
     * ```
     * @example
     * ```js
     * bot.cmd("hi cmders! (you can see the coords of the link i clicked on)", false, [123, 456]);
     * ```
     */
    public cmd(data: string, include_username: boolean = false, coords?: [number, number])
    {
        this.transmit({
            kind: "cmd",
            data,
            include_username,
            coords: coords ? utils.coordsCharToTile(...coords) : undefined
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
     */
    public writeChar(x: number, y: number, char: string, color: number = 0x000000, bgcolor: number = -1): void
    {
        var id = ++this.nextEditId;
        
        var edit: Write = [
            Math.floor(y / 8),
            Math.floor(x / 16),
            y - Math.floor(y / 8) * 8,
            x - Math.floor(x / 16) * 16,
            Date.now(),
            char,
            id,
            color,
            bgcolor
        ];

        this.writeBuffer.push(edit);
        this.waitingEdits.set(id, edit);
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
     */
    public writeText(x: number, y: number, text: string, color: number = 0x000000, bgcolor: number = -1): void
    {
        const ix = x;
        var stext = advancedSplit(text);

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

            var onmsg = (data: MessageFetch) =>
            {
                if (data.request !== id) return;

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

        var tile = this.tiles.get(`${tileX},${tileY}`);
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
                        action: protection === "default" ? "unprotect" : "protect",
                        data: {
                            tileX: dx,
                            tileY: dy,

                            charX: cx1,
                            charY: cy1,

                            charWidth: cx2 - cx1 + 1,
                            charHeight: cy2 - cy1 + 1,

                            precise: true,
                            type: protection === "default" ? undefined : protection
                        }
                    });
                }
                else
                {
                    this.transmit({
                        kind: "protect",
                        action: protection === "default" ? "unprotect" : "protect",
                        data: {
                            tileX: dx,
                            tileY: dy,
                            type: protection === "default" ? undefined : protection
                        }
                    });
                }

                await sleep(1000 / 80);
            }
        }
    }


    /**
     * Enable or disable receiving tile updates.
     * @param receive - true = receive, false = don't
     */
    public receiveTileUpdates(receive: boolean): void
    {
        this.transmit({
            kind: "config",
            updates: receive
        });
    }

    /**
     * Enable or disable receiving sender's IP address in cmd messages.
     * @remarks
     * Requires OP.
     * @param receive - true = receive, false = don't
     */
    public receiveCmdIps(receive: boolean): void
    {
        this.transmit({
            kind: "config",
            descriptiveCmd: receive
        });
    }

    /**
     * Enable or disable receiving tile updates from outside the boundary.
     * @remarks
     * Requires membership or ownership of the world (or OP).
     * @param receive - true = receive, false = don't
     * @see {@link setBoundary}
     */
    public receiveGlobalTileUpdates(receive: boolean): void
    {
        this.transmit({
            kind: "config",
            localFilter: !receive
        });
    }
}

/**
 * A write.
 * @internal
 */
type Write = [number, number, number, number, number, string, number, number, number];

/**
 * A protection value.
 */
export type Protection = "default" | "public" | "member-only" | "owner-only";

enum WriteResultState
{
    Accepted,
    Ratelimited,
    Rejected
}

export interface Stats
{
    creationDate: number,
    views: number
}