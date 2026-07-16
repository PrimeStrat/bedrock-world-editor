import { system, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, notPlayer } from "./common.js";
import { openBrushMenu } from "../menu/mainMenu.js";

const brushesCommand = {
    definition: {
        name: "we:brushes",
        description: "Open the brush menu (brushes, terrain, saved items).",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false
    },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        system.run(() => {
            openBrushMenu(player);
        });
        return { status: CustomCommandStatus.Success };
    }
};

export { brushesCommand };
