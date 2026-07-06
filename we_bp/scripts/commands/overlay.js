import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { overlaySelection } from "../actions/region.js";

const overlayCommand = {
    definition: {
        name: "we:overlay",
        description: "Place a block on top of every column's surface in the selection.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.BlockType, name: "block" }]
    },
    handler(origin, block) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(overlaySelection(player, block.id));
    }
};

export { overlayCommand };
