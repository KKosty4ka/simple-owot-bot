import { WebSocket } from "ws";
import { EventEmitter } from "events";
import { Tile, Char } from "./tile";
import * as utils from "./utils";

export declare interface Bot
{
    on(event: "connected", listener: () => void): this;
    on(event: "disconnected", listener: () => void): this;
    on(event: "chathistory", listener: () => void): this;
    on(event: "message", listener: (data: any) => void): this;
    on(event: "cmd", listener: (event: CmdEvent) => void): this;
    on(event: "chat", listener: (event: ChatEvent) => void): this;
    on(event: "writeBufferEmpty", listener: () => void): this;
    on(event: "tileUpdate", listener: (event: TileUpdateEvent) => void): this;
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

    private writeBuffer: any[][] = [];
    private waitingEdits: any = {};

    public pageChatHistory: ChatEvent[];
    public globalChatHistory: ChatEvent[];
    private tiles: any = {};

    /**
     * Creates a new bot.
     * @param url The url to connect to. Please use ?hide=1 to prevent inflating the user count.
     * @param token An Uvias token to use. (Optional)
     * @example <caption>Connect to the front page of OWOT as an anon.</caption>
     * var bot = new Bot("wss://ourworldoftext.com/ws/?hide=1");
     * @example <caption>Connect to /myworld with an account.</caption>
     * var bot = new Bot("wss://ourworldoftext.com/myworld/ws/?hide=1", "blahblahblah|4564786786");
     */
    public constructor(url: string, token?: string)
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

            // flushing writes
            setInterval(() =>
            {
                if (!this.writeBuffer.length) return;

                this.transmit({
                    kind: "write",
                    edits: this.writeBuffer.splice(0, 512)
                });
            });

            this.emit("connected");
        });

        // TODO: rewrite this awful mess
        this.on("message", (data: any) =>
        {
            if (data.kind === "cmd")
            {
                this.emit("cmd", {
                    data: data.data,
                    senderChannel: data.sender,

                    registered: data.username ? true : false,
                    username: data.username ?? null,
                    uviasId: data.id ?? null,
                });
            }
            else if (data.kind === "chat")
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
            }
            else if (data.kind === "write")
            {
                for (var j = 0; j < data.accepted.length; j++) delete this.waitingEdits[data.accepted[j]];

                for (var i in data.rejected)
                {
                    var rej: number = data.rejected[i];

                    if (rej === 1 || rej === 4) delete this.waitingEdits[i]; 
                    else this.writeBuffer.push(this.waitingEdits[i]);
                }

                if (Object.keys(this.waitingEdits).length === 0 && this.writeBuffer.length === 0) this.emit("writeBufferEmpty");
            }
            else if (data.kind === "tileUpdate")
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
            }
            else if (data.kind === "fetch")
            {
                for (var coords in data.tiles)
                {
                    var nums = coords.split(",");
                    var tileX = Number.parseInt(nums[1]);
                    var tileY = Number.parseInt(nums[0]);

                    this.tiles[`${tileX},${tileY}`] = new Tile(tileX, tileY, data.tiles[coords]);
                }
            }
            else if (data.kind === "chathistory")
            {
                this.globalChatHistory = data.global_chat_prev;
                this.pageChatHistory = data.page_chat_prev;

                this.emit("chathistory");
            }
        });
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
                if (data.kind !== "ping" || data.id != id) return;

                this.off("message", onmsg);
                resolve(Date.now() - startDate);
            }

            this.on("message", onmsg);
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
     * bot.chat("Hi everyone!", ChatLocation.Global, "", "#112233");
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
                if (data.kind !== "fetch" || data.request != id) return;

                this.off("message", onmsg);
                resolve();
            }

            this.on("message", onmsg);
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
    public setBoundary(minX: number, minY: number, maxX: number, maxY: number, centerX: number, centerY: number): void
    {
        this.transmit({
            kind: "boundary",
            minX,
            minY,
            maxX,
            maxY,
            centerX,
            centerY
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