import { ChatLocation } from "./events";
import { RawTile } from "./tile";

/**
 * @internal
 */
export interface MessageCmd
{
    kind: "cmd";
    data: string;
    sender: string;
    username?: string;
    id?: string;
    ip?: string;
    coords?: [number, number, number, number];
}

/**
 * @internal
 */
export interface MessageChat
{
    kind: "chat";
    id: number;
    nickname: string;
    realUsername?: string;
    registered: boolean;
    op: boolean;
    admin: boolean;
    staff: boolean;
    location: ChatLocation;
    message: string;
    color: string; // why
    date: number;
    rankName?: string;
    rankColor?: string; // why
    privateMessage?: "to_me" | "from_me";
}

/**
 * @internal
 */
export interface MessageWrite
{
    kind: "write";
    accepted: number[];
    rejected: {
        [id: string]: number;
    };
}

/**
 * @internal
 */
export interface MessageTileUpdate
{
    kind: "tileUpdate";
    channel: string; // bullshit
    tiles: {
        [coords: string]: RawTile;
    };
}

/**
 * @internal
 */
export interface MessageFetch
{
    kind: "fetch";
    request?: number;
    tiles: {
        [coords: string]: RawTile;
    };
}

/**
 * @internal
 */
interface ChatHistoryElement
{
    id: number;
    nickname: string;
    realUsername?: string;
    registered: boolean;
    op: boolean;
    admin: boolean;
    staff: boolean;
    location: ChatLocation;
    message: string;
    color: string; // why
    date: number;
    rankName?: string;
    rankColor?: string; // why
}

/**
 * @internal
 */
export interface MessageChatHistory
{
    kind: "chathistory";
    global_chat_prev: ChatHistoryElement[];
    page_chat_prev: ChatHistoryElement[];
}

/**
 * @internal
 */
export interface MessagePing
{
    kind: "ping";
    id: number;
}

/**
 * @internal
 */
export interface MessageChannel
{
    kind: "channel";
    sender: string;
    id: number;
    initial_user_count?: number;
}

/**
 * @internal
 */
export interface MessageUserCount
{
    kind: "user_count";
    count: number;
}

/**
 * @internal
 */
export interface MessageAnnouncement
{
    kind: "announcement";
    text: string;
}

/**
 * @internal
 */
export interface MessageChatDelete
{
    kind: "chatdelete";
    id: number;
    time: number;
}

/**
 * @internal
 */
export interface MessageCursor
{
    kind: "cursor";
    channel: string;
    hidden?: true;
    position?: {
        tileX: number;
        tileY: number;
        charX: number;
        charY: number;
    };
}