import { CommandPermissionLevel } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { clearClipboardAction } from "../actions/clipboard.js";

const clearClipboardCommand = {
    definition: { name: "we:clearclipboard", description: "Clear your clipboard and delete its saved structures.", permissionLevel: CommandPermissionLevel.Admin, cheatsRequired: false },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(clearClipboardAction(player));
    }
};

export { clearClipboardCommand };
