import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { buildSelectionShell } from "../actions/region.js";

const wallsCommand = {
    definition: {
        name: "we:walls",
        description: "Build the four side walls of the selection. Skips air unless includeAir is true.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.BlockType, name: "block" }],
        optionalParameters: [{ type: CustomCommandParamType.Boolean, name: "includeAir" }]
    },
    handler(origin, block, includeAir) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(buildSelectionShell(player, block.id, Boolean(includeAir), "walls"));
    }
};

export { wallsCommand };
