import { system, ItemStack, CommandPermissionLevel, CustomCommandStatus } from "@minecraft/server";
import { getPlayer, notPlayer } from "./common.js";
import { openGuide } from "../menu/guide.js";

const GUIDE_ITEM = "we:guide";

const bookCommand = {
    definition: {
        name: "we:book",
        description: "Get the World Editor guide book and open it.",
        permissionLevel: CommandPermissionLevel.Admin,
        cheatsRequired: false
    },
    handler(origin) {
        const player = getPlayer(origin);
        if (!player) {
            return notPlayer();
        }
        system.run(() => {
            const inv = player.getComponent("minecraft:inventory");
            const container = inv ? inv.container : undefined;
            let has = false;
            if (container) {
                for (let i = 0; i < container.size; i++) {
                    const item = container.getItem(i);
                    if (item && item.typeId === GUIDE_ITEM) {
                        has = true;
                        break;
                    }
                }
                if (!has) {
                    container.addItem(new ItemStack(GUIDE_ITEM, 1));
                }
            }
            openGuide(player);
        });
        return { status: CustomCommandStatus.Success };
    }
};

export { bookCommand };
