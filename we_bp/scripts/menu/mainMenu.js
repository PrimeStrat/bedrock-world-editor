import { system, Player } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { getHistory } from "../session.js";
import { showChestMenu } from "./chest.js";
import { promptBlock, promptTwoBlocks, promptAmount, promptShape, promptBrush, promptGenerate, promptRadius, promptRotation, promptFlipAxis } from "./prompts.js";
import { setPositionHere, giveWand, deselect, selectionInfo, expandSelection, contractSelection, shiftSelection, outsetSelection } from "../actions/selection.js";
import { setBlocks, replaceBlocks, buildSelectionShell, hollowSelection, overlaySelection, countBlocks, moveRegion } from "../actions/region.js";
import { copyRegion, cutRegion, pasteRegionAction, stackRegion, rotateAction, flipAction, clearClipboardAction } from "../actions/clipboard.js";
import { buildSphere, buildCylinder, buildPyramid, generateShape } from "../actions/generation.js";
import { removeNear, drainNear, replaceNear } from "../actions/utility.js";
import { undoEdit, redoEdit, massUndo, massRedo, clearEditHistory } from "../actions/history.js";
import { goUp, unstuck, ascendDescend, goThru, jumpTo, goCeil } from "../actions/navigation.js";
import { bindBrush, unbindBrush, toolEntries } from "../actions/brush.js";
import { gradientEntries } from "../actions/gradient.js";

/**
 * Sends an action result message to a player when one is present.
 * @param {Player} player The player to message.
 * @param {{ok: boolean, message: string}} result The action result.
 * @returns {void}
 */
function report(player, result) {
    if (result.message) {
        player.sendMessage(result.message);
    }
}

/**
 * Opens the top-level World Editor chest menu.
 * @param {Player} player The player to show to.
 * @returns {Promise<void>} Resolves when the menu closes.
 */
async function openMainMenu(player) {
    await showChestMenu(player, "§8World Editor", [
        { slot: 2, icon: "textures/items/wood_axe", hover: "§e§lSelection§r\n§7Wand, positions, expand...", menu: true, run: (p) => openSelectionMenu(p) },
        { slot: 3, icon: "textures/items/diamond_pickaxe", hover: "§e§lRegion§r\n§7Set, replace, walls, move...", menu: true, run: (p) => openRegionMenu(p) },
        { slot: 4, icon: "textures/items/brick", hover: "§e§lGeneration§r\n§7Spheres, cylinders, pyramids", menu: true, run: (p) => openGenerationMenu(p) },
        { slot: 5, icon: "textures/items/paper", hover: "§e§lClipboard§r\n§7Copy, cut, paste, rotate...", menu: true, run: (p) => openClipboardMenu(p) },
        { slot: 6, icon: "textures/items/stick", hover: "§e§lBrushes§r\n§7Bind shapes to held items", menu: true, run: (p) => openBrushMenu(p) },
        { slot: 12, icon: "textures/items/bucket_water", hover: "§e§lUtility§r\n§7Remove near, drain...", menu: true, run: (p) => openUtilityMenu(p) },
        { slot: 13, icon: "textures/items/ender_pearl", hover: "§e§lNavigation§r\n§7Up, jump to, through walls...", menu: true, run: (p) => openNavigationMenu(p) },
        { slot: 14, icon: "textures/items/book_writable", hover: "§e§lHistory§r\n§7Edit list, undo, redo", menu: true, run: (p) => openHistoryMenu(p, 0) }
    ]);
}

/**
 * Opens the selection tools chest menu.
 * @param {Player} player The player to show to.
 * @returns {Promise<void>} Resolves when the menu closes.
 */
