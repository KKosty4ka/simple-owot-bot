import { Tile } from "./tile";

/**
 * A chat location.
 */
export type ChatLocation = "page" | "global";

/**
 * An incoming cmd message.
 */
export interface CmdEvent
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

    /**
     * Sender's IP address. Requires OP to see.
     * @see {@link Bot.receiveCmdIps}
     */
    ip?: string;

    /**
     * The link coords, if avaliable.
     */
    coords?: [number, number];
}

/**
 * An incoming chat message.
 */
export interface ChatEvent
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
     * Custom metadata, if any.
     */
    customMeta?: { [key: string]: string };

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
export interface TileUpdateEvent
{
    /**
     * The channel id of the person who edited the tile(s).
     * @remarks
     * Not to be trusted.
     */
    channel: string,

    /**
     * The updated tiles.
     * 
     * {"tileX,tileY": tile}
     */
    tiles: Map<string, Tile>
}