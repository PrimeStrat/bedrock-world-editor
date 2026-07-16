import { world, system } from "@minecraft/server";

const MAX_EVENTS = 8;
const STATUS_INTERVAL_TICKS = 10;
const progress = new Map();
const events = new Map();
const lastStatusTick = new Map();

/**
 * @typedef {{label: string, blocks: number, batchesOk: number, batchesSkipped: number, startTick: number, endTick: number|null}} EditProgress
 * @typedef {{tick: number, ok: boolean, detail: string}} TickAreaEvent
 */

/**
 * Starts tracking a new edit job for a player, replacing the previous record.
 * @param {string} playerName The acting player's name.
 * @param {string} label The edit label.
 * @returns {void}
 */
function debugStart(playerName, label) {
    progress.set(playerName, { label, blocks: 0, batchesOk: 0, batchesSkipped: 0, startTick: system.currentTick, endTick: null });
}

/**
 * Shows a throttled action-bar status line to a player during a job.
 * @param {string} playerName The player's name.
 * @param {string} text The status text.
 * @returns {void}
 */
function debugStatus(playerName, text, force) {
    const now = system.currentTick;
    const last = lastStatusTick.get(playerName) ?? -STATUS_INTERVAL_TICKS;
    if (!force && now - last < STATUS_INTERVAL_TICKS) {
        return;
    }
    lastStatusTick.set(playerName, now);
    const player = world.getAllPlayers().find((p) => p.name === playerName);
    if (player) {
        player.onScreenDisplay.setActionBar(text);
    }
}

/**
 * Updates the running block count of a player's tracked edit and shows it on
 * the action bar.
 * @param {string} playerName The acting player's name.
 * @param {number} blocks The blocks placed so far.
 * @returns {void}
 */
function debugProgress(playerName, blocks) {
    const entry = progress.get(playerName);
    if (entry) {
        entry.blocks = blocks;
        debugStatus(playerName, "§7" + entry.label + ": §f" + blocks + "§7 block(s)...");
    }
}

/**
 * Shows a throttled "Processing..." action bar for a player's tracked edit,
 * used while a batch is loading chunks and no blocks are changing yet so the
 * edit does not look frozen.
 * @param {string} playerName The acting player's name.
 * @returns {void}
 */
function debugProcessing(playerName) {
    const entry = progress.get(playerName);
    const label = entry ? entry.label : "World edit";
    debugStatus(playerName, "§7" + label + ": §fProcessing§7...");
}

/**
 * Marks a player's tracked edit as finished.
 * @param {string} playerName The acting player's name.
 * @returns {void}
 */
function debugEnd(playerName) {
    const entry = progress.get(playerName);
    if (entry) {
        entry.endTick = system.currentTick;
    }
}

/**
 * Records the outcome of one ticking-area request, counting it against the
 * player's tracked edit and keeping a short recent-event log.
 * @param {string} playerName The acting player's name.
 * @param {boolean} ok Whether the area loaded.
 * @param {string} detail A short outcome description.
 * @returns {void}
 */
function debugTickArea(playerName, ok, detail) {
    const entry = progress.get(playerName);
    if (entry && entry.endTick === null) {
        if (ok) {
            entry.batchesOk += 1;
        } else {
            entry.batchesSkipped += 1;
        }
    }
    let list = events.get(playerName);
    if (!list) {
        list = [];
        events.set(playerName, list);
    }
    list.push({ tick: system.currentTick, ok, detail });
    if (list.length > MAX_EVENTS) {
        list.shift();
    }
}

/**
 * Returns a player's tracked edit and recent ticking-area events.
 * @param {string} playerName The player's name.
 * @returns {{progress: EditProgress|null, events: TickAreaEvent[]}} The debug snapshot.
 */
function debugSnapshot(playerName) {
    return {
        progress: progress.get(playerName) ?? null,
        events: (events.get(playerName) ?? []).slice()
    };
}

/**
 * Returns the number of skipped batches in the player's tracked edit.
 * @param {string} playerName The player's name.
 * @returns {number} The skipped batch count.
 */
function debugSkipped(playerName) {
    const entry = progress.get(playerName);
    return entry ? entry.batchesSkipped : 0;
}

export { debugStart, debugProgress, debugProcessing, debugEnd, debugTickArea, debugSnapshot, debugStatus, debugSkipped };
