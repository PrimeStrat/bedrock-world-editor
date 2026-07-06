import { system, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, notPlayer } from "./common.js";
import { getHistory } from "../session.js";

/**
 * Formats one history record as a single display line.
 * @param {object} record The edit record.
 * @param {number} now The current system tick.
 * @returns {string} The formatted line.
 */
function formatRecord(record, now) {
    const seconds = Math.max(0, Math.round((now - record.tick) / 20));
    return record.label + " §8(" + record.blocks + " blocks, " + seconds + "s ago)";
}

const historyCommand = {
    definition: { name: "we:history", description: "View your recent world-edit history.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        const now = system.currentTick;
        const { undo, redo } = getHistory(player.name);
        const lines = ["§6--- World Edit History ---"];
        if (undo.length === 0) {
            lines.push("§8No edits yet.");
        } else {
            lines.push("§eUndoable (newest first):");
            for (let i = 0; i < undo.length; i++) {
                lines.push("§7" + (i + 1) + ". §f" + formatRecord(undo[i], now));
            }
        }
        if (redo.length > 0) {
            lines.push("§eRedoable:");
            for (let i = 0; i < redo.length; i++) {
                lines.push("§7" + (i + 1) + ". §f" + formatRecord(redo[i], now));
            }
        }
        return { status: CustomCommandStatus.Success, message: lines.join("\n") };
    }
};

export { historyCommand };
