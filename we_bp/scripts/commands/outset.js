import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { outsetSelection } from "../actions/selection.js";

const outsetCommand = {
    definition: {
        name: "we:outset",
        description: "Grow the selection on every axis.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Integer, name: "amount" }]
    },
    handler(origin, amount) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(outsetSelection(player, amount, false));
    }
};

export { outsetCommand };
