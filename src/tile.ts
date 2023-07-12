import { advancedSplit } from "./utils";

const b64table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function unshiftProtection(value: number): number | null
{
    if (value === 0) return null;
    else return value - 1;
}

function decodeProtection(tile: any): Array<number | null>
{
    var output = new Array(128).fill(tile.properties.writability);
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

export class Tile
{
    private x: number;
    private y: number;
    private content: Array<string>;
    private color: Array<number>;
    private bcolor: Array<number>;
    private protections: Array<number | null>;
    private links: Array<string | Array<number> | null> = new Array(128).fill(null);

    /**
     * Creates a new Tile from tile data.
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
            this.protections = new Array(128).fill(null);
        }
        else
        {
            this.content = advancedSplit(data.content);
            this.color = data.properties.color ?? new Array(128).fill(0x000000);
            this.bcolor = data.properties.bcolor ?? new Array(128).fill(-1);
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

        // TODO: coord links and maybe more shit
    }


    /**
     * @returns This tile's X coordinate.
     */
    public getX(): number
    {
        return this.x;
    }

    /**
     * @returns This tile's Y coordinate.
     */
    public getY(): number
    {
        return this.y;
    }

    
    /**
     * Gets a character.
     * @param x charX inside the tile.
     * @param y charY inside the tile.
     */
    public getChar(x: number, y: number): Char
    {
        var i = y * 16 + x;

        return {
            char: this.content[i],
            color: this.color[i],
            bgColor: this.bcolor[i],
            protection: this.protections[i],
            link: this.links[i]
        };
    }
}

export interface Char
{
    char: string,
    color: number,
    bgColor: number,
    protection: number | null,
    link: string | Array<number> | null
}