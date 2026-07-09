import { system, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, notPlayer } from "./common.js";
import { toggleLoopBrush } from "../actions/brush.js";

const loopBrushCommand = {
    definition: {
        name: "we:loopbrush",
        description: "Toggle looping the held tool every few ticks as you look.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false
    },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        system.run(() => {
            player.sendMessage(toggleLoopBrush(player).message);
        });
        return { status: CustomCommandStatus.Success };
    }
};

export { loopBrushCommand };