async function openSelectionMenu(player) {
    await showChestMenu(player, "§8Selection", [
        { slot: 10, icon: "textures/items/wood_axe", hover: "§e§lGet Wand§r\n§7Left-click pos1, right-click pos2", run: (p) => report(p, giveWand(p)) },
        { slot: 11, icon: "textures/items/redstone_dust", hover: "§e§lSet Pos1 Here§r\n§7Use your current location", run: (p) => report(p, setPositionHere(p, 1)) },
        { slot: 12, icon: "textures/items/glowstone_dust", hover: "§e§lSet Pos2 Here§r\n§7Use your current location", run: (p) => report(p, setPositionHere(p, 2)) },
        { slot: 13, icon: "textures/items/map_filled", hover: "§e§lSelection Size§r\n§7Dimensions and volume", run: (p) => report(p, selectionInfo(p)) },
        {
            slot: 14, icon: "textures/items/emerald", hover: "§e§lExpand...§r\n§7Grow the selection", run: async (p) => {
                const input = await promptAmount(p, "Expand Selection", "Amount", 128, true);
                if (input) {
                    report(p, expandSelection(p, input.amount, input.direction));
                }
            }
        },
        {
            slot: 15, icon: "textures/items/flint", hover: "§e§lContract...§r\n§7Shrink the selection", run: async (p) => {
                const input = await promptAmount(p, "Contract Selection", "Amount", 128, true);
                if (input) {
                    report(p, contractSelection(p, input.amount, input.direction));
                }
            }
        },
        {
            slot: 16, icon: "textures/items/minecart_normal", hover: "§e§lShift...§r\n§7Move the whole selection", run: async (p) => {
                const input = await promptAmount(p, "Shift Selection", "Amount", 128, true);
                if (input) {
                    report(p, shiftSelection(p, input.amount, input.direction));
                }
            }
        },
        {
            slot: 19, icon: "textures/items/slimeball", hover: "§e§lOutset...§r\n§7Grow on every axis", run: async (p) => {
                const input = await promptAmount(p, "Outset Selection", "Amount", 64, false);
                if (input) {
                    report(p, outsetSelection(p, input.amount, false));
                }
            }
        },
        {
            slot: 20, icon: "textures/items/magma_cream", hover: "§e§lInset...§r\n§7Shrink on every axis", run: async (p) => {
                const input = await promptAmount(p, "Inset Selection", "Amount", 64, false);
                if (input) {
                    report(p, outsetSelection(p, input.amount, true));
                }
            }
        },
        { slot: 21, icon: "textures/items/bucket_empty", hover: "§e§lClear Selection§r\n§7Forget both positions", run: (p) => report(p, deselect(p)) },
        { slot: 26, icon: "textures/items/dye_powder_red", hover: "§c§lBack", menu: true, run: (p) => openMainMenu(p) }
    ]);
}

/**
 * Opens the region operations chest menu.
 * @param {Player} player The player to show to.
 * @returns {Promise<void>} Resolves when the menu closes.
 */
