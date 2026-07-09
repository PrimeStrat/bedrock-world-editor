import { CommandPermissionLevel, CustomCommandParamType } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { WE_CONFIG } from "../config.js";
import { runSmooth } from "../operations/smooth.js";
import { requireRegion } from "../actions/common.js";

const smoothCommand = {
    definition: {
        name: "we:smooth",
        description: "Smooth the selection surface. Mode: stable, melt, grow.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        optionalParameters: [
            { type: CustomCommandParamType.Integer, name: "strength" },
            { type: CustomCommandParamType.Enum, name: "we:smoothmode" }
        ]
    },
    handler(origin, strength, mode) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        const region = requireRegion(player);
        if (!region.ok) {
            return toCommandResult(region);
        }
        if (region.volume > WE_CONFIG.maxPatternBlocks) {
            return toCommandResult({ ok: false, message: "§cSmooth selection too large (max " + WE_CONFIG.maxPatternBlocks + ")." });
        }
        runSmooth(player, player.dimension, region.min, region.max, strength ?? 2, mode ?? "stable");
        return toCommandResult({ ok: true, message: "§aSmooth started..." });
    }
};

export { smoothCommand };
