import { advancedSplit } from "./utils";

/**
 * The base64 table used for decoding protection values.
 * @internal
 */
const b64table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Turns a numerical protection value into a normal one.
 * @param value - The numerical protection value.
 * @returns The decoded protection value.
 * @internal
 */
function unshiftProtection(value: number): Protection
{
    // sometimes i hate typescript
    if (value === 1) return 0;
    else if (value === 2) return 1;
    else if (value === 3) return 2;
    else return null;
}

/**
 * Decodes protection values.
 * @param tile - Tile data.
 * @returns An array of protection values.
 * @internal
 */
function decodeProtection(tile: any): Protection[]
{
    var output = new Array(128).fill(null);
    if (!tile.properties.char) return output;

    var data = tile.properties.char.substring(1);

    for (var i = 0; i < data.length; i++)
    {
        var byte = b64table.indexOf(data[i]);

        output[i * 3] = unshiftProtection(byte >> 4 & 3);
        output[i * 3 + 1] = unshiftProtection(byte >> 2 & 3);
        output[i * 3 + 2] = unshiftProtection(byte & 3);
    }

    return output;
}

/**
 * A tile.
 * @internal
 */
export class Tile
{
    private x: number;
    private y: number;
    private content: string[];
    private color: number[];
    private bcolor: number[];
    private writability: Protection;
    private protections: Protection[];
    private links: Link[] = new Array(128).fill(null);

    /**
     * Creates a new Tile from tile data.
     * @internal
     */
    public constructor(x: number, y: number, data: any)
    {
        this.x = x;
        this.y = y;

        if (data === null)
        {
            this.content = new Array(128).fill(" ");
            this.color = new Array(128).fill(0x000000);
            this.bcolor = new Array(128).fill(-1);
            this.writability = null;
            this.protections = new Array(128).fill(null);
        }
        else
        {
            this.content = advancedSplit(data.content);
            this.color = data.properties.color ?? new Array(128).fill(0x000000);
            this.bcolor = data.properties.bcolor ?? new Array(128).fill(-1);
            this.writability = data.properties.writability;
            this.protections = decodeProtection(data);

            if (!data.properties.cell_props) return;

            for (var cy in data.properties.cell_props)
            {
                for (var cx in data.properties.cell_props[cy])
                {
                    var link = data.properties.cell_props[cy][cx].link;
                    this.links[parseInt(cy) * 16 + parseInt(cx)] = link.type === "url" ? link.url : [link.link_tileX, link.link_tileY];
                }
            }
        }
    }


    /**
     * @returns This tile's X coordinate.
     * @internal
     */
    public getX(): number
    {
        return this.x;
    }

    /**
     * @returns This tile's Y coordinate.
     * @internal
     */
    public getY(): number
    {
        return this.y;
    }


    /**
     * Gets a character.
     * @param x - charX inside the tile.
     * @param y - charY inside the tile.
     * @internal
     */
    public getChar(x: number, y: number): Char
    {
        var i = y * 16 + x;
        var prot = this.protections[i];

        if (prot === null)
        {
            prot = this.writability;
        }

        return {
            char: this.content[i],
            color: this.color[i],
            bgColor: this.bcolor[i],
            protection: prot,
            link: this.links[i]
        };
    }
}

/**
 * A character.
 */
export interface Char
{
    /**
     * The character
     */
    char: string,

    /**
     * The color as an 0xRRGGBB integer.
     */
    color: number,
    
    /**
     * The background color as an 0xRRGGBB integer or -1 for none.
     */
    bgColor: number,

    /**
     * The protection. null = default, 0 = public, 1 = member-only, 2 = owner-only.
     */
    protection: Protection,
    
    /**
     * The link, if any, or null. String for URL links, two numbers in an array for coord links.
     */
    link: Link
}

/**
 * A link.
 * String for URL links, two numbers in an array for coord links, null for none.
 */
export type Link = string | number[] | null;

/**
 * A protection value.
 * null = default, 0 = public, 1 = member-only, 2 = owner-only.
 */
export type Protection = null | 0 | 1 | 2;