async function openRegionMenu(player) {
    await showChestMenu(player, "§8Region", [
        {
            slot: 10, icon: "textures/items/clay_ball", hover: "§e§lSet...§r\n§7Fill the selection", run: async (p) => {
                const input = await promptBlock(p, "Set Blocks", true);
                if (input) {
                    report(p, setBlocks(p, input.blockId, input.includeAir, "Set"));
                }
            }
        },
        {
            slot: 11, icon: "textures/items/gold_ingot", hover: "§e§lReplace...§r\n§7Swap one block for another", run: async (p) => {
                const input = await promptTwoBlocks(p, "Replace Blocks");
                if (input) {
                    report(p, replaceBlocks(p, input.fromId, input.toId));
                }
            }
        },
        {
            slot: 12, icon: "textures/items/brick", hover: "§e§lWalls...§r\n§7Four side walls", run: async (p) => {
                const input = await promptBlock(p, "Build Walls", true);
                if (input) {
                    report(p, buildSelectionShell(p, input.blockId, input.includeAir, "walls"));
                }
            }
        },
        {
            slot: 13, icon: "textures/items/potion_bottle_empty", hover: "§e§lFaces...§r\n§7All six faces (hollow cube)", run: async (p) => {
                const input = await promptBlock(p, "Build Faces", true);
                if (input) {
                    report(p, buildSelectionShell(p, input.blockId, input.includeAir, "faces"));
                }
            }
        },
        { slot: 14, icon: "textures/items/bowl", hover: "§e§lHollow§r\n§7Carve out the interior", run: (p) => report(p, hollowSelection(p)) },
        {
            slot: 15, icon: "textures/items/wheat", hover: "§e§lOverlay...§r\n§7Blanket the surface", run: async (p) => {
                const input = await promptBlock(p, "Overlay Blocks", false);
                if (input) {
                    report(p, overlaySelection(p, input.blockId));
                }
            }
        },
        {
            slot: 16, icon: "textures/items/minecart_normal", hover: "§e§lMove...§r\n§7Move the region contents", run: async (p) => {
                const input = await promptAmount(p, "Move Region", "Distance", 128, true);
                if (input) {
                    report(p, moveRegion(p, input.amount, input.direction));
                }
            }
        },
        {
            slot: 19, icon: "textures/items/painting", hover: "§e§lStack...§r\n§7Repeat the selection", run: async (p) => {
                const input = await promptAmount(p, "Stack Region", "Copies", 64, true);
                if (input) {
                    report(p, stackRegion(p, input.amount, input.direction));
                }
            }
        },
        {
            slot: 20, icon: "textures/items/book_written", hover: "§e§lCount...§r\n§7Count a block type", run: async (p) => {
                const input = await promptBlock(p, "Count Blocks", false);
                if (input) {
                    report(p, countBlocks(p, input.blockId));
                }
            }
        },
        { slot: 26, icon: "textures/items/dye_powder_red", hover: "§c§lBack", menu: true, run: (p) => openMainMenu(p) }
    ]);
}

/**
 * Opens the clipboard chest menu.
 * @param {Player} player The player to show to.
 * @returns {Promise<void>} Resolves when the menu closes.
 */
async function openClipboardMenu(player) {
    await showChestMenu(player, "§8Clipboard", [
        { slot: 10, icon: "textures/items/paper", hover: "§e§lCopy§r\n§7Copy the selection", run: (p) => report(p, copyRegion(p)) },
        { slot: 11, icon: "textures/items/shears", hover: "§e§lCut§r\n§7Copy, then clear the selection", run: (p) => report(p, cutRegion(p)) },
        { slot: 12, icon: "textures/items/map_filled", hover: "§e§lPaste§r\n§7Paste at your location", run: (p) => report(p, pasteRegionAction(p, false)) },
        { slot: 13, icon: "textures/items/map_empty", hover: "§e§lPaste (skip air)§r\n§7Air will not overwrite blocks", run: (p) => report(p, pasteRegionAction(p, true)) },
        {
            slot: 14, icon: "textures/items/repeater", hover: "§e§lRotate...§r\n§7Rotate the next paste", run: async (p) => {
                const degrees = await promptRotation(p);
                if (degrees !== null) {
                    report(p, rotateAction(p, degrees));
                }
            }
        },
        {
            slot: 15, icon: "textures/items/feather", hover: "§e§lFlip...§r\n§7Mirror the next paste", run: async (p) => {
                const axis = await promptFlipAxis(p);
                if (axis !== null) {
                    report(p, flipAction(p, axis));
                }
            }
        },
        { slot: 16, icon: "textures/items/bucket_empty", hover: "§e§lClear Clipboard§r\n§7Delete the saved copy", run: (p) => report(p, clearClipboardAction(p)) },
        { slot: 26, icon: "textures/items/dye_powder_red", hover: "§c§lBack", menu: true, run: (p) => openMainMenu(p) }
    ]);
}

/**
 * Opens the shape generation chest menu.
 * @param {Player} player The player to show to.
 * @returns {Promise<void>} Resolves when the menu closes.
 */
