import { default as axios } from "axios";
import * as qs from "qs";

// TODO: uvias login stuff idk
export async function uviasLogin(username: string, password: string)
{
    var shit = await axios({
        method: "post",
        maxBodyLength: Infinity,
        url: "https://uvias.com/api/auth/uvias",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        data: qs.stringify({
            "service": "owot",
            "loginname": username,
            "pass": password,
            "persistent": "on"
        })
    });

    console.dir(shit.headers);
}

/**
 * Converts tile&char coords to char coords.
 * @example
 * var [x, y] = coordsTileToChar(tileX, tileY, charX, charY);
 */
export function coordsTileToChar(tileX: number, tileY: number, charX: number, charY: number): Array<number>
{
    return [tileX * 16 + charX, tileY * 8 + charY];
}

/**
 * Converts char coords to tile&char coords.
 * @example
 * var [tileX, tileY, charX, charY] = coordsCharToTile(x, y);
 */
export function coordsCharToTile(x: number, y: number): Array<number>
{
    return [Math.floor(x / 16), Math.floor(y / 8), x - Math.floor(x / 16) * 16, y - Math.floor(y / 8) * 8];
}

// 100% stolen from OWOT source code
export function advancedSplit(str: string | Array<string>, noSurrog?: boolean, noComb?: boolean, norm?: boolean)
{
	if(str && str.constructor == Array) return str.slice(0);
	var chars = [];
	var buffer = "";
	var surrogMode = false;
	var charMode = false;
	var combCount = 0;
	var combLimit = 15;
	for(var i = 0; i < str.length; i++) {
		var char = str[i];
		var code = char.charCodeAt(0);
		if(code >= 0xDC00 && code <= 0xDFFF) {
			if(surrogMode) {
				buffer += char;
			} else {
				buffer = "";
				chars.push("?");
			}
			surrogMode = false;
			combCount = 0;
			continue;
		} else if(surrogMode) {
			buffer = "";
			chars.push("?");
			surrogMode = false;
			continue;
		}
		if(!noSurrog && code >= 0xD800 && code <= 0xDBFF) {
			if(charMode) {
				chars.push(buffer);
			}
			charMode = true;
			surrogMode = true;
			buffer = char;
			continue;
		}
		if(!norm && ((code >= 0x0300 && code <= 0x036F) ||
		  (code >= 0x1DC0 && code <= 0x1DFF) ||
		  (code >= 0x20D0 && code <= 0x20FF) ||
		  (code >= 0xFE20 && code <= 0xFE2F))) {
			if(!noComb && charMode && combCount < combLimit) {
				buffer += char;
				combCount++;
			}
			continue;
		} else {
			if(charMode) {
				chars.push(buffer);
			}
			combCount = 0;
			charMode = true;
			buffer = char;
		}
	}
	if(buffer) {
		chars.push(buffer);
	}
	return chars;
}