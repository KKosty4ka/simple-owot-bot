import { WebSocket } from "ws";
import { EventEmitter } from "events";
import { Tile, Char } from "./tile";
import * as utils from "./utils";
import { sleep } from "./private_utils";

export interface Bot extends EventEmitter
{
    on(event: "connected", listener: () => void): this;
    on(event: "disconnected", listener: () => void): this;
    on(event: "chathistory", listener: () => void): this;
    on(event: "cmd", listener: (event: CmdEvent) => void): this;
    on(event: "chat", listener: (event: ChatEvent) => void): this;
    on(event: "writeBufferEmpty", listener: () => void): this;
    on(event: "tileUpdate", listener: (event: TileUpdateEvent) => void): this;

    on(event: "message", listener: (data: any) => void): this;
    on(event: "message_cmd", listener: (data: any) => void): this;
    on(event: "message_chat", listener: (data: any) => void): this;
    on(event: "message_write", listener: (data: any) => void): this;
    on(event: "message_tileUpdate", listener: (data: any) => void): this;
    on(event: "message_fetch", listener: (data: any) => void): this;
    on(event: "message_chathistory", listener: (data: any) => void): this;
    on(event: "message_ping", listener: (data: any) => void): this;
}

/**
 * A bot for ourworldoftext.com or any custom server running OWOT.
 */
export class Bot extends EventEmitter
{
    private ws: WebSocket;

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
     * @param url The url to connect to. Please use ?hide=1 to prevent inflating the user count.
     * @param token An Uvias token to use. (Optional)
     * @param flushInterval The initial flush interval. May be changed later with {@link setFlushInterval}. Default value is 0.
     * @example <caption>Connect to the front page of OWOT as an anon.</caption>
     * var bot = new Bot("wss://ourworldoftext.com/ws/?hide=1");
     * @example <caption>Connect to /myworld with an account.</caption>
     * var bot = new Bot("wss://ourworldoftext.com/myworld/ws/?hide=1", "blahblahblah|4564786786");
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
            this.emit("connected");
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
                date: data.date
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
     * @param interval The interval, in ms.
     */
    public setFlushInterval(interval: number): void
    {
        clearInterval(this.flushInterval);
        this.flushInterval = setInterval(this.flushWrites.bind(this), interval);
    }

    /**
     * Clears all pending writes.
     * @fires Bot#writeBufferEmpty
     */
    public clearWriteBuffer(): void
    {
        this.waitingEdits = {};
        this.writeBuffer = [];

        this.emit("writeBufferEmpty");
    }


    /**
     * Deprecated, do not use.
     * @deprecated
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
     * @param json A JSON object to send.
     */
    private transmit(json: any): void
    {
        this.ws.send(JSON.stringify(json));
    }


    /**
     * Check the connection speed.
     * @returns Connection delay, in milliseconds.
     * @example
     * var ping = await bot.ping();
     * bot.chat(`My ping is: ${ping}`);
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
     * @param message The text of the message.
     * @param location Where to send the message.    
     * @param nickname A nickname.
     * @param color The name color, for some weird reason as a string.
     * @example
     * bot.chat("Hi everyone!", "global", "", "#112233");
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
     */
    public writeChar(x: number, y: number, char: string, color: number = 0x000000, bgcolor: number = -1): void
    {
        var edit = [Math.floor(y / 8), Math.floor(x / 16), y - Math.floor(y / 8) * 8, x - Math.floor(x / 16) * 16, Date.now(), char, ++this.nextEditId, color, bgcolor];
        
        this.writeBuffer.push(edit);
        this.waitingEdits[edit[6].toString()] = edit;
    }

    /**
     * Writes text on the canvas.
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
     */
    public coordLink(x: number, y: number, link_tileX: number, link_tileY: number): void
    {
        var [tileX, tileY, charX, charY] = utils.coordsCharToTile(x, y);

        this.transmit({
            kind: "link",
            data: {
                tileY,
                tileX,
                charY,
                charX,
                link_tileX,
                link_tileY
            },
            type: "coord"
        });
    }


    /**
     * Fetches the tiles in the given rectangle.
     */
    public fetchTiles(minX: number, minY: number, maxX: number, maxY: number): Promise<void>
    {
        return new Promise((resolve, reject) =>
        {
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
     * Gets a character.
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
     * Requires "Erase areas rapidly" permission.
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

interface CmdEvent
{
    data: string;
    senderChannel: string;

    registered: boolean;
    username?: string;
    uviasId?: string;
}

enum ChatLocation
{
    Page = "page",
    Global = "global"
}

enum Protection
{
    Default = "default",
    Public = "public",
    MemberOnly = "member-only",
    OwnerOnly = "owner-only"
}

interface ChatEvent
{
    id: number;
    nickname: string;

    realUsername: string;
    registered: boolean;
    op: boolean;
    admin: boolean;
    staff: boolean;

    location: ChatLocation;
    message: string;
    color: string;
    date: Date;

    rankName: string;
    rankColor: string;
}

interface TileUpdateEvent
{
    channel: string,
    tiles: any
}