async function openGenerationMenu(player) {
    await showChestMenu(player, "§8Generation", [
        {
            slot: 11, icon: "textures/items/snowball", hover: "§e§lSphere...§r\n§7Solid or hollow", run: async (p) => {
                const input = await promptShape(p, "Build Sphere", "Radius", 64, false);
                if (input) {
                    report(p, buildSphere(p, input.size, input.blockId, input.hollow, input.includeAir, null));
                }
            }
        },
        {
            slot: 12, icon: "textures/items/blaze_rod", hover: "§e§lCylinder...§r\n§7Solid or hollow tube", run: async (p) => {
                const input = await promptShape(p, "Build Cylinder", "Radius", 64, true);
                if (input) {
                    report(p, buildCylinder(p, input.size, input.height, input.blockId, input.hollow, input.includeAir, null));
                }
            }
        },
        {
            slot: 13, icon: "textures/items/gold_nugget", hover: "§e§lPyramid...§r\n§7Solid or hollow", run: async (p) => {
                const input = await promptShape(p, "Build Pyramid", "Size", 64, false);
                if (input) {
                    report(p, buildPyramid(p, input.size, input.blockId, input.hollow, input.includeAir));
                }
            }
        },
        {
            slot: 14, icon: "textures/items/quartz", hover: "§e§lGenerate...§r\n§7Shape from a math expression", run: async (p) => {
                const input = await promptGenerate(p);
                if (input) {
                    report(p, generateShape(p, input.expression, input.blockText));
                }
            }
        },
        { slot: 26, icon: "textures/items/dye_powder_red", hover: "§c§lBack", menu: true, run: (p) => openMainMenu(p) }
    ]);
}

/**
 * Opens the utility chest menu.
 * @param {Player} player The player to show to.
 * @returns {Promise<void>} Resolves when the menu closes.
 */
async function openUtilityMenu(player) {
    await showChestMenu(player, "§8Utility", [
        {
            slot: 11, icon: "textures/items/gold_pickaxe", hover: "§e§lRemove Near...§r\n§7Clear a block type around you", run: async (p) => {
                const input = await promptRadius(p, "Remove Near", true);
                if (input) {
                    report(p, removeNear(p, input.blockId, input.radius));
                }
            }
        },
        {
            slot: 13, icon: "textures/items/iron_shovel", hover: "§e§lReplace Near...§r\n§7Swap blocks around you", run: async (p) => {
                const radius = await promptRadius(p, "Replace Near Radius", false);
                if (!radius) {
                    return;
                }
                const blocks = await promptTwoBlocks(p, "Replace Near");
                if (blocks) {
                    report(p, replaceNear(p, radius.radius, blocks.fromId, blocks.toId));
                }
            }
        },
        {
            slot: 15, icon: "textures/items/bucket_water", hover: "§e§lDrain...§r\n§7Remove nearby liquids", run: async (p) => {
                const input = await promptRadius(p, "Drain Liquids", false);
                if (input) {
                    report(p, drainNear(p, input.radius));
                }
            }
        },
        { slot: 26, icon: "textures/items/dye_powder_red", hover: "§c§lBack", menu: true, run: (p) => openMainMenu(p) }
    ]);
}

/**
 * Opens the navigation chest menu.
 * @param {Player} player The player to show to.
 * @returns {Promise<void>} Resolves when the menu closes.
 */
