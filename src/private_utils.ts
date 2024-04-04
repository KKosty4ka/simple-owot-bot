/**
 * Resolve a promise after a specified delay
 * @param ms The delay in ms.
 * @example
 * ```js
 * console.log("Hi!");
 * await sleep(10000);
 * console.log("Hi again after 10 seconds!");
 * ```
 * @internal
 */
export function sleep(ms: number): Promise<void>
{
    return new Promise((resolve, reject) =>
    {
        setTimeout(resolve, ms);
    });
}

/**
 * Split a string into an array of characters.
 * @param str - The string to split.
 * @returns The array of characters.
 * @remarks
 * 100% stolen from OWOT source code
 * @internal
 */
export function advancedSplit(str: string | string[], noSurrog?: boolean, noComb?: boolean, norm?: boolean): string[]
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