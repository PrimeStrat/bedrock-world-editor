import { world, system, BlockPermutation, Vector3 } from "@minecraft/server";
import { WE_CONFIG } from "./config.js";

/**
 * @typedef {{x: number, y: number, z: number}} Vec3
 * @typedef {{location: Vec3, before: BlockPermutation, after: BlockPermutation}} BlockChange
 * @typedef {{dimensionId: string, changes: BlockChange[], label: string, blocks: number, tick: number}} EditRecord
 * @typedef {{pos1: Vec3|null, pos2: Vec3|null, undo: EditRecord[], redo: EditRecord[], busy: boolean}} PlayerSession
 */

/** @type {Map<string, PlayerSession>} */
const sessions = new Map();

/**
 * Returns the world dynamic property key holding a player's saved selection.
 * @param {string} playerName The player's name.
 * @returns {string} The dynamic property key.
 */
function selectionKey(playerName) {
    return "we:sel:" + playerName;
}

/**
 * Saves a session's selection positions to a world dynamic property so the
 * selection survives restarts. Deferred a tick so it is safe from read-only
 * event and command contexts.
 * @param {string} playerName The player's name.
 * @param {PlayerSession} session The player's session.
 * @returns {void}
 */
function persistSelection(playerName, session) {
    const value = session.pos1 || session.pos2
        ? JSON.stringify({ pos1: session.pos1, pos2: session.pos2 })
        : undefined;
    system.run(() => {
        world.setDynamicProperty(selectionKey(playerName), value);
    });
}

/**
 * Loads a player's saved selection positions into a fresh session.
 * @param {string} playerName The player's name.
 * @param {PlayerSession} session The player's session.
 * @returns {void}
 */
function loadSelection(playerName, session) {
    const raw = world.getDynamicProperty(selectionKey(playerName));
    if (typeof raw === "string") {
        const saved = JSON.parse(raw);
        session.pos1 = saved.pos1 ?? null;
        session.pos2 = saved.pos2 ?? null;
    }
}

/**
 * Returns the session for a player, creating an empty one (with any saved
 * selection restored) when absent.
 * @param {string} playerName The player's name.
 * @returns {PlayerSession} The player's session.
 */
function getSession(playerName) {
    let session = sessions.get(playerName);
    if (!session) {
        session = { pos1: null, pos2: null, undo: [], redo: [], busy: false };
        loadSelection(playerName, session);
        sessions.set(playerName, session);
    }
    return session;
}

/**
 * Returns whether a large operation is currently running for a player.
 * @param {string} playerName The player's name.
 * @returns {boolean} True while an operation is in progress.
 */
function isBusy(playerName) {
    return getSession(playerName).busy;
}

/**
 * Sets the busy flag guarding against overlapping large operations.
 * @param {string} playerName The player's name.
 * @param {boolean} value Whether the player is busy.
 * @returns {void}
 */
function setBusy(playerName, value) {
    getSession(playerName).busy = Boolean(value);
}

/**
 * Stores a player's first selection position.
 * @param {string} playerName The player's name.
 * @param {Vec3} location The block location.
 * @returns {void}
 */
function setPos1(playerName, location) {
    const session = getSession(playerName);
    session.pos1 = location;
    persistSelection(playerName, session);
}

/**
 * Stores a player's second selection position.
 * @param {string} playerName The player's name.
 * @param {Vec3} location The block location.
 * @returns {void}
 */
function setPos2(playerName, location) {
    const session = getSession(playerName);
    session.pos2 = location;
    persistSelection(playerName, session);
}

/**
 * Returns a player's two selection positions.
 * @param {string} playerName The player's name.
 * @returns {{pos1: Vec3|null, pos2: Vec3|null}} The selection corners.
 */
function getSelection(playerName) {
    const session = getSession(playerName);
    return { pos1: session.pos1, pos2: session.pos2 };
}

/**
 * Clears both selection positions for a player.
 * @param {string} playerName The player's name.
 * @returns {void}
 */
function clearSelection(playerName) {
    const session = getSession(playerName);
    session.pos1 = null;
    session.pos2 = null;
    persistSelection(playerName, session);
}

/**
 * Empties a player's undo and redo stacks.
 * @param {string} playerName The player's name.
 * @returns {number} The number of records discarded.
 */
