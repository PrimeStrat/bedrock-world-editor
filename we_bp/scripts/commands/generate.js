import { system, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, toCommandResult, notPlayer } from "./common.js";
import { generateShape } from "../actions/generation.js";
import { promptGenerate } from "../menu/prompts.js";

const generateCommand = {
    definition: {
        name: "we:generate",
        description: "Fill selection where an x,y,z expression is true.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false,
        optionalParameters: [
            { type: CustomCommandParamType.String, name: "expression" },
            { type: CustomCommandParamType.BlockType, name: "block" }
        ]
    },
    handler(origin, expression, block) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        if (expression === undefined) {
            system.run(async () => {
                const input = await promptGenerate(player);
                if (input) {
                    const result = generateShape(player, input.expression, input.blockText);
                    if (result.message) {
                        player.sendMessage(result.message);
                    }
                }
            });
            return { status: CustomCommandStatus.Success };
        }
        return toCommandResult(generateShape(player, expression, block ? block.id : "stone"));
    }
};

export { generateCommand };
