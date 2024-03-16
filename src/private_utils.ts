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