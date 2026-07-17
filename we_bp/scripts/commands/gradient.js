import { system, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { startGradient, stopGradient, deleteGradient, listGradients } from "../actions/gradient.js";

const gradientCommand = {
    definition: {
        name: "we:gradient",
        description: "Palette tool: capture ordered layers from inventory.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Enum, name: "we:gradientaction" }],
        optionalParameters: [
            { type: CustomCommandParamType.String, name: "name" },
            { type: CustomCommandParamType.Enum, name: "we:gradienttype" },
            { type: CustomCommandParamType.Enum, name: "we:gradientinterp" }
        ]
    },
    handler(origin, action, name, type, interp) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        if (action === "list") {
            system.run(() => player.sendMessage(listGradients(player).message));
            return { status: CustomCommandStatus.Success };
        }
        if (action === "stop") {
            return toCommandResult(stopGradient(player));
        }
        if (name === undefined) {
            return toCommandResult({ ok: false, message: "§cUsage: /we:gradient " + action + " <name>" });
        }
        if (action === "start") {
            return toCommandResult(startGradient(player, name, type ?? "planar", interp ?? "linear"));
        }
        return toCommandResult(deleteGradient(player, name));
    }
};

export { gradientCommand };
