import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { undoEdit, massUndo } from "../actions/history.js";

const undoCommand = {
    definition: {
        name: "we:undo",
        description: "Undo your last edit, or the last <count> edits.",
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
        return toCommandResult(n === 1 ? undoEdit(player) : massUndo(player, n));
    }
};

export { undoCommand };
