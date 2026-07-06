import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { countBlocks } from "../actions/region.js";

const countCommand = {
    definition: {
        name: "we:count",
        description: "Count blocks of a type inside the selection.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.BlockType, name: "block" }]
    },
    handler(origin, block) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(countBlocks(player, block.id));
    }
};

export { countCommand };
