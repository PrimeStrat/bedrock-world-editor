import { system, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, notPlayer } from "./common.js";
import { openHistoryMenu } from "../menu/main_menu.js";

const historyCommand = {
    definition: { name: "we:history", description: "Open your world-edit history menu.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        system.run(() => {
            openHistoryMenu(player, 0);
        });
        return { status: CustomCommandStatus.Success };
    }
};

export { historyCommand };
