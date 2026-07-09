import { Player } from "@minecraft/server";

/**
 * Reads a JSON-encoded value from a player's dynamic properties.
 * @param {Player} player The owning player.
 * @param {string} key The property key.
 * @param {*} fallback The value returned when unset or unparsable.
 * @returns {*} The stored value, or the fallback.
 */
function loadPlayerData(player, key, fallback) {
    const raw = player.getDynamicProperty(key);
    if (typeof raw !== "string") {
        return fallback;
    }
    return JSON.parse(raw);
}

/**
 * Writes a JSON-encoded value to a player's dynamic properties, or clears it
 * when value is undefined.
 * @param {Player} player The owning player.
 * @param {string} key The property key.
 * @param {*} value The value to store, or undefined to clear.
 * @returns {void}
 */
function savePlayerData(player, key, value) {
    player.setDynamicProperty(key, value === undefined ? undefined : JSON.stringify(value));
}

export { loadPlayerData, savePlayerData };