async function openNavigationMenu(player) {
    await showChestMenu(player, "§8Navigation", [
        {
            slot: 10, icon: "textures/items/feather", hover: "§e§lUp...§r\n§7Rise with a glass platform", run: async (p) => {
                const input = await promptAmount(p, "Go Up", "Distance", 128, false);
                if (input) {
                    report(p, goUp(p, input.amount));
                }
            }
        },
        { slot: 11, icon: "textures/items/ender_pearl", hover: "§e§lJump To§r\n§7Teleport to your crosshair", run: (p) => report(p, jumpTo(p)) },
        { slot: 12, icon: "textures/items/ender_eye", hover: "§e§lThru§r\n§7Pass through the wall ahead", run: (p) => report(p, goThru(p)) },
        { slot: 13, icon: "textures/items/rabbit_foot", hover: "§e§lAscend§r\n§7Next platform above", run: (p) => report(p, ascendDescend(p, false)) },
        { slot: 14, icon: "textures/items/string", hover: "§e§lDescend§r\n§7Next platform below", run: (p) => report(p, ascendDescend(p, true)) },
        { slot: 15, icon: "textures/items/glowstone_dust", hover: "§e§lCeiling§r\n§7Up against the ceiling", run: (p) => report(p, goCeil(p)) },
        { slot: 16, icon: "textures/items/apple", hover: "§e§lUnstuck§r\n§7Escape from inside blocks", run: (p) => report(p, unstuck(p)) },
        { slot: 26, icon: "textures/items/dye_powder_red", hover: "§c§lBack", menu: true, run: (p) => openMainMenu(p) }
    ]);
}

/**
 * Opens the brush chest menu.
 * @param {Player} player The player to show to.
 * @returns {Promise<void>} Resolves when the menu closes.
 */
async function openBrushMenu(player) {
    await showChestMenu(player, "§8Brushes", [
        {
            slot: 11, icon: "textures/items/snowball", hover: "§e§lSphere Brush...§r\n§7Bind to a tool", run: async (p) => {
                const input = await promptBrush(p, "Sphere Brush", false);
                if (input) {
                    report(p, bindBrush(p, "sphere", input.blockText, input.radius, 1, input.hollow, input.includeAir, input.itemText));
                }
            }
        },
        {
            slot: 13, icon: "textures/items/blaze_rod", hover: "§e§lCylinder Brush...§r\n§7Bind to a tool", run: async (p) => {
                const input = await promptBrush(p, "Cylinder Brush", true);
                if (input) {
                    report(p, bindBrush(p, "cylinder", input.blockText, input.radius, input.height, input.hollow, input.includeAir, input.itemText));
                }
            }
        },
        { slot: 15, icon: "textures/items/bucket_empty", hover: "§e§lUnbind§r\n§7Remove the brush from your held tool", run: (p) => report(p, unbindBrush(p)) },
        { slot: 16, icon: "textures/items/book_normal", hover: "§e§lSaved Items§r\n§7View bound tools and gradients", menu: true, run: (p) => openSavedItemsForm(p) },
        { slot: 26, icon: "textures/items/dye_powder_red", hover: "§c§lBack", menu: true, run: (p) => openMainMenu(p) }
    ]);
}

/**
 * Opens a read-only form listing the player's bound tools and saved gradients
 * with their contents.
 * @param {Player} player The player to show to.
 * @returns {Promise<void>} Resolves when the form closes.
 */
async function openSavedItemsForm(player) {
    const tools = toolEntries(player);
    const gradients = gradientEntries(player);
    const lines = [];
    lines.push("§6Bound Tools");
    if (tools.length === 0) {
        lines.push("§7  none");
    } else {
        for (const tool of tools) {
            lines.push("§f  " + tool.item + " §7- §e" + tool.kind + " §7(" + tool.detail + ")");
        }
    }
    lines.push("");
    lines.push("§6Gradients");
    if (gradients.length === 0) {
        lines.push("§7  none");
    } else {
        for (const grad of gradients) {
            lines.push("§f  #" + grad.name + " §7- §b" + grad.pattern);
        }
    }
    const form = new ActionFormData().title("§8Saved Items").body(lines.join("\n")).button("§cClose");
    await form.show(player);
    await openBrushMenu(player);
}

const HISTORY_PAGE_SIZE = 18;

/**
 * Returns the chest icon for a history record's edit kind.
 * @param {object} record The edit record.
 * @returns {string} The icon texture path.
 */
