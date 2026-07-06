import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { bindBrush, unbindBrush } from "../actions/brush.js";

/**
 * Builds a brush command entry.
 * @param {string} name The command name.
 * @param {boolean} usePattern When true, block accepts a pattern string.
 * @returns {object} The command entry.
 */
function brushVariant(name, usePattern) {
    return {
        definition: {
            name,
            description: "Bind a shape brush to your held tool (or an item id) using a block" + (usePattern ? " pattern (e.g. 50stone,50cobblestone)" : "") + ". Shape none unbinds.",
            permissionLevel: CommandPermissionLevel.Admin,
            cheatsRequired: false,
            mandatoryParameters: [{ type: CustomCommandParamType.Enum, name: "we:brushshape" }],
            optionalParameters: [
                { type: usePattern ? CustomCommandParamType.String : CustomCommandParamType.BlockType, name: "block" },
                { type: CustomCommandParamType.Integer, name: "radius" },
                { type: CustomCommandParamType.Integer, name: "height" },
                { type: CustomCommandParamType.String, name: "item" }
            ]
        },
        handler(origin, shape, block, radius, height, item) {
            const player = getPlayer(origin);
            if (!player) {
                return notPlayer();
            }
            if (shape === "none") {
                return toCommandResult(unbindBrush(player));
            }
            if (block === undefined || radius === undefined) {
                return toCommandResult({ ok: false, message: "§cProvide a block and radius, e.g. sphere stone 4." });
            }
            const kind = shape === "cylinder" || shape === "hcylinder" ? "cylinder" : "sphere";
            const hollow = shape === "hsphere" || shape === "hcylinder";
            return toCommandResult(bindBrush(player, kind, usePattern ? block : block.id, radius, height ?? radius, hollow, true, item ?? ""));
        }
    };
}

const brushCommand = brushVariant("we:brush", false);
const ebrushCommand = brushVariant("we:ebrush", true);

export { brushCommand, ebrushCommand };
