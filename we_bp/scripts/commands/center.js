import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { placeCenter } from "../actions/region.js";

const centerCommand = {
    definition: {
        name: "we:center",
        description: "Place a block at the center of the selection.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.BlockType, name: "block" }]
    },
    handler(origin, block) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(placeCenter(player, block.id));
    }
};

export { centerCommand };
