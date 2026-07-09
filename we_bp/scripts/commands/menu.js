import { system, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, notPlayer } from "./common.js";
import { openMainMenu } from "../menu/mainMenu.js";

const menuCommand = {
    definition: { name: "we:menu", description: "Open the World Editor menu.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        system.run(() => {
            openMainMenu(player);
        });
        return { status: CustomCommandStatus.Success };
    }
};

export { menuCommand };
