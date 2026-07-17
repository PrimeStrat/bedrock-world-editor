import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { redoEdit, massRedo } from "../actions/history.js";

const redoCommand = {
    definition: {
        name: "we:redo",
        description: "Redo your last undone edit, or the last <count>.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        optionalParameters: [{ type: CustomCommandParamType.Integer, name: "count" }]
    },
    handler(origin, count) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        const n = Math.max(1, Math.floor(count ?? 1));
        return toCommandResult(n === 1 ? redoEdit(player) : massRedo(player, n));
    }
};

export { redoCommand };
