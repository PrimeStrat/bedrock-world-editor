import { system, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, notPlayer } from "./common.js";
import { openBindMenu } from "../menu/mainMenu.js";

const bindCommand = {
    definition: {
        name: "we:bind",
        description: "Open the bind menu for gradients and brush configs.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false
    },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        system.run(() => {
            openBindMenu(player);
        });
        return { status: CustomCommandStatus.Success };
    }
};

export { bindCommand };
