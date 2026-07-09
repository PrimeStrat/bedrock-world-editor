import { world, system, CommandPermissionLevel, CustomCommandStatus, Player } from "@minecraft/server";
import { getPlayer, notPlayer } from "./common.js";
import { getSession } from "../session.js";
import { debugSnapshot } from "../operations/debug.js";
import { WE_CONFIG } from "../config.js";

/**
 * Formats a block location as "x y z", or "unset" when null.
 * @param {{x: number, y: number, z: number}|null} loc The location.
 * @returns {string} The formatted location.
 */
function formatLoc(loc) {
    return loc ? loc.x + " " + loc.y + " " + loc.z : "unset";
}

/**
 * Sends the full world-edit debug report to a player: ticking-area manager
 * state, session state, current or last edit progress, recent ticking-area
 * events, and the active config values.
 * @param {Player} player The player to report to.
 * @returns {void}
 */
function sendDebugReport(player) {
    const now = system.currentTick;
    const lines = ["§6--- WE Debug ---"];
    const manager = world.tickingAreaManager;
    const areas = manager.getAllTickingAreas().map((area) => area.identifier).join(", ");
    lines.push("§eTicking§7: " + manager.chunkCount + "/" + manager.maxChunkCount + " chunks; areas: " + (areas || "none"));
    const session = getSession(player.name);
    lines.push("§eSession§7: busy=" + session.busy + ", pos1=" + formatLoc(session.pos1) + ", pos2=" + formatLoc(session.pos2) + ", undo=" + session.undo.length + ", redo=" + session.redo.length);
    const snapshot = debugSnapshot(player.name);
    if (snapshot.progress) {
        const p = snapshot.progress;
        const running = p.endTick === null;
        const elapsed = ((running ? now : p.endTick) - p.startTick) / 20;
        lines.push("§eEdit§7: \"" + p.label + "\" " + (running ? "§arunning" : "§8done") + "§7, " + p.blocks + " block(s), batches " + p.batchesOk + " ok / " + p.batchesSkipped + " skipped, " + elapsed.toFixed(1) + "s");
    } else {
        lines.push("§eEdit§7: none tracked yet");
    }
    if (snapshot.events.length > 0) {
        lines.push("§eTick areas (recent)§7:");
        for (const event of snapshot.events) {
            const ago = Math.round((now - event.tick) / 20);
            lines.push((event.ok ? "§a ok " : "§c fail ") + "§7" + event.detail + " (" + ago + "s ago)");
        }
    }
    lines.push("§eConfig§7: fillSlab=" + WE_CONFIG.fillSlab + ", span=" + WE_CONFIG.tickAreaChunkSpan + "ch, chunkLoadTicks=" + WE_CONFIG.chunkLoadTicks + ", capacityWaitTicks=" + WE_CONFIG.capacityWaitTicks + ", maxPatternBlocks=" + WE_CONFIG.maxPatternBlocks);
    player.sendMessage(lines.join("\n"));
}

const debugCommand = {
    definition: { name: "we:debug", description: "Show internals: ticking areas, progress, session state.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        system.run(() => {
            sendDebugReport(player);
        });
        return { status: CustomCommandStatus.Success };
    }
};

export { debugCommand };