function clearHistory(playerName) {
    const session = getSession(playerName);
    const count = session.undo.length + session.redo.length;
    session.undo.length = 0;
    session.redo.length = 0;
    return count;
}

/**
 * Pushes a completed edit onto a player's undo stack and clears redo.
 * @param {string} playerName The player's name.
 * @param {EditRecord} record The edit record to remember.
 * @returns {void}
 */
function pushUndo(playerName, record) {
    const session = getSession(playerName);
    session.undo.push(record);
    if (session.undo.length > WE_CONFIG.undoDepth) {
        session.undo.shift();
    }
    session.redo.length = 0;
}

/**
 * Removes a specific record from a player's undo stack, used when a job
 * finishes with nothing to undo.
 * @param {string} playerName The player's name.
 * @param {EditRecord} record The record to remove.
 * @returns {void}
 */
function discardUndo(playerName, record) {
    const session = getSession(playerName);
    const index = session.undo.lastIndexOf(record);
    if (index !== -1) {
        session.undo.splice(index, 1);
    }
}

/**
 * Removes and returns up to count records from the top of the undo stack,
 * newest first, without touching redo.
 * @param {string} playerName The player's name.
 * @param {number} count How many records to take.
 * @returns {EditRecord[]} The removed records, newest first.
 */
function takeUndo(playerName, count) {
    const session = getSession(playerName);
    const records = [];
    for (let i = 0; i < count; i++) {
        const record = session.undo.pop();
        if (!record) {
            break;
        }
        records.push(record);
    }
    return records;
}

/**
 * Removes and returns up to count records from the top of the redo stack, in
 * replay order, without touching undo.
 * @param {string} playerName The player's name.
 * @param {number} count How many records to take.
 * @returns {EditRecord[]} The removed records, in replay order.
 */
function takeRedo(playerName, count) {
    const session = getSession(playerName);
    const records = [];
    for (let i = 0; i < count; i++) {
        const record = session.redo.pop();
        if (!record) {
            break;
        }
        records.push(record);
    }
    return records;
}

/**
 * Pushes a record onto the undo stack without clearing redo.
 * @param {string} playerName The player's name.
 * @param {EditRecord} record The record to push.
 * @returns {void}
 */
function pushUndoRecord(playerName, record) {
    const session = getSession(playerName);
    session.undo.push(record);
    if (session.undo.length > WE_CONFIG.undoDepth) {
        session.undo.shift();
    }
}

/**
 * Pushes a record onto the redo stack.
 * @param {string} playerName The player's name.
 * @param {EditRecord} record The record to push.
 * @returns {void}
 */
function pushRedoRecord(playerName, record) {
    const session = getSession(playerName);
    session.redo.push(record);
    if (session.redo.length > WE_CONFIG.undoDepth) {
        session.redo.shift();
    }
}

/**
 * Pops the most recent edit from a player's undo stack, moving it to redo.
 * @param {string} playerName The player's name.
 * @returns {EditRecord|null} The edit to reverse, or null when empty.
 */
function popUndo(playerName) {
    const session = getSession(playerName);
    const record = session.undo.pop();
    if (!record) {
        return null;
    }
    session.redo.push(record);
    if (session.redo.length > WE_CONFIG.undoDepth) {
        session.redo.shift();
    }
    return record;
}

/**
 * Pops the most recent reversed edit from redo, moving it back to undo.
 * @param {string} playerName The player's name.
 * @returns {EditRecord|null} The edit to re-apply, or null when empty.
 */
function popRedo(playerName) {
    const session = getSession(playerName);
    const record = session.redo.pop();
    if (!record) {
        return null;
    }
    session.undo.push(record);
    if (session.undo.length > WE_CONFIG.undoDepth) {
        session.undo.shift();
    }
    return record;
}

/**
 * Returns a player's undo and redo stacks for display, newest first.
 * @param {string} playerName The player's name.
 * @returns {{undo: EditRecord[], redo: EditRecord[]}} The history stacks.
 */
function getHistory(playerName) {
    const session = getSession(playerName);
    return {
        undo: session.undo.slice().reverse(),
        redo: session.redo.slice().reverse()
    };
}

export { getSession, setPos1, setPos2, getSelection, clearSelection, clearHistory, pushUndo, discardUndo, popUndo, popRedo, takeUndo, takeRedo, pushUndoRecord, pushRedoRecord, getHistory, isBusy, setBusy };
