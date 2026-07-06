import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { replaceBlocks } from "../actions/region.js";

const replaceCommand = {
    definition: {
        name: "we:replace",
        description: "Replace one block with another inside the selection.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [
            { type: CustomCommandParamType.BlockType, name: "from" },
            { type: CustomCommandParamType.BlockType, name: "to" }
        ]
    },
    handler(origin, from, to) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(replaceBlocks(player, from.id, to.id));
    }
};

export { replaceCommand };
