import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { buildSelectionShell } from "../actions/region.js";

const hcubeCommand = {
    definition: {
        name: "we:hcube",
        description: "Build a hollow box shell around the selection. Skips air unless includeAir is true.",
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
        return toCommandResult(buildSelectionShell(player, block.id, Boolean(includeAir), "faces"));
    }
};

export { hcubeCommand };
