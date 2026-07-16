import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { saveBrushPreset } from "../actions/tools.js";

const brushCommand = {
    definition: {
        name: "we:brush",
        description: "Save+equip a named brush on the World Brush item.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [
            { type: CustomCommandParamType.String, name: "name" },
            { type: CustomCommandParamType.Enum, name: "we:brushtype" }
        ],
        optionalParameters: [
            { type: CustomCommandParamType.Enum, name: "we:brushshape" },
            { type: CustomCommandParamType.String, name: "block" },
            { type: CustomCommandParamType.Integer, name: "radius" },
            { type: CustomCommandParamType.Integer, name: "height" }
        ]
    },
    handler(origin, name, brushType, shape, block, radius, height) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        const shapeName = shape === "cylinder" || shape === "hcylinder" ? "cylinder" : "sphere";
        const hollow = shape === "hsphere" || shape === "hcylinder";
        const r = radius ?? 4;
        return toCommandResult(saveBrushPreset(player, name, brushType, shapeName, block ?? "stone", r, height ?? r, hollow));
    }
};

export { brushCommand };
