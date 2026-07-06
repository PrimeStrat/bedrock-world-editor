import { system, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, notPlayer } from "./common.js";
import { setBusy } from "../session.js";
import { cancelJobs } from "../operations/jobs.js";
import { releaseTickArea } from "../operations/ticking.js";
import { debugEnd } from "../operations/debug.js";

const cancelCommand = {
    definition: { name: "we:cancel", description: "Stop your running edit where it is. Does not undo the blocks already placed.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        system.run(() => {
            const count = cancelJobs(player.name);
            if (count === 0) {
                player.sendMessage("§cNothing is running.");
                return;
            }
            setBusy(player.name, false);
            releaseTickArea(player.name);
            debugEnd(player.name);
            player.sendMessage("§aCancelled §f" + count + "§a running job(s). Placed blocks stay; use /we:undo to revert the partial edit.");
        });
        return { status: CustomCommandStatus.Success };
    }
};

export { cancelCommand };