function historyIcon(record) {
    if (record.kind === "group") {
        return "textures/items/book_writable";
    }
    if (record.kind === "box") {
        return "textures/items/clay_ball";
    }
    if (record.kind === "shape") {
        return "textures/items/snowball";
    }
    return "textures/items/paper";
}

/**
 * Opens the history chest menu: a paged list of the player's edits (newest
 * first, redoable edits marked) with undo, redo, and clear controls.
 * @param {Player} player The player to show to.
 * @param {number} page The zero-based page to show.
 * @returns {Promise<void>} Resolves when the menu closes.
 */
async function openHistoryMenu(player, page) {
    const now = system.currentTick;
    const history = getHistory(player.name);
    const records = [];
    for (const record of history.undo) {
        records.push({ record, redoable: false });
    }
    for (const record of history.redo) {
        records.push({ record, redoable: true });
    }
    const pages = Math.max(1, Math.ceil(records.length / HISTORY_PAGE_SIZE));
    const current = Math.min(Math.max(page, 0), pages - 1);
    const start = current * HISTORY_PAGE_SIZE;
    const slice = records.slice(start, start + HISTORY_PAGE_SIZE);
    const entries = [];
    const undoCount = history.undo.length;
    for (let i = 0; i < slice.length; i++) {
        const item = slice[i];
        const absolute = start + i;
        const seconds = Math.max(0, Math.round((now - item.record.tick) / 20));
        const state = item.redoable ? "§8(redoable)" : "§7#" + (absolute + 1);
        const action = item.redoable ? "§aClick to redo up to here" : "§aClick to undo up to here";
        entries.push({
            slot: i,
            icon: historyIcon(item.record),
            hover: "§e§l" + item.record.label + "§r\n§7" + item.record.blocks + " block(s), " + seconds + "s ago " + state + "\n" + action,
            menu: true,
            run: (pl) => {
                report(pl, item.redoable ? massRedo(pl, absolute - undoCount + 1) : massUndo(pl, absolute + 1));
                return openHistoryMenu(pl, 0);
            }
        });
    }
    if (records.length === 0) {
        entries.push({ slot: 4, icon: "textures/items/book_normal", hover: "§7No edits yet", menu: true, run: (pl) => openHistoryMenu(pl, 0) });
    }
    entries.push(current > 0
        ? { slot: 18, icon: "textures/items/dye_powder_green", hover: "§a§lPrevious Page", menu: true, run: (pl) => openHistoryMenu(pl, current - 1) }
        : { slot: 18, icon: "textures/items/dye_powder_red", hover: "§c§lBack", menu: true, run: (pl) => openMainMenu(pl) });
    entries.push({
        slot: 21, icon: "textures/items/book_normal", hover: "§e§lUndo§r\n§7Reverse your last edit", menu: true, run: (pl) => {
            report(pl, undoEdit(pl));
            return openHistoryMenu(pl, current);
        }
    });
    entries.push({
        slot: 22, icon: "textures/items/book_enchanted", hover: "§e§lRedo§r\n§7Re-apply your last undo", menu: true, run: (pl) => {
            report(pl, redoEdit(pl));
            return openHistoryMenu(pl, current);
        }
    });
    entries.push({
        slot: 23, icon: "textures/items/flint_and_steel", hover: "§e§lClear History§r\n§7Discard undo and redo", menu: true, run: (pl) => {
            report(pl, clearEditHistory(pl));
            return openHistoryMenu(pl, 0);
        }
    });
    if (start + HISTORY_PAGE_SIZE < records.length) {
        entries.push({ slot: 26, icon: "textures/items/dye_powder_green", hover: "§a§lNext Page", menu: true, run: (pl) => openHistoryMenu(pl, current + 1) });
    }
    await showChestMenu(player, "§8History " + (current + 1) + "/" + pages, entries);
}

export { openMainMenu, openHistoryMenu };
