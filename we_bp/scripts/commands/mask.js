import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { setBlockMask, setPresetMask, clearMask, maskStatus } from "../actions/mask.js";

const CLEAR_WORDS = ["off", "none", "clear"];

const maskCommand = {
    definition: {
        name: "we:mask",
        description: "Limit edits to given blocks. No arg shows the mask.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        optionalParameters: [{ type: CustomCommandParamType.String, name: "blocks" }]
    },
    handler(origin, blocks) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        const text = String(blocks ?? "").trim();
        if (text === "") {
            return toCommandResult(maskStatus(player));
        }
        if (CLEAR_WORDS.includes(text.toLowerCase())) {
            return toCommandResult(clearMask(player));
        }
        return toCommandResult(setBlockMask(player, text));
    }
};

const emaskCommand = {
    definition: {
        name: "we:emask",
        description: "Limit edits to a preset mask (all wool, foliage...).",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        mandatoryParameters: [{ type: CustomCommandParamType.Enum, name: "we:maskpreset" }]
    },
    handler(origin, preset) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        return toCommandResult(setPresetMask(player, preset));
    }
};

export { maskCommand, emaskCommand };
