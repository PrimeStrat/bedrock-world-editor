import { system, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, notPlayer } from "./common.js";
import { toggleDrawMode } from "../actions/draw.js";

const drawCommand = {
    definition: {
        name: "we:draw",
        description: "Toggle draw mode. While on, click the wand to start tracing your view, then click again to set the selection to the traced area.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false
    },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        system.run(() => {
            player.sendMessage(toggleDrawMode(player).message);
        });
        return { status: CustomCommandStatus.Success };
    }
};

export { drawCommand };
