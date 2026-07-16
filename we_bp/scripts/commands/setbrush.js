import { system, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, notPlayer } from "./common.js";
import { openSetBrushMenu } from "../menu/mainMenu.js";

const setBrushCommand = {
    definition: {
        name: "we:setbrush",
        description: "Open a menu to equip a saved brush on the World Brush.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false
    },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        system.run(() => {
            openSetBrushMenu(player);
        });
        return { status: CustomCommandStatus.Success };
    }
};

export { setBrushCommand };
