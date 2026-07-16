import { GameMode, ItemStack, Player, PlayerPermissionLevel, system, world } from "@minecraft/server";
import { registerCommands } from "./commands/registry.js";
import { clearWorldEditStructures } from "./operations/undo.js";
import { setPos1, setPos2 } from "./session.js";
import { WE_CONFIG } from "./config.js";
import { beginStroke, endStroke } from "./actions/tools.js";
import { mirrorPlacement, mirrorBreak } from "./actions/symmetry.js";
import { isDrawMode, toggleTrace } from "./actions/draw.js";
import { selectionSizeSuffix } from "./actions/selection.js";
import { renderSelection } from "./actions/selectionRender.js";
import { openGuide } from "./menu/guide.js";

const GUIDE_ITEM = "we:guide";

const POS1_COOLDOWN_TICKS = 5;
const lastPos1Ticks = new Map();

/**
 * Returns whether an opped player is wielding the selection wand in creative
 * mode.
 * @param {Player} player The interacting player.
 * @param {ItemStack|undefined} itemStack The item used in the event.
 * @returns {boolean} True when the wand should act.
 */
function isWandUse(player, itemStack) {
    return Boolean(itemStack)
        && itemStack.typeId === WE_CONFIG.wandItemId
        && player.getGameMode() === GameMode.Creative
        && player.playerPermissionLevel === PlayerPermissionLevel.Operator;
}

system.beforeEvents.startup.subscribe(ev => {
    registerCommands(ev.customCommandRegistry);
});

world.afterEvents.worldLoad.subscribe(() => {
    clearWorldEditStructures();
});

world.beforeEvents.playerBreakBlock.subscribe(ev => {
    if (!isWandUse(ev.player, ev.itemStack)) {
        return;
    }
    ev.cancel = true;
    const player = ev.player;
    const tick = system.currentTick;
    const lastTick = lastPos1Ticks.get(player.name);
    if (lastTick !== undefined && tick - lastTick < POS1_COOLDOWN_TICKS) {
        return;
    }
    lastPos1Ticks.set(player.name, tick);
    const loc = ev.block.location;
    setPos1(player.name, loc);
    system.run(() => {
        player.sendMessage("§aPos1 set to §f" + loc.x + " " + loc.y + " " + loc.z + "§a." + selectionSizeSuffix(player.name));
    });
});

world.afterEvents.itemUse.subscribe(ev => {
    const player = ev.source;
    if (ev.itemStack && ev.itemStack.typeId === GUIDE_ITEM) {
        system.run(() => openGuide(player));
        return;
    }
    if (player.getGameMode() !== GameMode.Creative) return;
    if (isWandUse(player, ev.itemStack) && isDrawMode(player.name)) {
        toggleTrace(player);
    }
});

world.afterEvents.itemStartUse.subscribe(ev => {
    beginStroke(ev.source, ev.itemStack.typeId);
});

world.afterEvents.itemStopUse.subscribe(ev => {
    endStroke(ev.source.name);
});

world.afterEvents.itemReleaseUse.subscribe(ev => {
    endStroke(ev.source.name);
});

world.afterEvents.playerPlaceBlock.subscribe(ev => {
    mirrorPlacement(ev.player, ev.block);
});

world.afterEvents.playerBreakBlock.subscribe(ev => {
    mirrorBreak(ev.player, ev.block.location);
});

world.beforeEvents.playerInteractWithBlock.subscribe(ev => {
    if (!ev.isFirstEvent || !isWandUse(ev.player, ev.itemStack)) {
        return;
    }
    ev.cancel = true;
    const player = ev.player;
    const loc = ev.block.location;
    setPos2(player.name, loc);
    system.run(() => {
        player.sendMessage("§aPos2 set to §f" + loc.x + " " + loc.y + " " + loc.z + "§a." + selectionSizeSuffix(player.name));
    });
});
