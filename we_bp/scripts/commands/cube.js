import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { setBlocks } from "../actions/region.js";

const cubeCommand = {
    definition: {
        name: "we:cube",
        description: "Fill the selection box with a block. Skips air unless includeAir is true.",
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
        return toCommandResult(setBlocks(player, block.id, Boolean(includeAir), "Cube"));
    }
};

export { cubeCommand };
